from typing import Annotated

from fastapi import APIRouter, Depends

from auteur_api.core.config import settings
from auteur_api.core.errors import not_found
from auteur_api.core.store import DemoStore, get_store
from auteur_api.modules.generation import service as courses
from auteur_api.modules.generation.schemas import (
    CourseDiagnosticsResponse,
    CourseResponse,
    LessonResponse,
    ModuleResponse,
)

router = APIRouter(prefix="/courses", tags=["courses"])

Store = Annotated[DemoStore, Depends(get_store)]


@router.get("/{course_id}", response_model=CourseResponse)
def get_course(course_id: str, store: Store) -> CourseResponse:
    """UF-06: real build state and published modules (BR-GEN-007)."""
    return courses.course_view(store.get_course(course_id))


@router.get("/{course_id}/modules/{module_id}", response_model=ModuleResponse)
def get_module(course_id: str, module_id: str, store: Store) -> ModuleResponse:
    """UF-07: a published module with lessons, synthesis, Knowledge Check, sources."""
    course = store.get_course(course_id)
    module = courses.published_module(course, module_id)
    return courses.module_view(course, module)


@router.get(
    "/{course_id}/modules/{module_id}/lessons/{lesson_id}",
    response_model=LessonResponse,
)
def get_lesson(
    course_id: str, module_id: str, lesson_id: str, store: Store
) -> LessonResponse:
    course = store.get_course(course_id)
    module = courses.published_module(course, module_id)
    return courses.lesson_view(course, module, lesson_id)


@router.get("/{course_id}/diagnostics", response_model=CourseDiagnosticsResponse)
def get_diagnostics(course_id: str, store: Store) -> CourseDiagnosticsResponse:
    """DEC-005: demo-only observability of generation criteria, time and tokens."""
    if not settings.diagnostics_enabled:
        raise not_found("Resource")
    return courses.diagnostics_view(store.get_course(course_id), store=store)
