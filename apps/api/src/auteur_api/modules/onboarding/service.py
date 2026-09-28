"""Learning request behavior: create, precise, formulate/confirm/revise objective.

Business rules enforced here (server-side, BR-*):
- BR-ONB-001/002: non-English input is rejected, nothing is persisted.
- BR-OBJ-001: compatibility is classified before anything else.
- BR-OBJ-004: an incompatible request cannot continue.
- BR-OBJ-006/007: precision only when needed, 2-5 options.
- BR-OBJ-008/009: the objective expresses an intellectual capability and invents no
  deliverables.
- BR-OBJ-010/011: explicit confirmation; each change creates a new version and
  invalidates dependent results (proposals, selection).
"""

from __future__ import annotations

import re

from auteur_api.ai.client import AIClient, StructuredResult
from auteur_api.ai.stages import StageFailed, run_stage
from auteur_api.ai.tracing import now
from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError, invalid_state, not_found
from auteur_api.core.store import DemoStore, new_id
from auteur_api.modules.onboarding import prompts
from auteur_api.modules.onboarding.schemas import (
    CreateLearningRequest,
    Interpretation,
    LearningObjectiveOutput,
    LearningRequestInputs,
    LearningRequestRecord,
    ObjectiveVersion,
    PrecisionOption,
    PrecisionResult,
    PrecisionSelectionRequest,
    RequestAnalysisOutput,
    RequestState,
    SelectedPrecision,
)

CAPABILITY_VERBS = (
    "understand",
    "distinguish",
    "explain",
    "compare",
    "analyze",
    "analyse",
    "evaluate",
    "recognize",
    "recognise",
    "interpret",
    "assess",
    "identify",
    "trace",
    "situate",
    "relate",
    "reason",
    "justify",
)

# BR-OBJ-009: deliverables the MVP does not support must not appear as outcomes.
UNSUPPORTED_DELIVERABLES = re.compile(
    r"\b(essay|essays|project|projects|portfolio|presentation|slide deck|upload|"
    r"submit|assignment|capstone|exam)\b",
    re.IGNORECASE,
)


def stage_failure(exc: StageFailed) -> ApiError:
    if exc.kind in ("provider", "unconfigured"):
        return ApiError(
            "provider_unavailable",
            "The generation service is temporarily unavailable. Your confirmed "
            "information was kept; please try again in a moment.",
        )
    return ApiError(
        "generation_failed",
        "We could not produce a valid result for this step. Your confirmed "
        "information was kept; please try again or adjust your input.",
    )


# --- Validators (programmatic, return stable codes) ---


def validate_analysis(result: StructuredResult[RequestAnalysisOutput]) -> list[str]:
    out = result.parsed
    codes: list[str] = []
    precision = out.precision
    if out.compatibility.classification == "Incompatible" and precision.needs_precision:
        codes.append("precision_not_allowed_for_incompatible")
    if precision.needs_precision:
        if not 2 <= len(precision.options) <= 5:
            codes.append("precision_options_count")
        titles = {o.title.strip().lower() for o in precision.options}
        if len(titles) != len(precision.options):
            codes.append("precision_options_duplicated")
    elif precision.options:
        codes.append("precision_options_without_need")
    if (
        out.compatibility.classification == "Allowed with reframing"
        and not out.compatibility.safe_reframing
    ):
        codes.append("reframing_missing")
    if not out.compatibility.explanation.strip():
        codes.append("compatibility_explanation_missing")
    return codes


def validate_objective(result: StructuredResult[LearningObjectiveOutput]) -> list[str]:
    out = result.parsed
    codes: list[str] = []
    text = f"{out.statement} {out.observable_capability}".lower()
    if not any(verb in text for verb in CAPABILITY_VERBS):
        codes.append("objective_missing_intellectual_capability")  # BR-OBJ-008
    outcome_text = f"{out.statement}\n{out.observable_capability}"
    if UNSUPPORTED_DELIVERABLES.search(outcome_text):
        codes.append("objective_invents_deliverable")  # BR-OBJ-009
    if not out.achievement_criteria:
        codes.append("objective_missing_achievement_criteria")
    if not out.statement.strip() or not out.learning_object.strip():
        codes.append("objective_incomplete")
    return codes


# --- Behavior ---


async def create_learning_request(
    payload: CreateLearningRequest, *, ai: AIClient, store: DemoStore
) -> LearningRequestRecord:
    inputs = LearningRequestInputs(
        initial_intent=payload.initial_intent.strip(),
        experience_level=payload.experience_level,
        prior_knowledge=(payload.prior_knowledge or "").strip() or None,
        expected_outcome=payload.expected_outcome.strip(),
    )
    request_id = new_id()
    try:
        result = await run_stage(
            ai=ai,
            store=store,
            scope_id=request_id,
            stage="AI-STG-01/02",
            target=f"learning_request:{request_id}",
            prompt_version=prompts.ANALYZE_REQUEST_V1,
            instructions=prompts.ANALYZE_REQUEST_INSTRUCTIONS,
            input=prompts.analyze_request_input(inputs),
            schema=RequestAnalysisOutput,
            validate=validate_analysis,
            max_attempts=settings.generation_max_attempts,
        )
    except StageFailed as exc:
        raise stage_failure(exc) from exc

    analysis = result.parsed
    if not analysis.input_is_english:
        # BR-ONB-001/002: ask for an English rewrite; keep nothing.
        raise ApiError(
            "non_english_input",
            "Auteur currently works in English only. Please rewrite your intention "
            "and expected outcome in English. Nothing was saved.",
        )

    record = LearningRequestRecord(
        id=request_id,
        created_at=now(),
        state=RequestState.DRAFT,
        inputs=inputs,
        interpretation=Interpretation(
            interpreted_intention=analysis.interpreted_intention,
            learning_domain=analysis.learning_domain,
            explicitly_stated=analysis.explicitly_stated,
            reasonably_inferred=analysis.reasonably_inferred,
            ambiguities=analysis.ambiguities,
        ),
        compatibility=analysis.compatibility,
        precision=PrecisionResult(
            needs_precision=analysis.precision.needs_precision,
            reason=analysis.precision.reason,
            options=[
                PrecisionOption(id=new_id()[:8], **option.model_dump())
                for option in analysis.precision.options
            ],
            allows_free_text=analysis.precision.allows_free_text,
        ),
    )

    if record.compatibility.classification == "Incompatible":
        record.state = RequestState.INCOMPATIBLE  # BR-OBJ-004
    elif record.precision.needs_precision:
        record.state = RequestState.PRECISION_REQUIRED
    else:
        await _formulate_objective(record, ai=ai, store=store, feedback=None)

    store.save_learning_request(record)
    return record


