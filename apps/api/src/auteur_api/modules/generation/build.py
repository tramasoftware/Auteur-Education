"""Course build orchestration (UF-06, BR-GEN-001..012).

One in-process background task per course. Modules are built in Blueprint order
and published atomically after research, writing, independent review, synthesis,
Knowledge Check and module audit. States exposed to the client are the real ones
recorded here (BR-GEN-007). Failures keep everything already published
(BR-GEN-010) and record a functional diagnostic.
"""

from __future__ import annotations

import logging

from auteur_api.ai.client import AIClient
from auteur_api.ai.stages import StageFailed, run_stage
from auteur_api.ai.tracing import now
from auteur_api.core.background import TaskRunner
from auteur_api.core.config import settings
from auteur_api.core.store import DemoStore
from auteur_api.modules.generation import prompts, validators
from auteur_api.modules.generation.prompts import BuildContext
from auteur_api.modules.generation.schemas import (
    CourseAuditOutput,
    CourseRecord,
    CourseState,
    CourseSynthesisOutput,
    EvidenceItem,
    KnowledgeCheckOutput,
    LessonRecord,
    LessonReviewOutput,
    LessonState,
    LessonWriteOutput,
    ModuleAuditOutput,
    ModuleRecord,
    ModuleState,
    ModuleSynthesisOutput,
    ResearchOutput,
)

logger = logging.getLogger("auteur_api.build")

MAX_RESEARCH_ROUNDS = 2
_active_builds: set[str] = set()


async def ensure_started(
    course_id: str, *, ai: AIClient, store: DemoStore, runner: TaskRunner
) -> None:
    """Start the build once (BR-GEN-012). Safe to call repeatedly."""
    course = store.get_course(course_id)
    if course.state != CourseState.QUEUED or course_id in _active_builds:
        return
    _active_builds.add(course_id)
    await runner.schedule(run_build(course_id, ai=ai, store=store))


async def run_build(course_id: str, *, ai: AIClient, store: DemoStore) -> None:
    course = store.get_course(course_id)
    ctx = _build_context(course, store)
    try:
        for module in course.modules:
            if module.state == ModuleState.NOT_BUILT:
                continue
            if module.state == ModuleState.PUBLISHED:
                continue  # never rebuilt (BR-GEN-012)
            published = await _build_module(course, module, ctx, ai=ai, store=store)
            if not published:
                _fail_course(
                    course,
                    f"Module {module.index} ({module.title}) could not be completed: "
                    f"{module.failure}. Everything already published was kept.",
                )
                return
            course.state = CourseState.PARTIALLY_AVAILABLE  # BR-GEN-005
            store.save_course(course)

        skipped = [m for m in course.modules if m.state == ModuleState.NOT_BUILT]
        if skipped:
            # DEC-007: the course cannot be Complete with unbuilt modules (BR-GEN-006).
            course.current_activity = (
                f"Demo build limit reached: {len(skipped)} planned module(s) were not "
                "generated."
            )
            store.save_course(course)
            return

        await _finish_course(course, ctx, ai=ai, store=store)
    except StageFailed as exc:
        _fail_course(course, _safe_stage_message(exc))
    except Exception:
        logger.exception("build_crashed course=%s", course_id)
        _fail_course(
            course,
            "An unexpected error interrupted the build. Published modules were kept.",
        )
    finally:
        _active_builds.discard(course_id)


def _build_context(course: CourseRecord, store: DemoStore) -> BuildContext:
    blueprint = store.get_blueprint(course.blueprint_id)
    version = next(
        v for v in blueprint.versions if v.version == course.blueprint_version
    )
    request = store.get_learning_request(course.request_id)
    objective = request.current_objective
    assert objective is not None
    return BuildContext(
        experience_level=request.inputs.experience_level.value,
        prior_knowledge=request.inputs.prior_knowledge,
        objective_statement=objective.objective.statement,
        achievement_criteria=objective.objective.achievement_criteria,
        visible=version.visible,
        internal=version.internal,
    )


