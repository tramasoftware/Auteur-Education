from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from auteur_api.ai.client import AIClient, get_ai_client
from auteur_api.core.auth import CurrentUserId
from auteur_api.core.background import TaskRunner, bind_request_tasks, get_task_runner
from auteur_api.core.config import settings
from auteur_api.core.errors import not_found
from auteur_api.core.store import Store as StoreBackend
from auteur_api.core.store import get_store
from auteur_api.modules.generation import build
from auteur_api.modules.generation import service as courses
from auteur_api.modules.generation.schemas import (
    CourseDiagnosticsResponse,
    CourseListResponse,
    CourseResponse,
    LessonResponse,
    ModuleResponse,
)

router = APIRouter(prefix="/courses", tags=["courses"])

Store = Annotated[StoreBackend, Depends(get_store)]
AI = Annotated[AIClient, Depends(get_ai_client)]
Runner = Annotated[TaskRunner, Depends(get_task_runner)]


class ActiveGenerationResponse(BaseModel):
    course_id: str | None


@router.get("", response_model=CourseListResponse)
def list_courses(store: Store, user_id: CurrentUserId) -> CourseListResponse:
    """BR-LIB-001: private library of courses generated for the caller."""
    return courses.list_courses_for_user(store, user_id)


@router.get("/active-generation", response_model=ActiveGenerationResponse)
def active_generation(
    store: Store, user_id: CurrentUserId
) -> ActiveGenerationResponse:
    """BR-GEN-002: course blocking a new creation, if any (DEC-007 demo cap aware)."""
    return ActiveGenerationResponse(
        course_id=courses.active_build_course_id(store, user_id)
    )


@router.get("/{course_id}", response_model=CourseResponse)
def get_course(course_id: str, store: Store, user_id: CurrentUserId) -> CourseResponse:
    """UF-06: real build state and published modules (BR-GEN-007)."""
    return courses.course_view(store.get_course(course_id, user_id=user_id))


@router.get("/{course_id}/modules/{module_id}", response_model=ModuleResponse)
def get_module(
    course_id: str, module_id: str, store: Store, user_id: CurrentUserId
) -> ModuleResponse:
    """UF-07: a published module with lessons, synthesis, Knowledge Check, sources."""
    course = store.get_course(course_id, user_id=user_id)
    module = courses.published_module(course, module_id)
    return courses.module_view(course, module)


@router.get(
    "/{course_id}/modules/{module_id}/lessons/{lesson_id}",
    response_model=LessonResponse,
)
def get_lesson(
    course_id: str,
    module_id: str,
    lesson_id: str,
    store: Store,
    user_id: CurrentUserId,
) -> LessonResponse:
    course = store.get_course(course_id, user_id=user_id)
    module = courses.published_module(course, module_id)
    return courses.lesson_view(course, module, lesson_id)


@router.post(
    "/{course_id}/retry",
    response_model=CourseResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_course(
    course_id: str,
    store: Store,
    ai: AI,
    runner: Runner,
    user_id: CurrentUserId,
    _: Annotated[None, Depends(bind_request_tasks)],
) -> CourseResponse:
    """UF-14: one explicit retry from the same Blueprint. Published modules stay."""
    store.get_course(course_id, user_id=user_id)
    course = await build.retry_failed_build(
        course_id, ai=ai, store=store, runner=runner
    )
    return courses.course_view(course)


@router.get("/{course_id}/diagnostics", response_model=CourseDiagnosticsResponse)
def get_diagnostics(
    course_id: str, store: Store, user_id: CurrentUserId
) -> CourseDiagnosticsResponse:
    """DEC-005: demo-only observability of generation criteria, time and tokens."""
    if not settings.diagnostics_enabled:
        raise not_found("Resource")
    return courses.diagnostics_view(
        store.get_course(course_id, user_id=user_id), store=store
    )
