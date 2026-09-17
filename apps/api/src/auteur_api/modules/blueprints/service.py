"""Blueprint behavior (UF-04, BR-BLP-*, DEC-003, DEC-004).

Generation runs in the background; the client polls GET. Revisions create a new
complete version and keep the previous ones (BR-BLP-009). Approval requires the
exact current version (BR-BLP-010) and is idempotent (BR-GEN-012).
"""

from __future__ import annotations

import logging

from auteur_api.ai.client import AIClient
from auteur_api.ai.stages import StageFailed, run_stage
from auteur_api.ai.tracing import now
from auteur_api.core.background import TaskRunner
from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError, invalid_state
from auteur_api.core.store import DemoStore, new_id
from auteur_api.modules.blueprints import prompts
from auteur_api.modules.blueprints.schemas import (
    BlueprintOutput,
    BlueprintRecord,
    BlueprintState,
    BlueprintVersion,
)
from auteur_api.modules.onboarding.schemas import RequestState

logger = logging.getLogger("auteur_api.blueprints")

MIN_MODULES = 2  # BR-BLP-006
MIN_LESSONS_PER_MODULE = 2  # BR-BLP-007
REFERENCE_MODULE_RANGE = (4, 8)
REFERENCE_LESSON_RANGE = (3, 6)


def validate_blueprint(result) -> list[str]:  # noqa: ANN001
    out: BlueprintOutput = result.parsed
    visible, internal = out.visible, out.internal
    codes: list[str] = []
    modules = visible.modules
    if len(modules) < MIN_MODULES:
        codes.append("blueprint_too_few_modules")
    titles = [m.title.strip().lower() for m in modules]
    if len(set(titles)) != len(titles):
        codes.append("blueprint_module_titles_duplicated")  # AI-VAL-08
    lesson_titles: list[str] = []
    for module in modules:
        if len(module.lessons) < MIN_LESSONS_PER_MODULE:
            codes.append("blueprint_too_few_lessons")
            break
        lesson_titles += [lesson.title.strip().lower() for lesson in module.lessons]
    if len(set(lesson_titles)) != len(lesson_titles):
        codes.append("blueprint_lesson_titles_duplicated")

    deviates = (
        not REFERENCE_MODULE_RANGE[0] <= len(modules) <= REFERENCE_MODULE_RANGE[1]
    )
    for module in modules:
        if (
            not REFERENCE_LESSON_RANGE[0]
            <= len(module.lessons)
            <= (REFERENCE_LESSON_RANGE[1])
        ):
            deviates = True
    if deviates and not (internal.structure_deviation_reasons or "").strip():
        codes.append("blueprint_structure_deviation_unjustified")  # BR-BLP-006/007

    required_text = [
        visible.title,
        visible.objective_statement,
        visible.central_problem,
        visible.intellectual_arc,
        visible.order_justification,
        visible.length_justification,
        internal.materialist_justification,
    ]
    if any(not t.strip() for t in required_text):
        codes.append("blueprint_incomplete")  # AI-VAL-04
    if not internal.qa_criteria_per_module:
        codes.append("blueprint_missing_qa_criteria")
    if visible.estimates.modules != len(modules):
        codes.append("blueprint_estimates_inconsistent")
    return codes


async def start_blueprint(
    request_id: str, *, ai: AIClient, store: DemoStore, runner: TaskRunner
) -> BlueprintRecord:
    record = store.get_learning_request(request_id)
    if record.blueprint_id:
        existing = store.get_blueprint(record.blueprint_id)
        if existing.state != BlueprintState.FAILED:
            return existing  # idempotent: one Blueprint per request
        # Retry after a definitive failure without duplicating records.
        existing.state = BlueprintState.GENERATING
        existing.failure_message = None
        store.save_blueprint(existing)
        record.state = RequestState.BLUEPRINT_GENERATING
        store.save_learning_request(record)
        await runner.schedule(_generate_version(existing.id, ai=ai, store=store))
        return existing
    if (
        record.state != RequestState.PROPOSAL_SELECTED
        or not record.selected_proposal_id
    ):
        raise invalid_state("Select a proposal before generating the Blueprint.")
    if not settings.demo_commercial_bypass_enabled:
        # BR-BLP-001 / BR-SUB-003 / BR-CRD-005 are not implemented yet (DEC-003).
        raise invalid_state(
            "Blueprint generation requires an authenticated user with an active "
            "subscription. This is not available yet."
        )
    assert record.current_objective is not None

    blueprint = BlueprintRecord(
        id=new_id(),
        request_id=record.id,
        proposal_id=record.selected_proposal_id,
        objective_version=record.current_objective.version,
        state=BlueprintState.GENERATING,
        created_at=now(),
    )
    store.save_blueprint(blueprint)
    record.blueprint_id = blueprint.id
    record.state = RequestState.BLUEPRINT_GENERATING
    store.save_learning_request(record)
    await runner.schedule(_generate_version(blueprint.id, ai=ai, store=store))
    return blueprint


