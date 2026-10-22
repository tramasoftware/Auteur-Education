"""Persistence, ownership and recovery (DEC-011, DEC-013, BR-GEN-012)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from tests.conftest import TEST_USER_ID
from tests.fixtures import blueprint
from tests.test_blueprints import script_full_build, selected_request
from tests.test_build import approved_course
from tests.test_learning_requests import create

from auteur_api.ai.client import GenerationError
from auteur_api.core.background import ImmediateTaskRunner
from auteur_api.core.config import settings
from auteur_api.core.store import new_id, store
from auteur_api.modules.blueprints.schemas import BlueprintOutput
from auteur_api.modules.generation.build import course_needs_build, ensure_started
from auteur_api.modules.generation.schemas import (
    CourseRecord,
    CourseState,
    LessonRecord,
    LessonState,
    ModuleRecord,
    ModuleState,
    ResearchOutput,
)
from auteur_api.modules.generation.service import (
    active_build_course_id,
    course_build_is_active,
)


def test_new_id_is_uuid_with_dashes() -> None:
    value = new_id()
    parsed = uuid.UUID(value)
    assert str(parsed) == value
    assert "-" in value


def test_created_request_uses_uuid_and_authenticated_owner(client, fake_ai) -> None:
    response = create(client, fake_ai)
    assert response.status_code == 201
    body = response.json()
    uuid.UUID(body["id"])
    record = store.get_learning_request(body["id"])
    assert record.user_id == TEST_USER_ID


def test_get_hides_other_users_learning_request(client, fake_ai) -> None:
    response = create(client, fake_ai)
    rid = response.json()["id"]
    record = store.get_learning_request(rid)
    record.user_id = "11111111-1111-1111-1111-111111111111"
    store.save_learning_request(record)
    hidden = client.get(f"/api/v1/learning-requests/{rid}")
    assert hidden.status_code == 404
    assert hidden.json()["error"]["code"] == "not_found"


def test_invalid_bearer_token_is_unauthorized(open_client) -> None:
    response = open_client.get(
        "/api/v1/learning-requests/missing",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_missing_token_is_unauthorized_in_any_environment(
    open_client, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    response = open_client.get("/api/v1/learning-requests/missing")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"

    monkeypatch.setattr(settings, "app_env", "development")
    again = open_client.get("/api/v1/learning-requests/missing")
    assert again.status_code == 401


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
        user_id=TEST_USER_ID,
        title="Older course",
        created_at=datetime(2026, 9, 1, tzinfo=UTC),
    )
    newer = _saved_course(
        user_id=TEST_USER_ID,
        title="Newer course",
        created_at=datetime(2026, 9, 1, tzinfo=UTC) + timedelta(days=2),
        state=CourseState.PARTIALLY_AVAILABLE,
    )
    hidden = _saved_course(
        user_id="11111111-1111-1111-1111-111111111111",
        title="Someone else's course",
        created_at=datetime(2026, 9, 20, tzinfo=UTC),
    )
    first = _module(ModuleState.PUBLISHED, 1)
    first.lessons = [
        LessonRecord(id=new_id(), index=1, title="Opening", purpose="Introduce the idea"),
        LessonRecord(id=new_id(), index=2, title="Development", purpose="Carry the idea"),
    ]
    second = _module(ModuleState.QUEUED, 2)
    second.lessons = [
        LessonRecord(id=new_id(), index=1, title="Close", purpose="Leave a question"),
    ]
    newer.modules = [first, second]
    store.save_course(newer)

    response = client.get("/api/v1/courses")
    assert response.status_code == 200
    body = response.json()["courses"]
    assert [item["id"] for item in body] == [newer.id, older.id]
    assert hidden.id not in {item["id"] for item in body}
    assert body[0]["title"] == "Newer course"
    assert body[0]["objective_statement"] == "Understand Newer course."
    assert body[0]["state"] == "partially_available"
    assert body[0]["updated_at"]
    assert body[0]["module_count"] == 2
    assert body[0]["lesson_count"] == 3
    assert body[1]["module_count"] == 0
    assert body[1]["lesson_count"] == 0


def test_library_is_empty_without_courses(client) -> None:
    response = client.get("/api/v1/courses")
    assert response.status_code == 200
    assert response.json() == {"courses": []}


def _module(state: ModuleState, index: int = 1) -> ModuleRecord:
    return ModuleRecord(
        id=new_id(),
        index=index,
        title=f"Module {index}",
        function="Develop the idea",
        guiding_questions=["What changes?"],
        outcome="A clearer account",
        qa_criteria=["Stays on the objective"],
        state=state,
    )


def test_active_build_check_does_not_load_lessons(client, monkeypatch) -> None:
    # BR-GEN-002: the check needs module states, not lesson bodies.
    writing = _saved_course(
        user_id=TEST_USER_ID,
        title="Course being written",
        created_at=datetime(2026, 9, 2, tzinfo=UTC),
        state=CourseState.WRITING,
    )
    writing.modules = [_module(ModuleState.WRITING)]
    store.save_course(writing)
    capped = _saved_course(
        user_id=TEST_USER_ID,
        title="Demo cap reached",
        created_at=datetime(2026, 9, 3, tzinfo=UTC),
        state=CourseState.PARTIALLY_AVAILABLE,
    )
    capped.module_limit = 1
    capped.modules = [
        _module(ModuleState.PUBLISHED, 1),
        _module(ModuleState.NOT_BUILT, 2),
    ]
    store.save_course(capped)
    _saved_course(
        user_id=TEST_USER_ID,
        title="Finished course",
        created_at=datetime(2026, 9, 4, tzinfo=UTC),
        state=CourseState.COMPLETE,
    )

    def fail_full_load(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("active build check loaded a full course")

    monkeypatch.setattr(store, "get_course", fail_full_load)
    assert active_build_course_id(store, TEST_USER_ID) == writing.id


def test_open_build_lookup_loads_module_states_only() -> None:
    from auteur_api.core.postgres_store import PostgresStore

    query = _RecordingQuery(
        [
            {
                "id": "course-writing",
                "state": "writing",
                "module_limit": 1,
                "final_synthesis": None,
                "modules": [{"state": "writing"}],
            },
            {
                "id": "course-capped",
                "state": "partially_available",
                "module_limit": 1,
                "final_synthesis": None,
                "modules": [{"state": "published"}, {"state": "not_built"}],
            },
            {
                "id": "course-synthesis",
                "state": "partially_available",
                "module_limit": None,
                "final_synthesis": None,
                "modules": [{"state": "published"}],
            },
            {
                "id": "course-with-synthesis",
                "state": "partially_available",
                "module_limit": None,
                "final_synthesis": {"body": "already written"},
                "modules": [{"state": "published"}],
            },
        ]
    )
    snapshots = PostgresStore(_TableClient(query)).list_course_build_snapshots("user-1")
    by_id = {item.id: item for item in snapshots}

    assert query.selected == "id,state,module_limit,final_synthesis,modules(state)"
    assert "lessons" not in query.selected
    assert ("eq", "user_id", "user-1") in query.filters
    assert ("not_in", "state", ["complete", "failed"]) in query.filters
    assert course_build_is_active(by_id["course-writing"])
    assert course_build_is_active(by_id["course-synthesis"])
    assert not course_build_is_active(by_id["course-capped"])
    assert not course_build_is_active(by_id["course-with-synthesis"])
    assert active_build_course_id(
        PostgresStore(_TableClient(query)), "user-1"
    ) == "course-writing"


class _RecordingQuery:
    def __init__(self, data: list[dict[str, object]]) -> None:
        self.selected: str | None = None
        self.filters: list[tuple[object, ...]] = []
        self._data = data

    def select(self, columns: str) -> _RecordingQuery:
        self.selected = columns
        return self

    def eq(self, column: str, value: object) -> _RecordingQuery:
        self.filters.append(("eq", column, value))
        return self

    @property
    def not_(self) -> _RecordingQuery:
        return self

    def in_(self, column: str, values: list[str]) -> _RecordingQuery:
        self.filters.append(("not_in", column, values))
        return self

    def order(self, column: str, *, desc: bool = False) -> _RecordingQuery:
        self.filters.append(("order", column, desc))
        return self

    def execute(self) -> object:
        return type("Response", (), {"data": self._data})()


class _TableClient:
    def __init__(self, query: _RecordingQuery) -> None:
        self._query = query

    def table(self, _name: str) -> _RecordingQuery:
        return self._query


def test_read_retries_when_the_connection_drops() -> None:
    import httpx

    from auteur_api.core.postgres_store import PostgresStore

    attempts = 0

    class Query:
        def execute(self) -> object:
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise httpx.RemoteProtocolError("Server disconnected")
            return {"ok": True}

    result = PostgresStore(None)._read(lambda: Query())  # type: ignore[arg-type]
    assert result == {"ok": True}
    assert attempts == 3


def test_course_needs_build_skips_demo_limit_remainder(client, fake_ai) -> None:
    course_id = approved_course(client, fake_ai, modules=2, lessons=2)
    course = store.get_course(course_id)
    assert course.modules[1].state == ModuleState.NOT_BUILT
    assert course_needs_build(course) is False