def _set_activity(
    course: CourseRecord,
    module: ModuleRecord,
    stage_state: CourseState,
    text: str,
    store,
) -> None:
    if course.state != CourseState.PARTIALLY_AVAILABLE:
        course.state = stage_state
    course.current_activity = f"Module {module.index}: {text}"
    store.save_course(course)


def _fail_course(course: CourseRecord, message: str) -> None:
    course.state = CourseState.FAILED
    course.failure = message
    course.current_activity = None
    # store reference is the shared in-memory object; nothing else to persist.


def _safe_stage_message(exc: StageFailed) -> str:
    if exc.kind in ("provider", "unconfigured"):
        return (
            "The generation service became unavailable during the build. Published "
            "modules were kept; the build can be retried later."
        )
    return (
        f"Stage {exc.stage} did not produce a valid result for {exc.target} after the "
        "allowed attempts. Published modules were kept."
    )


# --- Module ---


async def _build_module(
    course: CourseRecord,
    module: ModuleRecord,
    ctx: BuildContext,
    *,
    ai: AIClient,
    store: DemoStore,
) -> bool:
    for lesson in module.lessons:
        if lesson.state == LessonState.APPROVED:
            continue
        ok = await _build_lesson(course, module, lesson, ctx, ai=ai, store=store)
        if not ok:
            module.state = ModuleState.FAILED
            module.failure = lesson.failure or f"Lesson {lesson.index} failed."
            store.save_course(course)
            return False

    module.state = ModuleState.REVIEWING
    _set_activity(course, module, CourseState.REVIEWING, "writing synthesis", store)
    scope = course.request_id
    synthesis = await run_stage(
        ai=ai,
        store=store,
        scope_id=scope,
        stage="AI-STG-12",
        target=f"module:{module.id}",
        prompt_version=prompts.MODULE_SYNTHESIS_V1,
        instructions=prompts.MODULE_SYNTHESIS_INSTRUCTIONS,
        input=prompts.module_synthesis_input(ctx, module),
        schema=ModuleSynthesisOutput,
        validate=validators.validate_synthesis,
        max_attempts=settings.generation_max_attempts,
    )

    _set_activity(
        course, module, CourseState.REVIEWING, "creating Knowledge Check", store
    )
    knowledge_check = await run_stage(
        ai=ai,
        store=store,
        scope_id=scope,
        stage="AI-STG-13",
        target=f"module:{module.id}",
        prompt_version=prompts.KNOWLEDGE_CHECK_V1,
        instructions=prompts.KNOWLEDGE_CHECK_INSTRUCTIONS,
        input=prompts.knowledge_check_input(ctx, module, synthesis.parsed.body),
        schema=KnowledgeCheckOutput,
        validate=validators.make_knowledge_check_validator(
            {lesson.title for lesson in module.lessons}
        ),
        max_attempts=settings.generation_max_attempts,
    )

    _set_activity(course, module, CourseState.REVIEWING, "auditing module", store)
    audit = await run_stage(
        ai=ai,
        store=store,
        scope_id=scope,
        stage="AI-STG-14",
        target=f"module:{module.id}",
        prompt_version=prompts.MODULE_AUDIT_V1,
        instructions=prompts.MODULE_AUDIT_INSTRUCTIONS,
        input=prompts.module_audit_input(
            ctx, module, synthesis.parsed.body, knowledge_check.parsed.model_dump_json()
        ),
        schema=ModuleAuditOutput,
        max_attempts=settings.generation_max_attempts,
    )
    module.audit = audit.parsed
    if audit.parsed.result != "Pass":
        # AI-QA-10: a module with Revise/Block is never published.
        module.state = ModuleState.FAILED
        module.failure = "Module audit did not pass: " + "; ".join(
            audit.parsed.issues[:3]
        )
        store.save_course(course)
        return False

    # BR-GEN-004: atomic publication of the complete module.
    module.synthesis = synthesis.parsed.body
    module.knowledge_check = knowledge_check.parsed
    module.published_at = now()
    module.state = ModuleState.PUBLISHED
    course.current_activity = None
    store.save_course(course)
    logger.info("module_published course=%s module=%s", course.id, module.id)
    return True


