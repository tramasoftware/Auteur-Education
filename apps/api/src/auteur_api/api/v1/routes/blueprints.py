from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from auteur_api.ai.client import AIClient, get_ai_client
from auteur_api.core.auth import CurrentUserId
from auteur_api.core.background import TaskRunner, bind_request_tasks, get_task_runner
from auteur_api.core.store import Store as StoreBackend
from auteur_api.core.errors import invalid_state
from auteur_api.core.store import get_store
from auteur_api.modules.blueprints import service as blueprints
from auteur_api.modules.generation.service import active_build_course_id
from auteur_api.modules.blueprints.schemas import (
    ApproveBlueprintRequest,
    BlueprintResponse,
    ReviseBlueprintRequest,
    to_response,
)
from auteur_api.modules.generation import build

router = APIRouter(tags=["blueprints"])

Store = Annotated[StoreBackend, Depends(get_store)]
AI = Annotated[AIClient, Depends(get_ai_client)]
Runner = Annotated[TaskRunner, Depends(get_task_runner)]


class ApproveBlueprintResponse(BaseModel):
    course_id: str
    blueprint_version: int


@router.post(
    "/learning-requests/{request_id}/blueprint",
    response_model=BlueprintResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_blueprint(
    request_id: str,
    store: Store,
    ai: AI,
    runner: Runner,
    user_id: CurrentUserId,
    _: Annotated[None, Depends(bind_request_tasks)],
) -> BlueprintResponse:
    """UF-04: start Blueprint generation in the background; poll GET for state."""
    store.get_learning_request(request_id, user_id=user_id)
    active_id = active_build_course_id(store, user_id)
    if active_id is not None:
        raise invalid_state(
            "A course is already being generated. Follow that build before "
            "starting another."
        )
    record = await blueprints.start_blueprint(
        request_id, ai=ai, store=store, runner=runner
    )
    return to_response(record)


@router.get("/blueprints/{blueprint_id}", response_model=BlueprintResponse)
def get_blueprint(
    blueprint_id: str, store: Store, user_id: CurrentUserId
) -> BlueprintResponse:
    return to_response(store.get_blueprint(blueprint_id, user_id=user_id))


@router.post(
    "/blueprints/{blueprint_id}/revisions",
    response_model=BlueprintResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def revise_blueprint(
    blueprint_id: str,
    payload: ReviseBlueprintRequest,
    store: Store,
    ai: AI,
    runner: Runner,
    user_id: CurrentUserId,
    _: Annotated[None, Depends(bind_request_tasks)],
) -> BlueprintResponse:
    """BR-BLP-009: a change request produces a new complete version."""
    store.get_blueprint(blueprint_id, user_id=user_id)
    record = await blueprints.revise_blueprint(
        blueprint_id, payload.feedback, ai=ai, store=store, runner=runner
    )
    return to_response(record)


@router.post(
    "/blueprints/{blueprint_id}/approve",
    response_model=ApproveBlueprintResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def approve_blueprint(
    blueprint_id: str,
    payload: ApproveBlueprintRequest,
    store: Store,
    ai: AI,
    runner: Runner,
    user_id: CurrentUserId,
    _: Annotated[None, Depends(bind_request_tasks)],
) -> ApproveBlueprintResponse:
    """BR-BLP-010 / BR-GEN-001: approve the exact version and start one build."""
    store.get_blueprint(blueprint_id, user_id=user_id)
    course_id = blueprints.approve_blueprint(blueprint_id, payload.version, store=store)
    await build.ensure_started(course_id, ai=ai, store=store, runner=runner)
    return ApproveBlueprintResponse(
        course_id=course_id, blueprint_version=payload.version
    )
