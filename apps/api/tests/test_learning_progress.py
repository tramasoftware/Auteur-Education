"""Learning progress: marks, module and course status, completion (BR-PRG-001..005)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from tests.conftest import TEST_USER_ID

from auteur_api.core.store import new_id, store
from auteur_api.modules.generation.schemas import (
    CourseRecord,
    CourseState,
    LessonDraftOutput,
    LessonRecord,
    LessonSectionOutput,
    LessonState,
    ModuleRecord,
    ModuleState,
)
from auteur_api.modules.learning_progress.logic import ProgressWrite
from auteur_api.modules.learning_progress.service import reconcile_after_build

OTHER_USER_ID = "20000000-0000-4000-8000-000000000002"


def make_course(
    *modules: tuple[ModuleState, int],
    state: CourseState = CourseState.PARTIALLY_AVAILABLE,
    user_id: str = TEST_USER_ID,
) -> CourseRecord:
    built: list[ModuleRecord] = []
    for index, (module_state, lesson_count) in enumerate(modules, start=1):
        published = module_state == ModuleState.PUBLISHED
        lessons = [
            LessonRecord(
                id=str(uuid.uuid4()),
                index=lesson_index,
                title=f"M{index} lesson {lesson_index}",
                purpose="Explain the next step.",
                state=LessonState.APPROVED if published else LessonState.QUEUED,
            )
            for lesson_index in range(1, lesson_count + 1)
        ]
        built.append(
            ModuleRecord(
                id=str(uuid.uuid4()),
                index=index,
                title=f"Module {index}",
                function="Advance the argument.",
                guiding_questions=["What changes?"],
                outcome="A clearer distinction.",
                qa_criteria=["The claim is explicit."],
                state=module_state,
                lessons=lessons,
                published_at=datetime.now(UTC) if published else None,
            )
        )
    return CourseRecord(
        id=new_id(),
        user_id=user_id,
        request_id=new_id(),
        blueprint_id=new_id(),
        blueprint_version=1,
        title="Course",
        subtitle="A trajectory",
        objective_statement="Understand the subject.",
        state=state,
        modules=built,
        created_at=datetime.now(UTC),
        completed_at=datetime.now(UTC) if state == CourseState.COMPLETE else None,
    )


def save(course: CourseRecord) -> CourseRecord:
    store.save_course(course)
    return course


def progress(client: TestClient, course_id: str) -> dict:
    response = client.get(f"/api/v1/courses/{course_id}/progress")
    assert response.status_code == 200, response.text
    return response.json()


def put_read(
    client: TestClient,
    course_id: str,
    lesson_id: str,
    *,
    read: bool,
    updated_at: str | None,
) -> object:
    return client.put(
        f"/api/v1/courses/{course_id}/lessons/{lesson_id}/read",
        json={"read": read, "updated_at": updated_at},
    )


def visit(
    client: TestClient, course_id: str, lesson_id: str, revision: int
) -> object:
    return client.put(
        f"/api/v1/courses/{course_id}/lessons/{lesson_id}/visit",
        json={"position_revision": revision},
    )


def lesson_view(body: dict, lesson_id: str) -> dict:
    return next(item for item in body["lessons"] if item["lesson_id"] == lesson_id)


def module_view(body: dict, module_id: str) -> dict:
    return next(item for item in body["modules"] if item["module_id"] == module_id)


def mark_published(client: TestClient, course: CourseRecord) -> dict:
    body = progress(client, course.id)
    for module in course.modules:
        if module.state != ModuleState.PUBLISHED:
            continue
        for lesson in module.lessons:
            stamp = lesson_view(body, lesson.id)["updated_at"]
            response = put_read(
                client, course.id, lesson.id, read=True, updated_at=stamp
            )
            assert response.status_code == 200, response.text
            body = response.json()
    return body


def test_new_courses_start_unread_and_do_not_share_marks(client: TestClient) -> None:
    """CA-01, CA-14. Lc comes from the rows of each course."""
    twelve = save(
        make_course(
            (ModuleState.PUBLISHED, 3),
            (ModuleState.QUEUED, 3),
            (ModuleState.QUEUED, 3),
            (ModuleState.QUEUED, 3),
        )
    )
    nine = save(
        make_course(
            (ModuleState.PUBLISHED, 3),
            (ModuleState.PUBLISHED, 3),
            (ModuleState.QUEUED, 3),
        )
    )
    fresh = progress(client, twelve.id)
    assert fresh["lesson_total"] == 12
    assert fresh["lessons_read"] == 0
    assert fresh["learning_status"] == "not_started"
    assert fresh["percent"] == 0
    mark_published(client, twelve)
    untouched = progress(client, nine.id)
    started = progress(client, twelve.id)
    assert untouched["lesson_total"] == 9
    assert untouched["lessons_read"] == 0
    assert untouched["learning_status"] == "not_started"
    assert untouched["percent"] == 0
    assert started["lesson_total"] == 12
    assert started["lessons_read"] == 3
    assert all(not item["read"] for item in untouched["lessons"])


def test_opening_a_lesson_does_not_mark_it_read(client: TestClient) -> None:
    """CA-02. The lesson GET used by the reader is not a read mark."""
    course = save(make_course((ModuleState.PUBLISHED, 2)))
    lesson = course.modules[0].lessons[0]
    lesson.draft = LessonDraftOutput(
        title=lesson.title,
        sections=[
            LessonSectionOutput(kind="prose", heading="Opening", body="A paragraph.")
        ],
        sources_used_refs=[],
    )
    store.save_course(course)
    opened = client.get(
        f"/api/v1/courses/{course.id}/modules/{course.modules[0].id}"
        f"/lessons/{lesson.id}"
    )
    assert opened.status_code == 200
    body = progress(client, course.id)
    assert body["lessons_read"] == 0
    assert lesson_view(body, lesson.id)["read"] is False

    moved = visit(client, course.id, lesson.id, body["position_revision"])
    assert moved.status_code == 200
    visited = moved.json()
    assert visited["lessons_read"] == 0
    assert lesson_view(visited, lesson.id)["read"] is False
    assert visited["last_lesson_id"] == lesson.id
    assert visited["resume_lesson_id"] == lesson.id
    assert visited["last_activity_at"] is not None


def test_repeated_mark_keeps_one_row_and_the_original_time(client: TestClient) -> None:
    """CA-03, CA-08. Reading again does not duplicate or complete the course twice."""
    course = save(make_course((ModuleState.PUBLISHED, 1), state=CourseState.COMPLETE))
    lesson_id = course.modules[0].lessons[0].id
    first = put_read(client, course.id, lesson_id, read=True, updated_at=None)
    assert first.status_code == 200
    done = first.json()
    again = put_read(client, course.id, lesson_id, read=True, updated_at=None)
    assert again.status_code == 200
    reread = again.json()
    assert lesson_view(reread, lesson_id)["marked_at"] == lesson_view(done, lesson_id)[
        "marked_at"
    ]
    assert reread["first_completed_at"] == done["first_completed_at"]
    assert reread["current_completed_at"] == done["current_completed_at"]
    assert reread["last_activity_at"] == done["last_activity_at"]
    assert sum(1 for item in reread["lessons"] if item["read"]) == 1


def test_module_completes_from_read_marks_alone(client: TestClient) -> None:
    """CA-04. No quiz is required, and unmarking removes completion."""
    course = save(make_course((ModuleState.PUBLISHED, 3), state=CourseState.COMPLETE))
    module_id = course.modules[0].id
    body = progress(client, course.id)
    assert module_view(body, module_id)["learning_status"] == "not_started"
    for lesson in course.modules[0].lessons[:2]:
        stamp = lesson_view(body, lesson.id)["updated_at"]
        body = put_read(
            client, course.id, lesson.id, read=True, updated_at=stamp
        ).json()
    assert module_view(body, module_id)["learning_status"] == "in_progress"
    assert module_view(body, module_id)["percent"] == 66
    assert body["learning_status"] == "in_progress"
    last = course.modules[0].lessons[2]
    body = put_read(
        client,
        course.id,
        last.id,
        read=True,
        updated_at=lesson_view(body, last.id)["updated_at"],
    ).json()
    assert module_view(body, module_id)["learning_status"] == "completed"
    assert body["learning_status"] == "completed"
    assert body["percent"] == 100
    assert body["synthesis_auto_open_pending"] is True


def test_partial_build_counts_planned_lessons_in_the_total(client: TestClient) -> None:
    """CA-05, CA-15. Six reads of twelve planned lessons are 50, not complete."""
    course = save(
        make_course(
            (ModuleState.PUBLISHED, 3),
            (ModuleState.PUBLISHED, 3),
            (ModuleState.QUEUED, 3),
            (ModuleState.QUEUED, 3),
        )
    )
    body = mark_published(client, course)
    assert body["lesson_total"] == 12
    assert body["lessons_read"] == 6
    assert body["percent"] == 50
    assert body["learning_status"] == "in_progress"
    assert body["current_completed_at"] is None
    assert body["synthesis_auto_open_pending"] is False
    assert body["build_state"] == "partially_available"


def test_percent_truncates_toward_zero(client: TestClient) -> None:
    """5/12 is 41. 11/12 stays below 100 until every lesson is read."""
    course = save(
        make_course((ModuleState.PUBLISHED, 12), state=CourseState.COMPLETE)
    )
    body = progress(client, course.id)
    for lesson in course.modules[0].lessons[:5]:
        body = put_read(
            client,
            course.id,
            lesson.id,
            read=True,
            updated_at=lesson_view(body, lesson.id)["updated_at"],
        ).json()
    assert body["percent"] == 41
    assert body["learning_status"] == "in_progress"
    for lesson in course.modules[0].lessons[5:11]:
        body = put_read(
            client,
            course.id,
            lesson.id,
            read=True,
            updated_at=lesson_view(body, lesson.id)["updated_at"],
        ).json()
    assert body["lessons_read"] == 11
    assert body["percent"] == 91
    assert body["learning_status"] == "in_progress"
    assert body["percent"] != 100


def test_course_percent_is_not_the_average_of_modules(client: TestClient) -> None:
    course = save(
        make_course((ModuleState.PUBLISHED, 2), (ModuleState.PUBLISHED, 10))
    )
    lesson_id = course.modules[0].lessons[0].id
    body = progress(client, course.id)
    body = put_read(
        client,
        course.id,
        lesson_id,
        read=True,
        updated_at=lesson_view(body, lesson_id)["updated_at"],
    ).json()
    assert body["lesson_total"] == 12
    assert body["lessons_read"] == 1
    assert body["percent"] == 8
    assert module_view(body, course.modules[0].id)["percent"] == 50


def test_completion_waits_for_the_build_and_can_happen_while_away(
    client: TestClient,
) -> None:
    """CA-06, CA-17. Finishing the build completes a course that was already read."""
    course = save(make_course((ModuleState.PUBLISHED, 2)))
    body = mark_published(client, course)
    assert body["learning_status"] == "in_progress"
    assert body["first_completed_at"] is None
    course.state = CourseState.COMPLETE
    course.completed_at = datetime.now(UTC)
    store.save_course(course)
    reconcile_after_build(store, course)
    done = progress(client, course.id)
    assert done["learning_status"] == "completed"
    assert done["percent"] == 100
    assert done["first_completed_at"] is not None
    assert done["current_completed_at"] == done["first_completed_at"]
    assert done["synthesis_auto_open_pending"] is True
    assert done["build_state"] == "complete"


def test_progress_read_repairs_completion_without_another_mark(
    client: TestClient,
) -> None:
    course = save(make_course((ModuleState.PUBLISHED, 1)))
    mark_published(client, course)
    course.state = CourseState.COMPLETE
    store.save_course(course)
    done = progress(client, course.id)
    assert done["learning_status"] == "completed"
    assert done["synthesis_auto_open_pending"] is True


def test_generation_completion_is_not_learning_completion(client: TestClient) -> None:
    course = save(make_course((ModuleState.PUBLISHED, 2), state=CourseState.COMPLETE))
    body = progress(client, course.id)
    assert course.completed_at is not None
    assert body["learning_status"] == "not_started"
    assert body["percent"] == 0
    assert body["first_completed_at"] is None
    assert body["current_completed_at"] is None


def test_not_built_lessons_stay_in_the_total(client: TestClient) -> None:
    course = save(
        make_course(
            (ModuleState.PUBLISHED, 3),
            (ModuleState.NOT_BUILT, 3),
            state=CourseState.COMPLETE,
        )
    )
    body = mark_published(client, course)
    assert body["lesson_total"] == 6
    assert body["lessons_read"] == 3
    assert body["percent"] == 50
    assert body["learning_status"] == "in_progress"


def test_unmark_and_remark_keep_the_first_completion(client: TestClient) -> None:
    """CA-09. The one-time synthesis opening is not armed again."""
    course = save(make_course((ModuleState.PUBLISHED, 2), state=CourseState.COMPLETE))
    first, second = course.modules[0].lessons
    done = mark_published(client, course)
    first_completed = done["first_completed_at"]
    presented = client.post(f"/api/v1/courses/{course.id}/synthesis-presentation")
    assert presented.status_code == 200
    shown = presented.json()
    assert shown["synthesis_auto_open_pending"] is False
    shown_at = shown["synthesis_auto_presented_at"]
    stamp = lesson_view(shown, second.id)["updated_at"]
    unmarked = put_read(
        client, course.id, second.id, read=False, updated_at=stamp
    ).json()
    assert unmarked["lessons_read"] == 1
    assert unmarked["percent"] == 50
    assert unmarked["learning_status"] == "in_progress"
    assert unmarked["current_completed_at"] is None
    assert unmarked["first_completed_at"] == first_completed
    assert lesson_view(unmarked, first.id)["read"] is True
    assert unmarked["synthesis_auto_open_pending"] is False
    restored = put_read(
        client,
        course.id,
        second.id,
        read=True,
        updated_at=lesson_view(unmarked, second.id)["updated_at"],
    ).json()
    assert restored["learning_status"] == "completed"
    assert restored["lessons_read"] == 2
    assert restored["first_completed_at"] == first_completed
    assert restored["current_completed_at"] is not None
    assert restored["synthesis_auto_presented_at"] == shown_at
    assert restored["synthesis_auto_open_pending"] is False
    repeat = client.post(f"/api/v1/courses/{course.id}/synthesis-presentation")
    assert repeat.status_code == 200
    assert repeat.json()["synthesis_auto_presented_at"] == shown_at


def test_pending_synthesis_returns_if_it_was_never_shown(client: TestClient) -> None:
    course = save(make_course((ModuleState.PUBLISHED, 1), state=CourseState.COMPLETE))
    lesson_id = course.modules[0].lessons[0].id
    done = mark_published(client, course)
    stamp = lesson_view(done, lesson_id)["updated_at"]
    unmarked = put_read(
        client, course.id, lesson_id, read=False, updated_at=stamp
    ).json()
    assert unmarked["synthesis_auto_open_pending"] is False
    restored = put_read(
        client,
        course.id,
        lesson_id,
        read=True,
        updated_at=lesson_view(unmarked, lesson_id)["updated_at"],
    ).json()
    assert restored["synthesis_auto_open_pending"] is True
    assert restored["first_completed_at"] == done["first_completed_at"]


def test_synthesis_is_refused_before_the_first_completion(client: TestClient) -> None:
    course = save(make_course((ModuleState.PUBLISHED, 1)))
    response = client.post(f"/api/v1/courses/{course.id}/synthesis-presentation")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_state"


def test_structure_edits_keep_old_marks_and_recount(client: TestClient) -> None:
    """CA-10. Text and order keep the mark. A new lesson changes the total."""
    course = save(make_course((ModuleState.PUBLISHED, 1), state=CourseState.COMPLETE))
    original = course.modules[0].lessons[0]
    done = mark_published(client, course)
    marked_at = lesson_view(done, original.id)["marked_at"]
    original.title = "Revised title"
    original.index = 2
    added = LessonRecord(
        id=str(uuid.uuid4()),
        index=1,
        title="New lesson",
        purpose="A real addition.",
        state=LessonState.APPROVED,
    )
    course.modules[0].lessons.append(added)
    store.save_course(course)
    expanded = progress(client, course.id)
    assert lesson_view(expanded, original.id)["read"] is True
    assert lesson_view(expanded, original.id)["marked_at"] == marked_at
    assert lesson_view(expanded, added.id)["read"] is False
    assert expanded["lesson_total"] == 2
    assert expanded["lessons_read"] == 1
    assert expanded["learning_status"] == "in_progress"
    assert expanded["current_completed_at"] is None
    assert expanded["first_completed_at"] == done["first_completed_at"]

    course.modules[0].lessons = [original]
    store.save_course(course)
    restored = progress(client, course.id)
    assert restored["lesson_total"] == 1
    assert restored["lessons_read"] == 1
    assert restored["learning_status"] == "completed"
    assert restored["first_completed_at"] == done["first_completed_at"]


@pytest.mark.parametrize(
    "module_state",
    [
        ModuleState.QUEUED,
        ModuleState.RESEARCHING,
        ModuleState.WRITING,
        ModuleState.REVIEWING,
        ModuleState.FAILED,
        ModuleState.NOT_BUILT,
    ],
)
def test_unpublished_lessons_cannot_be_marked(
    client: TestClient, module_state: ModuleState
) -> None:
    """CA-11."""
    course = save(
        make_course((ModuleState.PUBLISHED, 1), (module_state, 1))
    )
    kept = mark_published(client, course)
    blocked_id = course.modules[1].lessons[0].id
    refused = put_read(client, course.id, blocked_id, read=True, updated_at=None)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "invalid_state"
    course.modules[1].state = ModuleState.PUBLISHED
    course.modules[1].published_at = datetime.now(UTC)
    course.modules[1].lessons[0].state = LessonState.APPROVED
    store.save_course(course)
    after = progress(client, course.id)
    assert lesson_view(after, course.modules[0].lessons[0].id)["read"] is True
    assert lesson_view(after, blocked_id)["read"] is False
    assert after["first_completed_at"] == kept["first_completed_at"] or (
        kept["first_completed_at"] is None and after["first_completed_at"] is None
    )


def test_progress_survives_another_read_and_account_reassignment(
    client: TestClient,
) -> None:
    """CA-12. The mark is in the store, and it moves with the account (BR-AUT-005)."""
    course = save(make_course((ModuleState.PUBLISHED, 2), user_id=OTHER_USER_ID))
    first, second = course.modules[0].lessons
    assert (
        store.apply_lesson_read(
            OTHER_USER_ID,
            course.id,
            first.id,
            read=True,
            expected_updated_at=None,
        )
        is ProgressWrite.APPLIED
    )
    assert (
        store.record_lesson_visit(
            OTHER_USER_ID, course.id, second.id, position_revision=0
        )
        is ProgressWrite.APPLIED
    )
    store.reassign_owner(OTHER_USER_ID, TEST_USER_ID)
    body = progress(client, course.id)
    again = progress(client, course.id)
    assert lesson_view(again, first.id)["read"] is True
    assert lesson_view(again, first.id)["marked_at"] == lesson_view(body, first.id)[
        "marked_at"
    ]
    assert again["last_lesson_id"] == second.id
    assert again["resume_lesson_id"] == second.id
    assert lesson_view(again, second.id)["read"] is False


def test_stale_and_repeated_writes_do_not_invent_progress(client: TestClient) -> None:
    """CA-13."""
    course = save(make_course((ModuleState.PUBLISHED, 2), state=CourseState.COMPLETE))
    first, second = course.modules[0].lessons
    marked = put_read(client, course.id, first.id, read=True, updated_at=None)
    assert marked.status_code == 200
    stamp = lesson_view(marked.json(), first.id)["updated_at"]
    other = put_read(client, course.id, second.id, read=True, updated_at=None)
    assert other.status_code == 200
    assert lesson_view(other.json(), first.id)["read"] is True
    cleared = put_read(client, course.id, first.id, read=False, updated_at=stamp)
    assert cleared.status_code == 200
    late = put_read(client, course.id, first.id, read=True, updated_at=stamp)
    assert late.status_code == 409
    assert late.json()["error"]["code"] == "stale_version"
    current = progress(client, course.id)
    assert lesson_view(current, first.id)["read"] is False
    assert lesson_view(current, second.id)["read"] is True
    assert current["learning_status"] == "in_progress"


def test_a_visit_cannot_overwrite_a_newer_position(client: TestClient) -> None:
    course = save(make_course((ModuleState.PUBLISHED, 2)))
    first, second = course.modules[0].lessons
    body = progress(client, course.id)
    opened = visit(client, course.id, first.id, body["position_revision"])
    assert opened.status_code == 200
    revision = opened.json()["position_revision"]
    late = visit(client, course.id, second.id, body["position_revision"])
    assert late.status_code == 409
    assert late.json()["error"]["code"] == "stale_version"
    stayed = progress(client, course.id)
    assert stayed["last_lesson_id"] == first.id
    assert stayed["position_revision"] == revision
    same = visit(client, course.id, first.id, body["position_revision"])
    assert same.status_code == 200
    assert same.json()["last_lesson_id"] == first.id
    assert same.json()["position_revision"] == revision


def test_marking_does_not_move_the_last_lesson(client: TestClient) -> None:
    course = save(make_course((ModuleState.PUBLISHED, 2)))
    first, second = course.modules[0].lessons
    body = progress(client, course.id)
    opened = visit(client, course.id, first.id, 0)
    assert opened.status_code == 200
    marked = put_read(client, course.id, second.id, read=True, updated_at=None)
    assert marked.status_code == 200
    assert marked.json()["last_lesson_id"] == first.id
    assert lesson_view(marked.json(), second.id)["read"] is True
    assert body["lessons_read"] == 0


def test_empty_course_has_no_percent_and_cannot_complete(client: TestClient) -> None:
    course = save(make_course(state=CourseState.COMPLETE))
    body = progress(client, course.id)
    assert body["lesson_total"] == 0
    assert body["percent"] is None
    assert body["learning_status"] == "not_started"
    assert body["first_completed_at"] is None


def test_another_user_cannot_read_or_write_progress(client: TestClient) -> None:
    course = save(make_course((ModuleState.PUBLISHED, 1), user_id=OTHER_USER_ID))
    lesson_id = course.modules[0].lessons[0].id
    assert client.get(f"/api/v1/courses/{course.id}/progress").status_code == 404
    refused = put_read(client, course.id, lesson_id, read=True, updated_at=None)
    assert refused.status_code == 404
    assert refused.json()["error"]["code"] == "not_found"
    assert visit(client, course.id, lesson_id, 0).status_code == 404


def test_resume_falls_back_when_the_last_module_is_not_published(
    client: TestClient,
) -> None:
    course = save(make_course((ModuleState.PUBLISHED, 1), (ModuleState.PUBLISHED, 1)))
    first = course.modules[0].lessons[0]
    second = course.modules[1].lessons[0]
    body = progress(client, course.id)
    assert body["resume_lesson_id"] == first.id
    opened = visit(client, course.id, second.id, 0)
    assert opened.json()["resume_lesson_id"] == second.id
    course.modules[1].state = ModuleState.QUEUED
    store.save_course(course)
    resumed = progress(client, course.id)
    assert resumed["last_lesson_id"] == second.id
    assert resumed["resume_lesson_id"] == first.id


def test_forced_complete_with_a_queued_module_stays_in_progress(
    client: TestClient,
) -> None:
    course = save(
        make_course(
            (ModuleState.PUBLISHED, 1),
            (ModuleState.QUEUED, 1),
            state=CourseState.COMPLETE,
        )
    )
    body = mark_published(client, course)
    assert body["learning_status"] == "in_progress"
    assert body["current_completed_at"] is None


def test_build_reconcile_failure_does_not_propagate(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    course = save(make_course((ModuleState.PUBLISHED, 1), state=CourseState.COMPLETE))

    def explode(*_args, **_kwargs) -> None:
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(store, "reconcile_learning_progress", explode)
    reconcile_after_build(store, course)


def test_no_quiz_or_audio_route_writes_progress(client: TestClient) -> None:
    """CA-07, CA-16. Progress has no dependency on quizzes, audio, or scroll."""
    course = save(make_course((ModuleState.PUBLISHED, 1), state=CourseState.COMPLETE))
    lesson_id = course.modules[0].lessons[0].id
    quiz = client.post(f"/api/v1/courses/{course.id}/knowledge-check")
    audio = client.post(f"/api/v1/courses/{course.id}/lessons/{lesson_id}/audio")
    assert quiz.status_code == 404
    assert audio.status_code == 404
    body = mark_published(client, course)
    assert body["learning_status"] == "completed"
    assert body["lessons_read"] == 1
