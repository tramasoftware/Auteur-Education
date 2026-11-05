"""Persistence for the generator demonstration.

DemoStore keeps state in the API process (tests and local without Supabase).
PostgresStore writes to auteur-education-dev. DATA_MODEL.md describes the schema.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, replace
from datetime import date, datetime
from typing import Literal, Protocol

from auteur_api.ai.tracing import StageTrace, now
from auteur_api.core.errors import invalid_state, not_found
from auteur_api.modules.blueprints.schemas import BlueprintRecord
from auteur_api.modules.generation.schemas import (
    CourseListItem,
    CourseRecord,
    CourseState,
    ModuleState,
)
from auteur_api.modules.learning_progress.logic import (
    CourseLearningProgress,
    LessonRead,
    ProgressWrite,
    apply_read_mark,
    reconcile_progress_row,
)
from auteur_api.modules.learning_progress.logic import (
    record_lesson_visit as apply_lesson_visit,
)
from auteur_api.modules.learning_progress.logic import (
    record_synthesis_presentation as apply_synthesis_presentation,
)
from auteur_api.modules.onboarding.schemas import LearningRequestRecord


def new_id() -> str:
    return str(uuid.uuid4())


@dataclass(frozen=True)
class CourseBuildSnapshot:
    """Fields BR-GEN-002 needs. Module and lesson bodies stay out of this read."""

    id: str
    state: CourseState
    module_limit: int | None
    has_final_synthesis: bool
    module_states: tuple[ModuleState, ...]


def course_build_snapshot(course: CourseRecord) -> CourseBuildSnapshot:
    return CourseBuildSnapshot(
        id=course.id,
        state=course.state,
        module_limit=course.module_limit,
        has_final_synthesis=course.final_synthesis is not None,
        module_states=tuple(module.state for module in course.modules),
    )


def course_structure_counts(course: CourseRecord) -> tuple[int, int]:
    """Module and lesson totals stored on the course row for the library list."""
    return (
        len(course.modules),
        sum(len(module.lessons) for module in course.modules),
    )


def course_list_item(
    course: CourseRecord, *, updated_at: datetime | None = None
) -> CourseListItem:
    module_count, lesson_count = course_structure_counts(course)
    return CourseListItem(
        id=course.id,
        title=course.title,
        subtitle=course.subtitle,
        objective_statement=course.objective_statement,
        state=course.state,
        updated_at=updated_at or _last_activity(course),
        created_at=course.created_at,
        module_count=module_count,
        lesson_count=lesson_count,
    )


def _last_activity(course: CourseRecord) -> datetime:
    """DemoStore has no updated_at column. Postgres uses courses.updated_at."""
    stamps = [course.created_at]
    if course.started_at is not None:
        stamps.append(course.started_at)
    if course.completed_at is not None:
        stamps.append(course.completed_at)
    for module in course.modules:
        if module.published_at is not None:
            stamps.append(module.published_at)
    return max(stamps)


def assert_owner(record_user_id: str | None, user_id: str | None) -> None:
    if user_id and record_user_id and record_user_id != user_id:
        raise not_found("Resource")


TextSizeName = Literal["small", "standard", "large", "extra_large"]
TEXT_SIZES = ("small", "standard", "large", "extra_large")


def normalize_text_size(value: object) -> TextSizeName:
    if value in TEXT_SIZES:
        return value  # type: ignore[return-value]
    return "standard"


@dataclass(frozen=True)
class ProfileRecord:
    first_name: str | None = None
    last_name: str | None = None
    birth_date: date | None = None
    gender: str | None = None
    avatar_url: str | None = None
    image_url: str | None = None
    text_size: str = "standard"
    generated_course_count: int = 0


def _profile_with_image(current: ProfileRecord, image_url: str | None) -> ProfileRecord:
    return replace(current, image_url=image_url)


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

    def list_courses_for_user(self, user_id: str) -> list[CourseListItem]: ...

    def list_course_build_snapshots(
        self, user_id: str
    ) -> list[CourseBuildSnapshot]: ...

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

    def reassign_owner(self, from_user_id: str, to_user_id: str) -> None: ...

    def list_lesson_reads(self, user_id: str, course_id: str) -> list[LessonRead]: ...

    def get_course_learning_progress(
        self, user_id: str, course_id: str
    ) -> CourseLearningProgress | None: ...

    def apply_lesson_read(
        self,
        user_id: str,
        course_id: str,
        lesson_id: str,
        *,
        read: bool,
        expected_updated_at: datetime | None,
    ) -> ProgressWrite: ...

    def record_lesson_visit(
        self,
        user_id: str,
        course_id: str,
        lesson_id: str,
        *,
        position_revision: int,
    ) -> ProgressWrite: ...

    def record_synthesis_presentation(
        self, user_id: str, course_id: str
    ) -> ProgressWrite: ...

    def reconcile_learning_progress(self, user_id: str, course_id: str) -> None: ...

    def get_profile(self, user_id: str) -> ProfileRecord: ...

    def update_profile(self, user_id: str, profile: ProfileRecord) -> ProfileRecord: ...

    def update_text_size(self, user_id: str, text_size: str) -> ProfileRecord: ...

    def create_profile_photo(
        self, user_id: str, content: bytes, content_type: str
    ) -> ProfileRecord: ...

    def replace_profile_photo(
        self, user_id: str, content: bytes, content_type: str
    ) -> ProfileRecord: ...

    def delete_profile_photo(self, user_id: str) -> ProfileRecord: ...


class DemoStore:
    def __init__(self) -> None:
        self.learning_requests: dict[str, LearningRequestRecord] = {}
        self.blueprints: dict[str, BlueprintRecord] = {}
        self.courses: dict[str, CourseRecord] = {}
        self.traces: dict[str, list[StageTrace]] = {}
        self.profiles: dict[str, ProfileRecord] = {}
        self.profile_photos: dict[str, bytes] = {}
        self._photo_versions: dict[str, int] = {}
        self.lesson_reads: dict[tuple[str, str], LessonRead] = {}
        self.course_progress: dict[tuple[str, str], CourseLearningProgress] = {}

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

    def list_courses_for_user(self, user_id: str) -> list[CourseListItem]:
        items = [
            course_list_item(course)
            for course in self.courses.values()
            if course.user_id == user_id
        ]
        items.sort(key=lambda item: item.updated_at, reverse=True)
        return items

    def list_course_build_snapshots(self, user_id: str) -> list[CourseBuildSnapshot]:
        idle = {CourseState.COMPLETE, CourseState.FAILED}
        open_courses = [
            course
            for course in self.courses.values()
            if course.user_id == user_id and course.state not in idle
        ]
        open_courses.sort(key=_last_activity, reverse=True)
        return [course_build_snapshot(course) for course in open_courses]

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

    def reassign_owner(self, from_user_id: str, to_user_id: str) -> None:
        """Move one visitor's rows onto a permanent account (BR-AUT-005)."""
        if from_user_id == to_user_id:
            return
        for record in self.learning_requests.values():
            if record.user_id == from_user_id:
                record.user_id = to_user_id
        for record in self.blueprints.values():
            if record.user_id == from_user_id:
                record.user_id = to_user_id
        for record in self.courses.values():
            if record.user_id == from_user_id:
                record.user_id = to_user_id
        self._reassign_progress(from_user_id, to_user_id)

    def list_lesson_reads(self, user_id: str, course_id: str) -> list[LessonRead]:
        return [
            row
            for (owner, _lesson_id), row in self.lesson_reads.items()
            if owner == user_id and row.course_id == course_id
        ]

    def get_course_learning_progress(
        self, user_id: str, course_id: str
    ) -> CourseLearningProgress | None:
        return self.course_progress.get((user_id, course_id))

    def apply_lesson_read(
        self,
        user_id: str,
        course_id: str,
        lesson_id: str,
        *,
        read: bool,
        expected_updated_at: datetime | None,
    ) -> ProgressWrite:
        course, reads, progress = self._learning_inputs(user_id, course_id)
        result = apply_read_mark(
            course,
            reads,
            progress,
            user_id=user_id,
            lesson_id=lesson_id,
            read=read,
            expected_updated_at=expected_updated_at,
            now=now(),
        )
        if result.outcome is ProgressWrite.APPLIED:
            self._replace_reads(user_id, course_id, result.reads)
            if result.progress is not None:
                self.course_progress[(user_id, course_id)] = result.progress
        return result.outcome

    def record_lesson_visit(
        self,
        user_id: str,
        course_id: str,
        lesson_id: str,
        *,
        position_revision: int,
    ) -> ProgressWrite:
        course, reads, progress = self._learning_inputs(user_id, course_id)
        result = apply_lesson_visit(
            course,
            reads,
            progress,
            user_id=user_id,
            lesson_id=lesson_id,
            position_revision=position_revision,
            now=now(),
        )
        if (
            result.outcome in {ProgressWrite.APPLIED, ProgressWrite.UNCHANGED}
            and result.progress is not None
        ):
            self.course_progress[(user_id, course_id)] = result.progress
        return result.outcome

    def record_synthesis_presentation(
        self, user_id: str, course_id: str
    ) -> ProgressWrite:
        _course, reads, progress = self._learning_inputs(user_id, course_id)
        result = apply_synthesis_presentation(reads, progress, now=now())
        if result.outcome is ProgressWrite.APPLIED and result.progress is not None:
            self.course_progress[(user_id, course_id)] = result.progress
        return result.outcome

    def reconcile_learning_progress(self, user_id: str, course_id: str) -> None:
        course, reads, progress = self._learning_inputs(user_id, course_id)
        updated = reconcile_progress_row(course, reads, progress, now())
        if updated is not None:
            self.course_progress[(user_id, course_id)] = updated

    def get_profile(self, user_id: str) -> ProfileRecord:
        current = self.profiles.get(user_id, ProfileRecord())
        return ProfileRecord(
            first_name=current.first_name,
            last_name=current.last_name,
            birth_date=current.birth_date,
            gender=current.gender,
            avatar_url=current.avatar_url,
            image_url=current.image_url,
            text_size=normalize_text_size(current.text_size),
            generated_course_count=sum(
                1 for course in self.courses.values() if course.user_id == user_id
            ),
        )

    def update_profile(self, user_id: str, profile: ProfileRecord) -> ProfileRecord:
        current = self.profiles.get(user_id, ProfileRecord())
        self.profiles[user_id] = replace(
            current,
            first_name=profile.first_name,
            last_name=profile.last_name,
            birth_date=profile.birth_date,
            gender=profile.gender,
        )
        return self.get_profile(user_id)

    def update_text_size(self, user_id: str, text_size: str) -> ProfileRecord:
        current = self.profiles.get(user_id, ProfileRecord())
        self.profiles[user_id] = replace(
            current, text_size=normalize_text_size(text_size)
        )
        return self.get_profile(user_id)

    def create_profile_photo(
        self, user_id: str, content: bytes, content_type: str
    ) -> ProfileRecord:
        del content_type
        current = self.profiles.get(user_id, ProfileRecord())
        if current.image_url:
            raise invalid_state(
                "A profile photo already exists. Update it instead."
            )
        return self._save_profile_photo(user_id, current, content)

    def replace_profile_photo(
        self, user_id: str, content: bytes, content_type: str
    ) -> ProfileRecord:
        del content_type
        current = self.profiles.get(user_id, ProfileRecord())
        if not current.image_url:
            raise not_found("Profile photo")
        return self._save_profile_photo(user_id, current, content)

    def delete_profile_photo(self, user_id: str) -> ProfileRecord:
        current = self.profiles.get(user_id, ProfileRecord())
        if not current.image_url:
            raise not_found("Profile photo")
        self.profile_photos.pop(user_id, None)
        self.profiles[user_id] = _profile_with_image(current, None)
        return self.get_profile(user_id)

    def _save_profile_photo(
        self, user_id: str, current: ProfileRecord, content: bytes
    ) -> ProfileRecord:
        version = self._photo_versions.get(user_id, 0) + 1
        self._photo_versions[user_id] = version
        self.profile_photos[user_id] = content
        self.profiles[user_id] = _profile_with_image(
            current,
            f"https://example.test/profile-photos/{user_id}/photo?v={version}",
        )
        return self.get_profile(user_id)

    def _learning_inputs(
        self, user_id: str, course_id: str
    ) -> tuple[CourseRecord, dict[str, LessonRead], CourseLearningProgress | None]:
        course = self.get_course(course_id, user_id=user_id)
        reads = {
            row.lesson_id: row
            for row in self.list_lesson_reads(user_id, course_id)
        }
        return course, reads, self.get_course_learning_progress(user_id, course_id)

    def _replace_reads(
        self, user_id: str, course_id: str, reads: dict[str, LessonRead]
    ) -> None:
        stale = [
            key
            for key, row in self.lesson_reads.items()
            if key[0] == user_id and row.course_id == course_id
        ]
        for key in stale:
            del self.lesson_reads[key]
        for lesson_id, row in reads.items():
            self.lesson_reads[(user_id, lesson_id)] = row

    def _reassign_progress(self, from_user_id: str, to_user_id: str) -> None:
        for (user_id, lesson_id), row in list(self.lesson_reads.items()):
            if user_id != from_user_id:
                continue
            del self.lesson_reads[(user_id, lesson_id)]
            moved = replace(row, user_id=to_user_id)
            self.lesson_reads[(to_user_id, lesson_id)] = moved
        for (user_id, course_id), row in list(self.course_progress.items()):
            if user_id != from_user_id:
                continue
            del self.course_progress[(user_id, course_id)]
            self.course_progress[(to_user_id, course_id)] = replace(
                row, user_id=to_user_id
            )


store = DemoStore()


def get_store() -> Store:
    from auteur_api.core.config import settings

    if settings.supabase_configured:
        from auteur_api.core.postgres_store import get_postgres_store

        return get_postgres_store()
    return store
