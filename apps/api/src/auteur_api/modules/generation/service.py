"""Course records: creation from an approved Blueprint and read views.

Reads only expose published modules (BR-GEN-004/005). Build orchestration lives
in `build.py`.
"""

from __future__ import annotations

from auteur_api.ai.tracing import now, summarize
from auteur_api.core.config import settings
from auteur_api.core.errors import invalid_state, not_found
from auteur_api.core.store import DemoStore, new_id
from auteur_api.modules.blueprints.schemas import BlueprintRecord, BlueprintVersion
from auteur_api.modules.generation.schemas import (
    CourseDiagnosticsResponse,
    CourseRecord,
    CourseResponse,
    LessonDiagnostics,
    LessonRecord,
    LessonResponse,
    LessonSummary,
    ModuleDiagnostics,
    ModuleRecord,
    ModuleResponse,
    ModuleState,
    ModuleSummary,
    SourceView,
)


def create_course_for_blueprint(
    blueprint: BlueprintRecord, version: BlueprintVersion, *, store: DemoStore
) -> CourseRecord:
    visible = version.visible
    criteria_by_title = {
        c.module_title.strip().lower(): c.criteria
        for c in version.internal.qa_criteria_per_module
    }
    modules = [
        ModuleRecord(
            id=new_id()[:10],
            index=m_index,
            title=planned.title,
            function=planned.function,
            guiding_questions=planned.guiding_questions,
            outcome=planned.outcome,
            qa_criteria=criteria_by_title.get(planned.title.strip().lower(), []),
            lessons=[
                LessonRecord(
                    id=new_id()[:10],
                    index=l_index,
                    title=lesson.title,
                    purpose=lesson.purpose,
                )
                for l_index, lesson in enumerate(planned.lessons, start=1)
            ],
        )
        for m_index, planned in enumerate(visible.modules, start=1)
    ]
    limit = settings.generation_max_modules
    if limit is not None:
        for module in modules[limit:]:
            module.state = ModuleState.NOT_BUILT
    course = CourseRecord(
        id=new_id(),
        request_id=blueprint.request_id,
        blueprint_id=blueprint.id,
        blueprint_version=version.version,
        title=visible.title,
        subtitle=visible.subtitle,
        objective_statement=visible.objective_statement,
        modules=modules,
        module_limit=limit,
        created_at=now(),
    )
    store.save_course(course)
    return course


# --- Views ---


def course_view(course: CourseRecord) -> CourseResponse:
    return CourseResponse(
        id=course.id,
        request_id=course.request_id,
        blueprint_id=course.blueprint_id,
        blueprint_version=course.blueprint_version,
        title=course.title,
        subtitle=course.subtitle,
        objective_statement=course.objective_statement,
        state=course.state,
        current_activity=course.current_activity,
        modules=[
            ModuleSummary(
                id=m.id,
                index=m.index,
                title=m.title,
                function=m.function,
                state=m.state,
                lesson_count=len(m.lessons),
                published_at=m.published_at,
            )
            for m in course.modules
        ],
        final_synthesis=course.final_synthesis,
        failure=course.failure,
        module_limit=course.module_limit,
    )


def _sources(lessons: list[LessonRecord]) -> list[SourceView]:
    seen: set[str] = set()
    views: list[SourceView] = []
    for lesson in lessons:
        used = set(lesson.draft.sources_used_refs) if lesson.draft else set()
        for item in lesson.evidence:
            if item.ref not in used or item.url in seen:
                continue
            seen.add(item.url)
            views.append(
                SourceView(
                    ref=item.ref,
                    url=item.url,
                    title=item.title,
                    author_or_institution=item.author_or_institution,
                    date=item.date,
                    source_type=item.source_type,
                    role=item.role,
                    verification=item.verification,
                )
            )
    return views


def get_module(course: CourseRecord, module_id: str) -> ModuleRecord:
    module = next((m for m in course.modules if m.id == module_id), None)
    if module is None:
        raise not_found("Module")
    return module


def published_module(course: CourseRecord, module_id: str) -> ModuleRecord:
    module = get_module(course, module_id)
    if module.state != ModuleState.PUBLISHED:
        raise invalid_state("This module is not published yet.")
    return module


def module_view(course: CourseRecord, module: ModuleRecord) -> ModuleResponse:
    return ModuleResponse(
        id=module.id,
        course_id=course.id,
        index=module.index,
        title=module.title,
        function=module.function,
        guiding_questions=module.guiding_questions,
        outcome=module.outcome,
        state=module.state,
        lessons=[
            LessonSummary(
                id=lesson.id,
                index=lesson.index,
                title=lesson.title,
                purpose=lesson.purpose,
                word_count=lesson.word_count,
            )
            for lesson in module.lessons
        ],
        synthesis=module.synthesis,
        knowledge_check=module.knowledge_check,
        sources=_sources(module.lessons),
        published_at=module.published_at,
    )


def lesson_view(
    course: CourseRecord, module: ModuleRecord, lesson_id: str
) -> LessonResponse:
    position = next(
        (i for i, lesson in enumerate(module.lessons) if lesson.id == lesson_id), None
    )
    if position is None:
        raise not_found("Lesson")
    lesson = module.lessons[position]
    assert lesson.draft is not None  # published modules only contain approved lessons
    previous_id = module.lessons[position - 1].id if position > 0 else None
    next_id = (
        module.lessons[position + 1].id if position + 1 < len(module.lessons) else None
    )
    return LessonResponse(
        id=lesson.id,
        course_id=course.id,
        module_id=module.id,
        index=lesson.index,
        title=lesson.draft.title or lesson.title,
        purpose=lesson.purpose,
        sections=lesson.draft.sections,
        sources=_sources([lesson]),
        word_count=lesson.word_count,
        previous_lesson_id=previous_id,
        next_lesson_id=next_id,
    )


def diagnostics_view(
    course: CourseRecord, *, store: DemoStore
) -> CourseDiagnosticsResponse:
    blueprint = store.get_blueprint(course.blueprint_id)
    version = next(
        v for v in blueprint.versions if v.version == course.blueprint_version
    )
    traces = store.get_traces(course.request_id)
    return CourseDiagnosticsResponse(
        course_id=course.id,
        state=course.state,
        model=settings.openai_model,
        blueprint_internal=version.internal,
        modules=[
            ModuleDiagnostics(
                id=m.id,
                title=m.title,
                state=m.state,
                qa_criteria=m.qa_criteria,
                lessons=[
                    LessonDiagnostics(
                        id=lesson.id,
                        title=lesson.title,
                        state=lesson.state,
                        attempts=lesson.attempts,
                        research_rounds=lesson.research_rounds,
                        evidence_total=len(lesson.evidence),
                        evidence_retrieved=sum(
                            1 for e in lesson.evidence if e.verification == "retrieved"
                        ),
                        unresolved_claims=lesson.unresolved_claims,
                        word_count=lesson.word_count,
                        review_result=lesson.review.result if lesson.review else None,
                        review_issues=lesson.review.issues if lesson.review else [],
                        claim_audit=lesson.review.claims if lesson.review else [],
                        failure=lesson.failure,
                    )
                    for lesson in m.lessons
                ],
                audit=m.audit,
                failure=m.failure,
            )
            for m in course.modules
        ],
        course_audit=course.course_audit,
        trace_summary=summarize(traces).model_dump(),
        traces=[t.model_dump(mode="json") for t in traces],
    )
