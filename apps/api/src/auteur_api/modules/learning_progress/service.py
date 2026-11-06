"""Owner-checked learning progress. Screens read this; they do not decide it."""

from __future__ import annotations

import logging
from datetime import datetime

from auteur_api.ai.tracing import now
from auteur_api.core.errors import ApiError, invalid_state, not_found
from auteur_api.core.store import Store
from auteur_api.modules.generation.schemas import CourseRecord
from auteur_api.modules.learning_progress.logic import (
    CourseLearningProgress,
    LessonRead,
    ProgressWrite,
    build_snapshot,
    read_map,
    reconcile_progress_row,
)
from auteur_api.modules.learning_progress.schemas import CourseProgressResponse

logger = logging.getLogger("auteur_api.learning_progress")


def snapshot_for(
    store: Store,
    course: CourseRecord,
    reads: list[LessonRead],
    progress: CourseLearningProgress | None,
) -> CourseProgressResponse:
    """Repair completion timestamps, then build the learning snapshot."""
    if reconcile_progress_row(course, read_map(reads), progress, now()) is not None:
        try:
            store.reconcile_learning_progress(course.user_id, course.id)
            progress = store.get_course_learning_progress(course.user_id, course.id)
        except Exception:
            logger.exception(
                "learning_progress_reconcile_failed course=%s", course.id
            )
    return build_snapshot(course, reads, progress)


def get_course_progress(
    store: Store, course_id: str, user_id: str
) -> CourseProgressResponse:
    """Return learning progress, repairing completion timestamps if needed."""
    course = store.get_course_outline(course_id, user_id=user_id)
    reads = store.list_lesson_reads(user_id, course_id)
    progress = store.get_course_learning_progress(user_id, course_id)
    return snapshot_for(store, course, reads, progress)


def set_lesson_read(
    store: Store,
    course_id: str,
    lesson_id: str,
    user_id: str,
    *,
    read: bool,
    expected_updated_at: datetime | None,
) -> CourseProgressResponse:
    outcome = store.apply_lesson_read(
        user_id,
        course_id,
        lesson_id,
        read=read,
        expected_updated_at=expected_updated_at,
    )
    _reject(
        outcome,
        stale=(
            "This lesson mark changed on another device. Reload progress and "
            "try again."
        ),
        inaccessible="Only a published lesson can be marked as read.",
    )
    return get_course_progress(store, course_id, user_id)


def visit_lesson(
    store: Store,
    course_id: str,
    lesson_id: str,
    user_id: str,
    *,
    position_revision: int,
) -> CourseProgressResponse:
    outcome = store.record_lesson_visit(
        user_id,
        course_id,
        lesson_id,
        position_revision=position_revision,
    )
    _reject(
        outcome,
        stale=(
            "Your place in the course changed on another device. Reload progress "
            "and try again."
        ),
        inaccessible="Only a published lesson can be opened.",
    )
    return get_course_progress(store, course_id, user_id)


def present_synthesis(
    store: Store, course_id: str, user_id: str
) -> CourseProgressResponse:
    outcome = store.record_synthesis_presentation(user_id, course_id)
    _reject(
        outcome,
        stale="This progress changed on another device. Reload it and try again.",
        inaccessible="Only a published lesson can be opened.",
    )
    return get_course_progress(store, course_id, user_id)


def reconcile_after_build(store: Store, course: CourseRecord) -> None:
    """Record completion when the build finishes and the learner is elsewhere.

    A failure here must not fail generation. The next progress read repairs it.
    """
    if not course.user_id:
        return
    try:
        store.reconcile_learning_progress(course.user_id, course.id)
    except Exception:
        logger.exception(
            "learning_progress_reconcile_failed course=%s", course.id
        )


def _reject(outcome: ProgressWrite, *, stale: str, inaccessible: str) -> None:
    if outcome is ProgressWrite.STALE:
        raise ApiError("stale_version", stale)
    if outcome is ProgressWrite.NOT_FOUND:
        raise not_found("Lesson")
    if outcome is ProgressWrite.NOT_ACCESSIBLE:
        raise invalid_state(inaccessible)
    if outcome is ProgressWrite.NOT_READY:
        raise invalid_state("The final synthesis has not been earned yet.")
