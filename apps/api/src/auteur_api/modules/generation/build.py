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
from auteur_api.core.errors import invalid_state
from auteur_api.core.store import Store
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
    stored_lesson_draft,
)

logger = logging.getLogger("auteur_api.build")

MAX_RESEARCH_ROUNDS = 2
_active_builds: set[str] = set()


async def resume_incomplete_builds(
    *, ai: AIClient, store: Store, runner: TaskRunner
) -> None:
    """Re-schedule non-terminal builds after process restart (DEC-013)."""
    for course_id in store.list_incomplete_course_ids():
        try:
            await ensure_started(course_id, ai=ai, store=store, runner=runner)
        except Exception:
            logger.exception("startup_resume_failed course=%s", course_id)


async def ensure_started(
    course_id: str,
    *,
    ai: AIClient,
    store: Store,
    runner: TaskRunner,
    force: bool = False,
) -> None:
    """Start or resume the build once (BR-GEN-012). Safe to call repeatedly."""
    course = store.get_course(course_id)
    if course_id in _active_builds or course.state == CourseState.COMPLETE:
        return
    if not force and not course_needs_build(course):
        return
    _active_builds.add(course_id)
    await runner.schedule(run_build(course_id, ai=ai, store=store))


async def retry_failed_build(
    course_id: str, *, ai: AIClient, store: Store, runner: TaskRunner
) -> CourseRecord:
    """Start one new generation of the unfinished course from the same Blueprint.

    Published modules are kept (BR-GEN-010). A second call while the build is
    running does not create another course (BR-GEN-012).
    """
    course = store.get_course(course_id)
    if course.state == CourseState.COMPLETE:
        raise invalid_state("This course is already complete. Open it to keep reading.")
    if course.state != CourseState.FAILED:
        return course
    prepare_retry(course)
    store.save_course(course)
    await ensure_started(course_id, ai=ai, store=store, runner=runner, force=True)
    return store.get_course(course_id)


def course_needs_build(course: CourseRecord) -> bool:
    """True when unpublished, buildable modules remain (DEC-013)."""
    if course.state in {CourseState.COMPLETE, CourseState.FAILED}:
        return False
    return any(
        module.state not in {ModuleState.PUBLISHED, ModuleState.NOT_BUILT}
        for module in course.modules
    )


async def run_build(course_id: str, *, ai: AIClient, store: Store) -> None:
    course = store.get_course(course_id)
    if course.started_at is None:
        course.started_at = now()
        store.save_course(course)
    ctx = _build_context(course, store)
    try:
        for module in course.modules:
            if module.state == ModuleState.NOT_BUILT:
                continue
            if module.state == ModuleState.PUBLISHED:
                continue  # never rebuilt (BR-GEN-012)
            published = await _build_module(course, module, ctx, ai=ai, store=store)
            if not published:
                if module.failure and "audit" in module.failure.lower():
                    reason = "the module did not pass review."
                else:
                    lesson = next(
                        (
                            item
                            for item in module.lessons
                            if item.state == LessonState.FAILED
                        ),
                        None,
                    )
                    reason = (
                        _lesson_stop_reason(lesson)
                        if lesson is not None
                        else "the module could not be completed."
                    )
                _fail_course(course, _learner_failure(course, module, reason), store)
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
        logger.warning(
            "build_failed course=%s stage=%s kind=%s",
            course_id,
            exc.stage,
            exc.kind,
        )
        _fail_course(
            course,
            _learner_failure(course, _module_in_progress(course), _stage_reason(exc)),
            store,
        )
    except Exception:
        logger.exception("build_crashed course=%s", course_id)
        _fail_course(
            course,
            _learner_failure(
                course,
                _module_in_progress(course),
                "something interrupted the build.",
            ),
            store,
        )
    finally:
        _active_builds.discard(course_id)


def _build_context(course: CourseRecord, store: Store) -> BuildContext:
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


def _fail_course(course: CourseRecord, message: str, store: Store) -> None:
    course.state = CourseState.FAILED
    course.failure = message
    course.current_activity = None
    store.save_course(course)


