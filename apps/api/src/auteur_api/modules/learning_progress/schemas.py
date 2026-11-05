"""API contracts for learner progress (BR-PRG-001..005).

Availability stays on the build records. These models are the learning view.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from auteur_api.modules.generation.schemas import CourseState, ModuleState


class LearningStatus(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class ModuleProgress(BaseModel):
    module_id: str
    index: int
    publication_state: ModuleState
    lesson_total: int
    lessons_read: int
    percent: int | None
    learning_status: LearningStatus | None


class LessonProgress(BaseModel):
    lesson_id: str
    module_id: str
    read: bool
    marked_at: datetime | None
    updated_at: datetime | None


class CourseProgressResponse(BaseModel):
    course_id: str
    build_state: CourseState
    learning_status: LearningStatus
    lesson_total: int
    lessons_read: int
    percent: int | None
    modules: list[ModuleProgress]
    lessons: list[LessonProgress]
    last_lesson_id: str | None
    resume_lesson_id: str | None
    last_activity_at: datetime | None
    position_revision: int
    first_completed_at: datetime | None
    current_completed_at: datetime | None
    synthesis_auto_presented_at: datetime | None
    synthesis_auto_open_pending: bool


class LessonReadRequest(BaseModel):
    read: bool
    updated_at: datetime | None = None


class LessonVisitRequest(BaseModel):
    position_revision: int = Field(ge=0)