# --- Lesson ---


async def _build_lesson(
    course: CourseRecord,
    module: ModuleRecord,
    lesson: LessonRecord,
    ctx: BuildContext,
    *,
    ai: AIClient,
    store: DemoStore,
) -> bool:
    scope = course.request_id
    await _research(course, module, lesson, ctx, ai=ai, store=store, focus=None)

    review: LessonReviewOutput | None = None
    draft = None
    for attempt in range(1, settings.generation_max_attempts + 1):
        lesson.attempts = attempt
        lesson.state = LessonState.WRITING
        _set_activity(
            course, module, CourseState.WRITING, f"writing lesson {lesson.index}", store
        )
        written = await run_stage(
            ai=ai,
            store=store,
            scope_id=scope,
            stage="AI-STG-08/09",
            target=f"lesson:{lesson.id}:attempt{attempt}",
            prompt_version=prompts.WRITE_LESSON_V1,
            instructions=prompts.WRITE_LESSON_INSTRUCTIONS,
            input=prompts.write_lesson_input(
                ctx, module, lesson, previous_draft=draft, review=review
            ),
            schema=LessonWriteOutput,
            validate=validators.make_write_validator({e.ref for e in lesson.evidence}),
            max_attempts=settings.generation_max_attempts,
        )
        out: LessonWriteOutput = written.parsed
        draft = out.draft
        words = validators.word_count(draft)

        lesson.state = LessonState.REVIEWING
        _set_activity(
            course,
            module,
            CourseState.REVIEWING,
            f"reviewing lesson {lesson.index}",
            store,
        )
        reviewed = await run_stage(
            ai=ai,
            store=store,
            scope_id=scope,
            stage="AI-STG-10/11",
            target=f"lesson:{lesson.id}:attempt{attempt}",
            prompt_version=prompts.REVIEW_LESSON_V1,
            instructions=prompts.REVIEW_LESSON_INSTRUCTIONS,
            input=prompts.review_lesson_input(
                ctx, module, lesson, draft, word_count=words
            ),
            schema=LessonReviewOutput,
            validate=validators.validate_review,
            max_attempts=settings.generation_max_attempts,
        )
        review = reviewed.parsed
        _mark_qa(store, scope, lesson.id, attempt, review.result)

        if review.result == "Pass":
            # A valid version replaces the previous one only now.
            lesson.spec = out.spec
            lesson.draft = draft
            lesson.word_count = words
            lesson.review = review
            lesson.state = LessonState.APPROVED
            lesson.failure = None
            store.save_course(course)
            return True

        lesson.review = review
        if review.result == "Block":
            lesson.state = LessonState.FAILED
            lesson.failure = "Review blocked the lesson: " + "; ".join(
                review.issues[:3]
            )
            store.save_course(course)
            return False
        if review.result == "Research again":
            if lesson.research_rounds >= MAX_RESEARCH_ROUNDS:
                lesson.state = LessonState.FAILED
                lesson.failure = (
                    "Evidence remained insufficient after additional research."
                )
                store.save_course(course)
                return False
            focus = [
                c.text for c in review.claims if c.status == "Needs research"
            ] or review.issues
            await _research(
                course, module, lesson, ctx, ai=ai, store=store, focus=focus
            )
        # "Revise" (or after new research): loop into a focused repair.

    lesson.state = LessonState.FAILED
    lesson.failure = (
        f"The lesson did not pass review after {settings.generation_max_attempts} "
        "attempts."
    )
    store.save_course(course)
    return False