def _preserved_sentence(course: CourseRecord) -> str:
    """BR-GEN-010: say what remains readable. Unpublished modules stay closed."""
    published = [m for m in course.modules if m.state == ModuleState.PUBLISHED]
    if not published:
        return "No incomplete module was published."
    if len(published) == 1:
        return (
            f"Module {published[0].index} is published and can be read. "
            "It was not removed."
        )
    indexes = [str(m.index) for m in published]
    if len(indexes) == 2:
        listed = f"{indexes[0]} and {indexes[1]}"
    else:
        listed = ", ".join(indexes[:-1]) + f", and {indexes[-1]}"
    return f"Modules {listed} are published and can be read. They were not removed."


def _learner_failure(
    course: CourseRecord, module: ModuleRecord | None, what: str
) -> str:
    if module is not None:
        lead = f"We could not finish module {module.index}: {what}"
    else:
        lead = f"We could not finish the course: {what}"
    return f"{lead} {_preserved_sentence(course)}"


def _module_in_progress(course: CourseRecord) -> ModuleRecord | None:
    for module in course.modules:
        if module.state not in {ModuleState.PUBLISHED, ModuleState.NOT_BUILT}:
            return module
    return None


def _stage_reason(exc: StageFailed) -> str:
    if exc.kind in ("provider", "unconfigured"):
        return "the generation service became unavailable."
    reasons = {
        "AI-STG-06/07": (
            "the research did not leave sources we can write from honestly."
        ),
        "AI-STG-08/09": "the lesson could not be written in a form we can publish.",
        "AI-STG-10/11": "the lesson did not pass review.",
        "AI-STG-12": "the module synthesis could not be completed.",
        "AI-STG-13": "the knowledge check could not be completed.",
        "AI-STG-14": "the module did not pass review.",
        "AI-STG-15": "the final synthesis could not be completed.",
        "AI-STG-16": "the course did not pass review.",
    }
    return reasons.get(exc.stage, "the build could not be completed.")


def _lesson_stop_reason(lesson: LessonRecord) -> str:
    text = lesson.failure or ""
    if "insufficient" in text.lower() or "evidence" in text.lower():
        return "the research did not leave sources we can write from honestly."
    if "blocked" in text.lower():
        return "the lesson could not be published as an honest account of the subject."
    if "review" in text.lower():
        return "the lesson did not reach the standard required to publish it."
    return "the lesson could not be completed."


def _reset_unpublished_module(module: ModuleRecord) -> None:
    """Drop an unfinished module's generation so a retry starts it again."""
    module.state = ModuleState.QUEUED
    module.synthesis = None
    module.knowledge_check = None
    module.audit = None
    module.published_at = None
    module.failure = None
    for lesson in module.lessons:
        lesson.state = LessonState.QUEUED
        lesson.attempts = 0
        lesson.research_rounds = 0
        lesson.evidence = []
        lesson.research_questions = []
        lesson.unresolved_claims = []
        lesson.spec = None
        lesson.draft = None
        lesson.word_count = 0
        lesson.review = None
        lesson.failure = None


def prepare_retry(course: CourseRecord) -> None:
    """Reset unpublished modules on a failed course. Published modules stay."""
    for module in course.modules:
        if module.state in {ModuleState.PUBLISHED, ModuleState.NOT_BUILT}:
            continue
        _reset_unpublished_module(module)
    course.state = CourseState.QUEUED
    course.failure = None
    course.current_activity = None


# --- Module ---


async def _build_module(
    course: CourseRecord,
    module: ModuleRecord,
    ctx: BuildContext,
    *,
    ai: AIClient,
    store: Store,
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
    store: Store,
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
        draft = stored_lesson_draft(out.draft)
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
    store: Store,
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
    store: Store, scope: str, lesson_id: str, attempt: int, result: str
) -> None:
    store.set_trace_qa_result(
        scope,
        stage="AI-STG-10/11",
        target=f"lesson:{lesson_id}:attempt{attempt}",
        attempt=attempt,
        qa_result=result,
    )


# --- Course completion ---


async def _finish_course(
    course: CourseRecord, ctx: BuildContext, *, ai: AIClient, store: Store
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