async def apply_precision(
    request_id: str,
    payload: PrecisionSelectionRequest,
    *,
    ai: AIClient,
    store: DemoStore,
) -> LearningRequestRecord:
    record = store.get_learning_request(request_id)
    if record.state not in (
        RequestState.PRECISION_REQUIRED,
        RequestState.OBJECTIVE_CONFIRMATION,
    ):
        raise invalid_state(
            "The learning object can only be chosen before the objective is confirmed."
        )
    if not record.precision.needs_precision:
        raise invalid_state("This request does not need a learning-object precision.")
    if bool(payload.option_id) == bool(payload.free_text):
        raise ApiError(
            "validation_error", "Provide either option_id or free_text, not both."
        )

    if payload.option_id:
        option = next(
            (o for o in record.precision.options if o.id == payload.option_id), None
        )
        if option is None:
            raise not_found("Precision option")
        selection = SelectedPrecision(
            option_id=option.id, free_text=None, learning_object=option.title
        )
    else:
        if not record.precision.allows_free_text:
            raise invalid_state(
                "Free-text precision is not available for this request."
            )
        assert payload.free_text is not None
        selection = SelectedPrecision(
            option_id=None,
            free_text=payload.free_text.strip(),
            learning_object=payload.free_text.strip(),
        )

    # BR-ONB-008: changing the precision invalidates dependent results.
    record.selected_precision = selection
    record.objective_versions = []
    _invalidate_dependents(record)
    await _formulate_objective(record, ai=ai, store=store, feedback=None)
    store.save_learning_request(record)
    return record


def confirm_objective(
    request_id: str, version: int, *, store: DemoStore
) -> LearningRequestRecord:
    record = store.get_learning_request(request_id)
    current = record.current_objective
    if current is None or record.state == RequestState.INCOMPATIBLE:
        raise invalid_state("There is no objective to confirm for this request.")
    if version != current.version:
        raise ApiError(
            "stale_version",
            "The objective was updated since you last saw it. Please review the "
            "current version before confirming.",
        )
    if record.state == RequestState.OBJECTIVE_CONFIRMATION:
        current.confirmed = True
        record.state = RequestState.OBJECTIVE_CONFIRMED  # BR-OBJ-010
        store.save_learning_request(record)
        return record
    if current.confirmed:
        return record  # idempotent
    raise invalid_state("The objective cannot be confirmed in the current state.")


async def revise_objective(
    request_id: str, feedback: str, *, ai: AIClient, store: DemoStore
) -> LearningRequestRecord:
    record = store.get_learning_request(request_id)
    if record.state not in (
        RequestState.OBJECTIVE_CONFIRMATION,
        RequestState.OBJECTIVE_CONFIRMED,
        RequestState.PROPOSALS_READY,
        RequestState.PROPOSAL_SELECTED,
    ):
        raise invalid_state(
            "The objective can no longer be revised once a Blueprint exists."
        )
    # BR-OBJ-011: new version, dependents invalidated.
    _invalidate_dependents(record)
    await _formulate_objective(record, ai=ai, store=store, feedback=feedback.strip())
    store.save_learning_request(record)
    return record


def _invalidate_dependents(record: LearningRequestRecord) -> None:
    record.proposal_set = None
    record.selected_proposal_id = None


async def _formulate_objective(
    record: LearningRequestRecord,
    *,
    ai: AIClient,
    store: DemoStore,
    feedback: str | None,
) -> None:
    previous = record.current_objective
    try:
        result = await run_stage(
            ai=ai,
            store=store,
            scope_id=record.id,
            stage="AI-STG-03",
            target=f"learning_request:{record.id}",
            prompt_version=prompts.FORMULATE_OBJECTIVE_V1,
            instructions=prompts.FORMULATE_OBJECTIVE_INSTRUCTIONS,
            input=prompts.formulate_objective_input(
                record.inputs,
                compatibility_classification=record.compatibility.classification,
                safe_reframing=record.compatibility.safe_reframing,
                learning_object=(
                    record.selected_precision.learning_object
                    if record.selected_precision
                    else None
                ),
                previous_statement=previous.objective.statement if previous else None,
                feedback=feedback,
            ),
            schema=LearningObjectiveOutput,
            validate=validate_objective,
            max_attempts=settings.generation_max_attempts,
        )
    except StageFailed as exc:
        raise stage_failure(exc) from exc

    for version in record.objective_versions:
        version.confirmed = False
    record.objective_versions.append(
        ObjectiveVersion(
            version=len(record.objective_versions) + 1,
            objective=result.parsed,
            confirmed=False,
            feedback=feedback,
            created_at=now(),
        )
    )
    record.state = RequestState.OBJECTIVE_CONFIRMATION
