"""Blueprint behavior (UF-04, BR-BLP-*, DEC-003, DEC-004, DEC-022).

Generation runs in the background; the client polls GET. A valid version is
confirmed by the system and starts one build (BR-BLP-010, BR-GEN-012). Learner
revision is not part of the current journey.
"""

from __future__ import annotations

import logging

from auteur_api.ai.client import AIClient
from auteur_api.ai.stages import StageFailed, run_stage
from auteur_api.ai.tracing import now
from auteur_api.core.background import TaskRunner
from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError, invalid_state
from auteur_api.core.store import Store, new_id
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

    # --- Strict structure-deviation check (BR-BLP-006/007) — restore after demo ---
    # deviates = (
    #     not REFERENCE_MODULE_RANGE[0] <= len(modules) <= REFERENCE_MODULE_RANGE[1]
    # )
    # for module in modules:
    #     if (
    #         not REFERENCE_LESSON_RANGE[0]
    #         <= len(module.lessons)
    #         <= (REFERENCE_LESSON_RANGE[1])
    #     ):
    #         deviates = True
    # if deviates and not (internal.structure_deviation_reasons or "").strip():
    #     codes.append("blueprint_structure_deviation_unjustified")

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
    request_id: str, *, ai: AIClient, store: Store, runner: TaskRunner
) -> BlueprintRecord:
    record = store.get_learning_request(request_id)
    if record.blueprint_id:
        existing = store.get_blueprint(record.blueprint_id)
        if (
            existing.state == BlueprintState.AWAITING_APPROVAL
            and existing.current is not None
        ):
            # A version saved before DEC-022, or a confirm that did not finish.
            # Generating the course confirms it. There is no review route.
            await _confirm_and_start(existing, ai=ai, store=store, runner=runner)
            return store.get_blueprint(existing.id)
        if existing.state != BlueprintState.FAILED:
            return existing  # idempotent: one Blueprint per request
        # Retry after a definitive failure without duplicating records.
        existing.state = BlueprintState.GENERATING
        existing.failure_message = None
        store.save_blueprint(existing)
        record.state = RequestState.BLUEPRINT_GENERATING
        store.save_learning_request(record)
        await runner.schedule(
            _generate_version(existing.id, ai=ai, store=store, runner=runner)
        )
        return existing
    if (
        record.state != RequestState.PROPOSAL_SELECTED
        or not record.selected_proposal_id
    ):
        raise invalid_state("Select a proposal before generating the Blueprint.")
    if not settings.demo_commercial_bypass_enabled:
        # BR-BLP-001 / BR-SUB-003 / BR-CRD-005. The switch stays open until a
        # subscription check can succeed (DEC-003).
        raise invalid_state(
            "Blueprint generation requires an authenticated user with an active "
            "subscription. This is not available yet."
        )
    assert record.current_objective is not None

    blueprint = BlueprintRecord(
        id=new_id(),
        user_id=record.user_id,
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
    await runner.schedule(
        _generate_version(blueprint.id, ai=ai, store=store, runner=runner)
    )
    return blueprint


async def revise_blueprint(
    blueprint_id: str,
    feedback: str,
    *,
    ai: AIClient,
    store: Store,
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
    await runner.schedule(
        _generate_version(blueprint.id, ai=ai, store=store, runner=runner)
    )
    return blueprint


def approve_blueprint(blueprint_id: str, version: int, *, store: Store) -> str:
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

    from auteur_api.modules.generation.service import (
        active_build_course_id,
        create_course_for_blueprint,
    )

    other_active = active_build_course_id(store, blueprint.user_id)
    if other_active is not None:
        raise invalid_state(
            "A course is already being generated. Follow that build before "
            "starting another."
        )

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


async def _confirm_and_start(
    blueprint: BlueprintRecord, *, ai: AIClient, store: Store, runner: TaskRunner
) -> None:
    """DEC-022: confirm the version just saved and start its build."""
    current = blueprint.current
    if current is None:
        return
    from auteur_api.modules.generation import build

    try:
        course_id = approve_blueprint(blueprint.id, current.version, store=store)
    except ApiError:
        logger.exception("blueprint_confirm_failed id=%s", blueprint.id)
        blueprint.state = BlueprintState.FAILED
        blueprint.failure_message = (
            "We could not start the course from this Blueprint. Your objective and "
            "selected proposal were kept; please try again."
        )
        store.save_blueprint(blueprint)
        request = store.get_learning_request(blueprint.request_id)
        if request.course_id is None:
            request.state = RequestState.PROPOSAL_SELECTED
            store.save_learning_request(request)
        return
    await build.ensure_started(course_id, ai=ai, store=store, runner=runner)


async def _generate_version(
    blueprint_id: str, *, ai: AIClient, store: Store, runner: TaskRunner
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
            prompt_version=prompts.GENERATE_BLUEPRINT_V2,
            instructions=prompts.GENERATE_BLUEPRINT_INSTRUCTIONS,
            input=prompts.generate_blueprint_input(
                request.inputs,
                request.current_objective.objective,
                proposal,
                learning_orientation=request.interpretation.learning_orientation,
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
    await _confirm_and_start(blueprint, ai=ai, store=store, runner=runner)
