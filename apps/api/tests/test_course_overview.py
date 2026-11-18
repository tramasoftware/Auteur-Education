"""Course overview counts without synthesis, knowledge-check, or evidence bodies."""

from __future__ import annotations

from datetime import UTC, datetime

from auteur_api.core.postgres_store import (
    _OVERVIEW_LESSON,
    _OVERVIEW_MODULE,
    _course_from_parts,
)
from auteur_api.core.store import new_id
from auteur_api.modules.generation.schemas import (
    CourseRecord,
    CourseState,
    EvidenceItem,
    KnowledgeCheckOptionOutput,
    KnowledgeCheckOutput,
    KnowledgeCheckQuestionOutput,
    LessonRecord,
    LessonState,
    ModuleRecord,
    ModuleState,
)
from auteur_api.modules.generation.service import course_view

URL_A = "https://example.edu/a"
URL_B = "https://example.edu/b"


def test_overview_query_does_not_select_heavy_columns() -> None:
    module_columns = _OVERVIEW_MODULE.split(",")
    lesson_columns = _OVERVIEW_LESSON.split(",")
    assert "synthesis" not in module_columns
    assert "knowledge_check" not in module_columns
    assert "has_synthesis" in module_columns
    assert "question_count" in module_columns
    assert "evidence" not in lesson_columns
    assert "evidence_urls" in lesson_columns


def test_published_overview_counts_without_bodies() -> None:
    module_id = new_id()
    course = _course_from_parts(
        {
            "id": new_id(),
            "user_id": new_id(),
            "state": "complete",
            "title": "Course",
            "subtitle": "A trajectory",
            "objective_statement": "Understand the subject.",
            "blueprint_version": 1,
            "created_at": "2026-09-01T00:00:00+00:00",
        },
        [
            {
                "id": module_id,
                "index": 1,
                "title": "Module",
                "function": "Advance the argument.",
                "guiding_questions": ["What changes?"],
                "outcome": "A clearer distinction.",
                "state": "published",
                "has_synthesis": True,
                "question_count": 2,
                "published_at": "2026-09-02T00:00:00+00:00",
            }
        ],
        {
            module_id: [
                _lesson_row(module_id, 1, [URL_A, URL_B]),
                _lesson_row(module_id, 2, [URL_A, None, ""]),
            ]
        },
    )
    module = course.modules[0]
    assert module.synthesis is None
    assert module.knowledge_check is None
    assert module.lessons[0].evidence == []

    viewed = course_view(course).modules[0]
    assert viewed.has_synthesis is True
    assert viewed.question_count == 2
    assert viewed.source_count == 3
    assert viewed.lesson_count == 2


def test_body_counts_match_overview_counts() -> None:
    body = _body_course(synthesis="The module closes the argument.", questions=2)
    overview = _body_course(synthesis=None, questions=0)
    overview.modules[0].overview_has_synthesis = True
    overview.modules[0].overview_question_count = 2
    overview.modules[0].synthesis = None
    overview.modules[0].knowledge_check = None
    for lesson in overview.modules[0].lessons:
        lesson.evidence_urls = [item.url for item in lesson.evidence]
        lesson.evidence = []

    body_view = course_view(body).modules[0]
    overview_view = course_view(overview).modules[0]
    assert body_view.has_synthesis is True
    assert body_view.question_count == 2
    assert body_view.source_count == 1
    assert overview_view.has_synthesis == body_view.has_synthesis
    assert overview_view.question_count == body_view.question_count
    assert overview_view.source_count == body_view.source_count


def test_blank_synthesis_is_not_a_synthesis() -> None:
    course = _body_course(synthesis="  \n", questions=0)
    assert course_view(course).modules[0].has_synthesis is False
    assert course_view(course).modules[0].question_count is None


def _lesson_row(
    module_id: str, index: int, urls: list[str | None]
) -> dict[str, object]:
    return {
        "id": new_id(),
        "module_id": module_id,
        "index": index,
        "title": f"Lesson {index}",
        "word_count": 120,
        "state": "approved",
        "evidence_urls": urls,
    }


def _body_course(*, synthesis: str | None, questions: int) -> CourseRecord:
    lesson = LessonRecord(
        id=new_id(),
        index=1,
        title="Opening",
        purpose="Start the argument.",
        state=LessonState.APPROVED,
        evidence=[_evidence(URL_A), _evidence(URL_A)],
    )
    module = ModuleRecord(
        id=new_id(),
        index=1,
        title="Module",
        function="Advance the argument.",
        guiding_questions=["What changes?"],
        outcome="A clearer distinction.",
        qa_criteria=["The claim is explicit."],
        state=ModuleState.PUBLISHED,
        lessons=[lesson],
        synthesis=synthesis,
        knowledge_check=_check(questions) if questions else None,
        published_at=datetime(2026, 9, 2, tzinfo=UTC),
    )
    return CourseRecord(
        id=new_id(),
        user_id=new_id(),
        request_id=new_id(),
        blueprint_id=new_id(),
        blueprint_version=1,
        title="Course",
        subtitle="A trajectory",
        objective_statement="Understand the subject.",
        state=CourseState.COMPLETE,
        modules=[module],
        created_at=datetime(2026, 9, 1, tzinfo=UTC),
    )


def _check(count: int) -> KnowledgeCheckOutput:
    return KnowledgeCheckOutput(
        questions=[
            KnowledgeCheckQuestionOutput(
                question=f"Question {index}",
                options=[
                    KnowledgeCheckOptionOutput(
                        text="Yes",
                        is_correct=True,
                        explanation="Because the text says so.",
                    )
                ],
                assessed_concepts=["change"],
                related_lesson_titles=["Opening"],
            )
            for index in range(count)
        ]
    )


def _evidence(url: str) -> EvidenceItem:
    return EvidenceItem(
        ref="e1",
        url=url,
        title="Source",
        author_or_institution=None,
        date=None,
        source_type="academic",
        relevant_excerpt="A passage.",
        supports_claims=["The claim."],
        support_level="strong",
        limits=None,
        role="primary_support",
        verification="retrieved",
        retrieved_at=datetime(2026, 9, 1, tzinfo=UTC),
    )