async def _research(
    course: CourseRecord,
    module: ModuleRecord,
    lesson: LessonRecord,
    ctx: BuildContext,
    *,
    ai: AIClient,
    store: DemoStore,
    focus: list[str] | None,
) -> None:
    lesson.state = LessonState.RESEARCHING
    lesson.research_rounds += 1
    _set_activity(
        course,
        module,
        CourseState.RESEARCHING,
        f"researching lesson {lesson.index}",
        store,
    )
    result = await run_stage(
        ai=ai,
        store=store,
        scope_id=course.request_id,
        stage="AI-STG-06/07",
        target=f"lesson:{lesson.id}:round{lesson.research_rounds}",
        prompt_version=prompts.RESEARCH_V1,
        instructions=prompts.RESEARCH_INSTRUCTIONS,
        input=prompts.research_input(ctx, module, lesson, focus_claims=focus),
        schema=ResearchOutput,
        validate=validators.make_research_validator(require_retrieved=True),
        web_search=True,
        search_context_size=settings.research_search_context_size,
        max_attempts=settings.generation_max_attempts,
    )
    out: ResearchOutput = result.parsed
    cited = {validators.normalize_url(c.url) for c in result.citations}
    retrieved_at = now()
    new_items: list[EvidenceItem] = []
    known_urls = {validators.normalize_url(e.url) for e in lesson.evidence}
    for item in out.evidence:
        if not validators.is_http_url(item.url):
            continue
        norm = validators.normalize_url(item.url)
        if norm in known_urls:
            continue
        known_urls.add(norm)
        new_items.append(
            EvidenceItem(
                **item.model_dump(),
                verification="retrieved" if norm in cited else "unverified",
                retrieved_at=retrieved_at,
            )
        )
    if focus:
        # Additional round: keep prior evidence, add new refs with a round prefix
        # to keep refs unique.
        existing_refs = {e.ref for e in lesson.evidence}
        for item in new_items:
            if item.ref in existing_refs:
                item.ref = f"R{lesson.research_rounds}-{item.ref}"
        lesson.evidence.extend(new_items)
    else:
        lesson.evidence = new_items
    lesson.research_questions = out.research_questions
    lesson.unresolved_claims = out.unresolved_claims
    store.save_course(course)


def _mark_qa(
    store: DemoStore, scope: str, lesson_id: str, attempt: int, result: str
) -> None:
    for trace in reversed(store.get_traces(scope)):
        if (
            trace.stage == "AI-STG-10/11"
            and trace.target == f"lesson:{lesson_id}:attempt{attempt}"
        ):
            trace.qa_result = result
            break


# --- Course completion ---


async def _finish_course(
    course: CourseRecord, ctx: BuildContext, *, ai: AIClient, store: DemoStore
) -> None:
    course.current_activity = "Writing final synthesis"
    store.save_course(course)
    synthesis = await run_stage(
        ai=ai,
        store=store,
        scope_id=course.request_id,
        stage="AI-STG-15",
        target=f"course:{course.id}",
        prompt_version=prompts.COURSE_SYNTHESIS_V1,
        instructions=prompts.COURSE_SYNTHESIS_INSTRUCTIONS,
        input=prompts.course_synthesis_input(ctx, course.modules),
        schema=CourseSynthesisOutput,
        validate=lambda r: (
            ["synthesis_too_short"] if len(r.parsed.body.split()) < 200 else []
        ),
        max_attempts=settings.generation_max_attempts,
    )
    course.current_activity = "Auditing course"
    store.save_course(course)
    audit = await run_stage(
        ai=ai,
        store=store,
        scope_id=course.request_id,
        stage="AI-STG-16",
        target=f"course:{course.id}",
        prompt_version=prompts.COURSE_AUDIT_V1,
        instructions=prompts.COURSE_AUDIT_INSTRUCTIONS,
        input=prompts.course_audit_input(ctx, course.modules, synthesis.parsed.body),
        schema=CourseAuditOutput,
        max_attempts=settings.generation_max_attempts,
    )
    course.course_audit = audit.parsed
    if audit.parsed.result != "Pass":
        # AI-QA-11: the course is not Complete; published modules stay available.
        course.current_activity = "Course audit did not pass: " + "; ".join(
            audit.parsed.issues[:3]
        )
        store.save_course(course)
        return
    course.final_synthesis = synthesis.parsed
    course.state = CourseState.COMPLETE  # BR-GEN-006
    course.completed_at = now()
    course.current_activity = None
    store.save_course(course)
