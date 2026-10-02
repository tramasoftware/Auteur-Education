"""Persistence, ownership and recovery (DEC-011, DEC-013, BR-GEN-012)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from tests.fixtures import blueprint
from tests.test_blueprints import script_full_build, selected_request
from tests.test_build import approved_course
from tests.test_learning_requests import create

from auteur_api.ai.client import GenerationError
from auteur_api.core.background import ImmediateTaskRunner
from auteur_api.core.config import DEMO_USER_ID, settings
from auteur_api.core.store import new_id, store
from auteur_api.modules.blueprints.schemas import BlueprintOutput
from auteur_api.modules.generation.build import course_needs_build, ensure_started
from auteur_api.modules.generation.schemas import (
    CourseRecord,
    CourseState,
    LessonState,
    ModuleState,
    ResearchOutput,
)


def test_new_id_is_uuid_with_dashes() -> None:
    value = new_id()
    parsed = uuid.UUID(value)
    assert str(parsed) == value
    assert "-" in value


def test_created_request_uses_uuid_and_demo_owner(client, fake_ai) -> None:
    response = create(client, fake_ai)
    assert response.status_code == 201
    body = response.json()
    uuid.UUID(body["id"])
    record = store.get_learning_request(body["id"])
    assert record.user_id == DEMO_USER_ID


def test_get_hides_other_users_learning_request(client, fake_ai) -> None:
    response = create(client, fake_ai)
    rid = response.json()["id"]
    record = store.get_learning_request(rid)
    record.user_id = "11111111-1111-1111-1111-111111111111"
    store.save_learning_request(record)
    hidden = client.get(f"/api/v1/learning-requests/{rid}")
    assert hidden.status_code == 404
    assert hidden.json()["error"]["code"] == "not_found"


def test_invalid_bearer_token_is_unauthorized(client) -> None:
    response = client.get(
        "/api/v1/learning-requests/missing",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_published_course_get_does_not_call_ai(client, fake_ai) -> None:
    course_id = approved_course(client, fake_ai)
    calls_before = len(fake_ai.calls)
    response = client.get(f"/api/v1/courses/{course_id}")
    assert response.status_code == 200
    assert response.json()["modules"][0]["state"] == "published"
    assert len(fake_ai.calls) == calls_before


def test_blueprint_get_does_not_call_ai(client, fake_ai) -> None:
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    calls_before = len(fake_ai.calls)
    response = client.get(f"/api/v1/blueprints/{bid}")
    assert response.status_code == 200
    assert response.json()["state"] == "awaiting_approval"
    assert len(fake_ai.calls) == calls_before


def test_failed_build_is_readable_from_store(client, fake_ai) -> None:
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    fake_ai.enqueue(ResearchOutput, GenerationError("provider", "timeout"))
    course_id = client.post(
        f"/api/v1/blueprints/{bid}/approve", json={"version": 1}
    ).json()["course_id"]
    stored = store.get_course(course_id)
    assert stored.state == CourseState.FAILED
    fetched = client.get(f"/api/v1/courses/{course_id}")
    assert fetched.status_code == 200
    assert fetched.json()["state"] == "failed"


@pytest.mark.anyio
async def test_ensure_started_resumes_unpublished_modules(
    client, fake_ai, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "generation_max_modules", None)
    course_id = approved_course(client, fake_ai, modules=2, lessons=2)
    course = store.get_course(course_id)
    second = course.modules[1]
    second.state = ModuleState.QUEUED
    second.synthesis = None
    second.knowledge_check = None
    second.audit = None
    second.published_at = None
    for lesson in second.lessons:
        lesson.state = LessonState.QUEUED
        lesson.draft = None
        lesson.spec = None
        lesson.review = None
        lesson.evidence = []
    course.state = CourseState.PARTIALLY_AVAILABLE
    store.save_course(course)
    assert course_needs_build(store.get_course(course_id))
    script_full_build(fake_ai)
    await ensure_started(
        course_id, ai=fake_ai, store=store, runner=ImmediateTaskRunner()
    )
    resumed = store.get_course(course_id)
    assert resumed.modules[0].state == ModuleState.PUBLISHED
    assert resumed.modules[1].state == ModuleState.PUBLISHED
    assert not course_needs_build(resumed)


def _saved_course(
    *,
    user_id: str,
    title: str,
    created_at: datetime,
    state: CourseState = CourseState.COMPLETE,
) -> CourseRecord:
    record = CourseRecord(
        id=new_id(),
        user_id=user_id,
        request_id=new_id(),
        blueprint_id=new_id(),
        blueprint_version=1,
        title=title,
        subtitle="A learning trajectory",
        objective_statement=f"Understand {title}.",
        state=state,
        created_at=created_at,
    )
    store.save_course(record)
    return record


def test_library_lists_only_the_callers_courses_newest_first(client) -> None:
    # BR-LIB-001: another user's course is not listed.
    # BR-LIB-002: the caller's courses are ordered by last activity.
    older = _saved_course(
        user_id=DEMO_USER_ID,
        title="Older course",
        created_at=datetime(2026, 9, 1, tzinfo=UTC),
    )
    newer = _saved_course(
        user_id=DEMO_USER_ID,
        title="Newer course",
        created_at=datetime(2026, 9, 1, tzinfo=UTC) + timedelta(days=2),
        state=CourseState.PARTIALLY_AVAILABLE,
    )
    hidden = _saved_course(
        user_id="11111111-1111-1111-1111-111111111111",
        title="Someone else's course",
        created_at=datetime(2026, 9, 20, tzinfo=UTC),
    )

    response = client.get("/api/v1/courses")
    assert response.status_code == 200
    body = response.json()["courses"]
    assert [item["id"] for item in body] == [newer.id, older.id]
    assert hidden.id not in {item["id"] for item in body}
    assert body[0]["title"] == "Newer course"
    assert body[0]["objective_statement"] == "Understand Newer course."
    assert body[0]["state"] == "partially_available"
    assert body[0]["updated_at"]


def test_library_is_empty_without_courses(client) -> None:
    response = client.get("/api/v1/courses")
    assert response.status_code == 200
    assert response.json() == {"courses": []}


def test_course_needs_build_skips_demo_limit_remainder(client, fake_ai) -> None:
    course_id = approved_course(client, fake_ai, modules=2, lessons=2)
    course = store.get_course(course_id)
    assert course.modules[1].state == ModuleState.NOT_BUILT
    assert course_needs_build(course) is False
