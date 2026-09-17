"""Temporary in-memory state for the generator demonstration.

This is NOT the persistence model. DATA_MODEL.md does not exist yet; all state
lives in this process and is lost on restart. Everything that touches persistence
goes through this module so it can be replaced later.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from auteur_api.core.errors import not_found

if TYPE_CHECKING:
    from auteur_api.ai.tracing import StageTrace
    from auteur_api.modules.blueprints.schemas import BlueprintRecord
    from auteur_api.modules.generation.schemas import CourseRecord
    from auteur_api.modules.onboarding.schemas import LearningRequestRecord


def new_id() -> str:
    return uuid.uuid4().hex


class DemoStore:
    def __init__(self) -> None:
        self.learning_requests: dict[str, LearningRequestRecord] = {}
        self.blueprints: dict[str, BlueprintRecord] = {}
        self.courses: dict[str, CourseRecord] = {}
        # Traces are grouped by the learning request they belong to.
        self.traces: dict[str, list[StageTrace]] = {}

    def reset(self) -> None:
        self.__init__()

    # Learning requests
    def get_learning_request(self, request_id: str) -> LearningRequestRecord:
        record = self.learning_requests.get(request_id)
        if record is None:
            raise not_found("Learning request")
        return record

    def save_learning_request(self, record: LearningRequestRecord) -> None:
        self.learning_requests[record.id] = record

    # Blueprints
    def get_blueprint(self, blueprint_id: str) -> BlueprintRecord:
        record = self.blueprints.get(blueprint_id)
        if record is None:
            raise not_found("Blueprint")
        return record

    def save_blueprint(self, record: BlueprintRecord) -> None:
        self.blueprints[record.id] = record

    # Courses (builds)
    def get_course(self, course_id: str) -> CourseRecord:
        record = self.courses.get(course_id)
        if record is None:
            raise not_found("Course")
        return record

    def save_course(self, record: CourseRecord) -> None:
        self.courses[record.id] = record

    # Traces
    def add_trace(self, scope_id: str, trace: StageTrace) -> None:
        self.traces.setdefault(scope_id, []).append(trace)

    def get_traces(self, scope_id: str) -> list[StageTrace]:
        return list(self.traces.get(scope_id, []))


store = DemoStore()


def get_store() -> DemoStore:
    return store