async def revise_blueprint(
    blueprint_id: str,
    feedback: str,
    *,
    ai: AIClient,
    store: DemoStore,
    runner: TaskRunner,
) -> BlueprintRecord:
    blueprint = store.get_blueprint(blueprint_id)
    if blueprint.state != BlueprintState.AWAITING_APPROVAL:
        raise invalid_state(
            "Changes can only be requested while the Blueprint awaits approval."
        )
    blueprint.state = BlueprintState.GENERATING
    blueprint.pending_feedback = feedback.strip()
    blueprint.approved_version = None  # BR-BLP-009: revision invalidates approval
    store.save_blueprint(blueprint)
    request = store.get_learning_request(blueprint.request_id)
    request.state = RequestState.BLUEPRINT_GENERATING
    store.save_learning_request(request)
    await runner.schedule(_generate_version(blueprint.id, ai=ai, store=store))
    return blueprint


def approve_blueprint(blueprint_id: str, version: int, *, store: DemoStore) -> str:
    """Approve the exact current version and return the course (build) id."""
    blueprint = store.get_blueprint(blueprint_id)
    current = blueprint.current
    if blueprint.state == BlueprintState.APPROVED and blueprint.course_id:
        if version == blueprint.approved_version:
            return blueprint.course_id  # BR-GEN-012: no duplicate builds
        raise ApiError(
            "stale_version",
            "A different version of this Blueprint was already approved.",
        )
    if blueprint.state != BlueprintState.AWAITING_APPROVAL or current is None:
        raise invalid_state("The Blueprint is not ready for approval.")
    if version != current.version:
        raise ApiError(
            "stale_version",
            "The Blueprint changed since you last saw it. Please review the current "
            "version before approving.",
        )
    if not settings.demo_commercial_bypass_enabled:
        raise invalid_state("Course generation requires an active subscription.")

    from auteur_api.modules.generation.service import create_course_for_blueprint

    course = create_course_for_blueprint(blueprint, current, store=store)
    blueprint.state = BlueprintState.APPROVED
    blueprint.approved_version = current.version
    blueprint.course_id = course.id
    store.save_blueprint(blueprint)
    request = store.get_learning_request(blueprint.request_id)
    request.state = RequestState.APPROVED
    request.course_id = course.id
    store.save_learning_request(request)
    return course.id


async def _generate_version(
    blueprint_id: str, *, ai: AIClient, store: DemoStore
) -> None:
    blueprint = store.get_blueprint(blueprint_id)
    request = store.get_learning_request(blueprint.request_id)
    assert request.proposal_set is not None and request.current_objective is not None
    proposal = next(
        p for p in request.proposal_set.proposals if p.id == blueprint.proposal_id
    )
    previous = blueprint.current
    feedback = blueprint.pending_feedback
    try:
        result = await run_stage(
            ai=ai,
            store=store,
            scope_id=request.id,
            stage="AI-STG-05",
            target=f"blueprint:{blueprint.id}:v{len(blueprint.versions) + 1}",
            prompt_version=prompts.GENERATE_BLUEPRINT_V1,
            instructions=prompts.GENERATE_BLUEPRINT_INSTRUCTIONS,
            input=prompts.generate_blueprint_input(
                request.inputs,
                request.current_objective.objective,
                proposal,
                previous_visible_json=(
                    previous.visible.model_dump_json(indent=1) if previous else None
                ),
                feedback=feedback,
            ),
            schema=BlueprintOutput,
            validate=validate_blueprint,
            web_search=settings.blueprint_web_search,
            search_context_size="low",
            max_attempts=settings.generation_max_attempts,
        )
    except StageFailed as exc:
        logger.warning("blueprint_failed id=%s kind=%s", blueprint.id, exc.kind)
        if previous is not None:
            # An invalid output never replaces a valid previous version.
            blueprint.state = BlueprintState.AWAITING_APPROVAL
            blueprint.failure_message = (
                "We could not produce the requested revision. The previous version "
                "is still available; you can try again with different feedback."
            )
        else:
            blueprint.state = BlueprintState.FAILED
            blueprint.failure_message = (
                "We could not generate the Blueprint. Your objective and selected "
                "proposal were kept; please try again."
            )
        blueprint.pending_feedback = None
        store.save_blueprint(blueprint)
        request.state = RequestState.PROPOSAL_SELECTED
        if previous is not None:
            request.state = RequestState.AWAITING_APPROVAL
        store.save_learning_request(request)
        return

    blueprint.versions.append(
        BlueprintVersion(
            version=len(blueprint.versions) + 1,
            visible=result.parsed.visible,
            internal=result.parsed.internal,
            feedback=feedback,
            created_at=now(),
        )
    )
    blueprint.pending_feedback = None
    blueprint.failure_message = None
    blueprint.state = BlueprintState.AWAITING_APPROVAL
    store.save_blueprint(blueprint)
    request.state = RequestState.AWAITING_APPROVAL
    store.save_learning_request(request)
