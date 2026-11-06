"""Pure learning-progress rules (BR-PRG-001..003).

Percents and learning statuses are derived from lesson rows, module publication,
and read marks. `first_completed_at`, `current_completed_at`, and
`synthesis_auto_presented_at` are the only stored facts that marks cannot rebuild.

The Postgres write functions in the learning-progress migration must follow
these same transitions. DemoStore and the tests execute this module.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from enum import StrEnum

from auteur_api.modules.generation.schemas import (
    CourseRecord,
    CourseState,
    LessonRecord,
    ModuleRecord,
    ModuleState,
)
from auteur_api.modules.learning_progress.schemas import (
    CourseProgressResponse,
    LearningStatus,
    LessonProgress,
    ModuleProgress,
)


class ProgressWrite(StrEnum):
    APPLIED = "applied"
    UNCHANGED = "unchanged"
    STALE = "stale"
    NOT_FOUND = "not_found"
    NOT_ACCESSIBLE = "not_accessible"
    NOT_READY = "not_ready"


@dataclass(frozen=True)
class LessonRead:
    user_id: str
    lesson_id: str
    course_id: str
    read: bool
    marked_at: datetime | None
    updated_at: datetime


@dataclass(frozen=True)
class CourseLearningProgress:
    user_id: str
    course_id: str
    last_lesson_id: str | None = None
    last_activity_at: datetime | None = None
    position_revision: int = 0
    first_completed_at: datetime | None = None
    current_completed_at: datetime | None = None
    synthesis_auto_presented_at: datetime | None = None


@dataclass(frozen=True)
class WriteResult:
    outcome: ProgressWrite
    reads: dict[str, LessonRead]
    progress: CourseLearningProgress | None


def fresh_stamp(previous: datetime | None, now: datetime) -> datetime:
    """A new write must not reuse the timestamp the client already holds."""
    current = _aware(now)
    if previous is None:
        return current
    prior = _aware(previous)
    if current <= prior:
        return prior + timedelta(microseconds=1)
    return current


def same_instant(left: datetime | None, right: datetime | None) -> bool:
    if left is None or right is None:
        return left is None and right is None
    return _aware(left) == _aware(right)


def structure(course: CourseRecord):
    """Lessons in approved order. Identity is the lesson id, not the index."""
    modules = sorted(course.modules, key=lambda module: module.index)
    for module in modules:
        lessons = sorted(module.lessons, key=lambda lesson: lesson.index)
        for lesson in lessons:
            yield module, lesson


def find_lesson(
    course: CourseRecord, lesson_id: str
) -> tuple[ModuleRecord, LessonRecord] | None:
    for module, lesson in structure(course):
        if lesson.id == lesson_id:
            return module, lesson
    return None


def read_map(reads: list[LessonRead] | dict[str, LessonRead]) -> dict[str, LessonRead]:
    if isinstance(reads, dict):
        return reads
    return {row.lesson_id: row for row in reads}


def is_read(reads: dict[str, LessonRead], lesson_id: str) -> bool:
    row = reads.get(lesson_id)
    return row is not None and row.read


def percent(part: int, whole: int) -> int | None:
    """Truncate toward zero. 100 only when every counted lesson is read."""
    if whole <= 0:
        return None
    return (part * 100) // whole


def course_counts(
    course: CourseRecord, reads: dict[str, LessonRead]
) -> tuple[int, int]:
    """Lc is every current lesson. Rc is published lessons marked read."""
    lesson_total = 0
    lessons_read = 0
    for module, lesson in structure(course):
        lesson_total += 1
        if module.state == ModuleState.PUBLISHED and is_read(reads, lesson.id):
            lessons_read += 1
    return lesson_total, lessons_read


def course_is_completed(
    course: CourseRecord, lesson_total: int, lessons_read: int
) -> bool:
    """BR-PRG-003. Build completion and learning completion are different facts."""
    if course.state != CourseState.COMPLETE or lesson_total <= 0:
        return False
    if lessons_read != lesson_total:
        return False
    return all(module.state == ModuleState.PUBLISHED for module in course.modules)


def learning_status(lessons_read: int, completed: bool) -> LearningStatus:
    if completed:
        return LearningStatus.COMPLETED
    if lessons_read == 0:
        return LearningStatus.NOT_STARTED
    return LearningStatus.IN_PROGRESS


def module_learning_status(
    publication: ModuleState, lessons_read: int, lesson_total: int
) -> LearningStatus | None:
    if publication != ModuleState.PUBLISHED or lesson_total <= 0:
        return None
    if lessons_read <= 0:
        return LearningStatus.NOT_STARTED
    if lessons_read < lesson_total:
        return LearningStatus.IN_PROGRESS
    return LearningStatus.COMPLETED


def resume_lesson_id(course: CourseRecord, last_lesson_id: str | None) -> str | None:
    first_published: str | None = None
    for module, lesson in structure(course):
        if module.state != ModuleState.PUBLISHED:
            continue
        if first_published is None:
            first_published = lesson.id
        if last_lesson_id is not None and lesson.id == last_lesson_id:
            return lesson.id
    return first_published


def reconcile_progress_row(
    course: CourseRecord,
    reads: dict[str, LessonRead],
    progress: CourseLearningProgress | None,
    now: datetime,
) -> CourseLearningProgress | None:
    """Return a row to persist when completion timestamps disagree with the structure.

    `None` means the stored timestamps already match. A missing row is created
    only when the course is actually completed.
    """
    lesson_total, lessons_read = course_counts(course, reads)
    completed = course_is_completed(course, lesson_total, lessons_read)
    if progress is None:
        if not completed:
            return None
        return CourseLearningProgress(
            user_id=course.user_id,
            course_id=course.id,
            first_completed_at=now,
            current_completed_at=now,
        )
    if completed:
        if (
            progress.first_completed_at is not None
            and progress.current_completed_at is not None
        ):
            return None
        return replace(
            progress,
            first_completed_at=progress.first_completed_at or now,
            current_completed_at=progress.current_completed_at or now,
        )
    if progress.current_completed_at is None:
        return None
    return replace(progress, current_completed_at=None)


def build_snapshot(
    course: CourseRecord,
    reads: list[LessonRead] | dict[str, LessonRead],
    progress: CourseLearningProgress | None,
) -> CourseProgressResponse:
    mapped = read_map(reads)
    lesson_total, lessons_read = course_counts(course, mapped)
    completed = course_is_completed(course, lesson_total, lessons_read)
    modules: list[ModuleProgress] = []
    lessons: list[LessonProgress] = []
    for module, lesson in structure(course):
        row = mapped.get(lesson.id)
        read = (
            module.state == ModuleState.PUBLISHED
            and row is not None
            and row.read
        )
        lessons.append(
            LessonProgress(
                lesson_id=lesson.id,
                module_id=module.id,
                read=read,
                marked_at=row.marked_at if read and row is not None else None,
                updated_at=row.updated_at if row is not None else None,
            )
        )
    for module in sorted(course.modules, key=lambda item: item.index):
        lesson_ids = [lesson.id for lesson in module.lessons]
        total = len(lesson_ids)
        read_count = 0
        if module.state == ModuleState.PUBLISHED:
            read_count = sum(
                1 for lesson_id in lesson_ids if is_read(mapped, lesson_id)
            )
        modules.append(
            ModuleProgress(
                module_id=module.id,
                index=module.index,
                publication_state=module.state,
                lesson_total=total,
                lessons_read=read_count,
                percent=(
                    percent(read_count, total)
                    if module.state == ModuleState.PUBLISHED
                    else None
                ),
                learning_status=module_learning_status(
                    module.state, read_count, total
                ),
            )
        )
    last_lesson_id = progress.last_lesson_id if progress is not None else None
    presented = (
        progress.synthesis_auto_presented_at if progress is not None else None
    )
    first_completed = progress.first_completed_at if progress is not None else None
    return CourseProgressResponse(
        course_id=course.id,
        build_state=course.state,
        learning_status=learning_status(lessons_read, completed),
        lesson_total=lesson_total,
        lessons_read=lessons_read,
        percent=percent(lessons_read, lesson_total),
        modules=modules,
        lessons=lessons,
        last_lesson_id=last_lesson_id,
        resume_lesson_id=resume_lesson_id(course, last_lesson_id),
        last_activity_at=progress.last_activity_at if progress is not None else None,
        position_revision=progress.position_revision if progress is not None else 0,
        first_completed_at=first_completed,
        current_completed_at=(
            progress.current_completed_at if progress is not None else None
        ),
        synthesis_auto_presented_at=presented,
        synthesis_auto_open_pending=(
            completed and first_completed is not None and presented is None
        ),
    )


def apply_read_mark(
    course: CourseRecord,
    reads: dict[str, LessonRead],
    progress: CourseLearningProgress | None,
    *,
    user_id: str,
    lesson_id: str,
    read: bool,
    expected_updated_at: datetime | None,
    now: datetime,
) -> WriteResult:
    """BR-PRG-001. Repeating the current mark is a no-op. A stale change is refused."""
    found = find_lesson(course, lesson_id)
    if found is None:
        return WriteResult(ProgressWrite.NOT_FOUND, reads, progress)
    module, _lesson = found
    if module.state != ModuleState.PUBLISHED:
        return WriteResult(ProgressWrite.NOT_ACCESSIBLE, reads, progress)
    current = reads.get(lesson_id)
    current_read = current is not None and current.read
    if read == current_read:
        return WriteResult(ProgressWrite.UNCHANGED, reads, progress)
    current_updated = current.updated_at if current is not None else None
    if not same_instant(expected_updated_at, current_updated):
        return WriteResult(ProgressWrite.STALE, reads, progress)
    stamp = fresh_stamp(current.updated_at if current is not None else None, now)
    new_reads = dict(reads)
    new_reads[lesson_id] = LessonRead(
        user_id=user_id,
        lesson_id=lesson_id,
        course_id=course.id,
        read=read,
        marked_at=stamp if read else None,
        updated_at=stamp,
    )
    base = progress or CourseLearningProgress(user_id=user_id, course_id=course.id)
    base = replace(base, last_activity_at=now)
    base = _with_completion(course, new_reads, base, now)
    return WriteResult(ProgressWrite.APPLIED, new_reads, base)


def record_lesson_visit(
    course: CourseRecord,
    reads: dict[str, LessonRead],
    progress: CourseLearningProgress | None,
    *,
    user_id: str,
    lesson_id: str,
    position_revision: int,
    now: datetime,
) -> WriteResult:
    """Opening a lesson updates position. It does not mark the lesson read."""
    found = find_lesson(course, lesson_id)
    if found is None:
        return WriteResult(ProgressWrite.NOT_FOUND, reads, progress)
    module, _lesson = found
    if module.state != ModuleState.PUBLISHED:
        return WriteResult(ProgressWrite.NOT_ACCESSIBLE, reads, progress)
    if progress is not None and progress.last_lesson_id == lesson_id:
        refreshed = replace(progress, last_activity_at=now)
        return WriteResult(ProgressWrite.UNCHANGED, reads, refreshed)
    current_revision = 0 if progress is None else progress.position_revision
    if position_revision != current_revision:
        return WriteResult(ProgressWrite.STALE, reads, progress)
    base = progress or CourseLearningProgress(user_id=user_id, course_id=course.id)
    moved = replace(
        base,
        last_lesson_id=lesson_id,
        last_activity_at=now,
        position_revision=base.position_revision + 1,
    )
    return WriteResult(ProgressWrite.APPLIED, reads, moved)


def record_synthesis_presentation(
    reads: dict[str, LessonRead],
    progress: CourseLearningProgress | None,
    *,
    now: datetime,
) -> WriteResult:
    """Record the one automatic opening. A second call keeps the original timestamp."""
    if progress is None or progress.first_completed_at is None:
        return WriteResult(ProgressWrite.NOT_READY, reads, progress)
    if progress.synthesis_auto_presented_at is not None:
        return WriteResult(ProgressWrite.UNCHANGED, reads, progress)
    presented = replace(progress, synthesis_auto_presented_at=now)
    return WriteResult(ProgressWrite.APPLIED, reads, presented)


def _with_completion(
    course: CourseRecord,
    reads: dict[str, LessonRead],
    progress: CourseLearningProgress,
    now: datetime,
) -> CourseLearningProgress:
    updated = reconcile_progress_row(course, reads, progress, now)
    return updated if updated is not None else progress


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
