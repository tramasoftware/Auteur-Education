"""Persistence for the generator demonstration.

DemoStore keeps state in the API process (tests and local without Supabase).
PostgresStore writes to auteur-education-dev. DATA_MODEL.md describes the schema.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from auteur_api.ai.tracing import StageTrace
from auteur_api.core.errors import not_found
from auteur_api.modules.blueprints.schemas import BlueprintRecord
from auteur_api.modules.generation.schemas import CourseRecord
from auteur_api.modules.onboarding.schemas import LearningRequestRecord


def new_id() -> str:
    return str(uuid.uuid4())


def assert_owner(record_user_id: str | None, user_id: str | None) -> None:
    if user_id and record_user_id and record_user_id != user_id:
        raise not_found("Resource")


class Store(Protocol):
    def get_learning_request(
        self, request_id: str, *, user_id: str | None = None
    ) -> LearningRequestRecord: ...

    def save_learning_request(self, record: LearningRequestRecord) -> None: ...

    def get_blueprint(
        self, blueprint_id: str, *, user_id: str | None = None
    ) -> BlueprintRecord: ...

    def save_blueprint(self, record: BlueprintRecord) -> None: ...

    def get_course(
        self, course_id: str, *, user_id: str | None = None
    ) -> CourseRecord: ...

    def save_course(self, record: CourseRecord) -> None: ...

    def add_trace(self, scope_id: str, trace: StageTrace) -> None: ...

    def get_traces(self, scope_id: str) -> list[StageTrace]: ...

    def set_trace_qa_result(
        self,
        scope_id: str,
        *,
        stage: str,
        target: str,
        attempt: int,
        qa_result: str,
    ) -> None: ...

    def list_incomplete_course_ids(self) -> list[str]: ...


class DemoStore:
    def __init__(self) -> None:
        self.learning_requests: dict[str, LearningRequestRecord] = {}
        self.blueprints: dict[str, BlueprintRecord] = {}
        self.courses: dict[str, CourseRecord] = {}
        self.traces: dict[str, list[StageTrace]] = {}

    def reset(self) -> None:
        self.__init__()

    def get_learning_request(
        self, request_id: str, *, user_id: str | None = None
    ) -> LearningRequestRecord:
        record = self.learning_requests.get(request_id)
        if record is None:
            raise not_found("Learning request")
        assert_owner(record.user_id, user_id)
        return record

    def save_learning_request(self, record: LearningRequestRecord) -> None:
        self.learning_requests[record.id] = record

    def get_blueprint(
        self, blueprint_id: str, *, user_id: str | None = None
    ) -> BlueprintRecord:
        record = self.blueprints.get(blueprint_id)
        if record is None:
            raise not_found("Blueprint")
        assert_owner(record.user_id, user_id)
        return record

    def save_blueprint(self, record: BlueprintRecord) -> None:
        self.blueprints[record.id] = record

    def get_course(
        self, course_id: str, *, user_id: str | None = None
    ) -> CourseRecord:
        record = self.courses.get(course_id)
        if record is None:
            raise not_found("Course")
        assert_owner(record.user_id, user_id)
        return record

    def save_course(self, record: CourseRecord) -> None:
        self.courses[record.id] = record

    def add_trace(self, scope_id: str, trace: StageTrace) -> None:
        self.traces.setdefault(scope_id, []).append(trace)

    def get_traces(self, scope_id: str) -> list[StageTrace]:
        return list(self.traces.get(scope_id, []))

    def set_trace_qa_result(
        self,
        scope_id: str,
        *,
        stage: str,
        target: str,
        attempt: int,
        qa_result: str,
    ) -> None:
        for trace in reversed(self.traces.get(scope_id, [])):
            if (
                trace.stage == stage
                and trace.target == target
                and trace.attempt == attempt
            ):
                trace.qa_result = qa_result
                return

    def list_incomplete_course_ids(self) -> list[str]:
        from auteur_api.modules.generation.schemas import CourseState

        terminal = {CourseState.COMPLETE, CourseState.FAILED}
        return [c.id for c in self.courses.values() if c.state not in terminal]


store = DemoStore()


def get_store() -> Store:
    from auteur_api.core.config import settings

    if settings.supabase_configured:
        from auteur_api.core.postgres_store import get_postgres_store

        return get_postgres_store()
    return store
