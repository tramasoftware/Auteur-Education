from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from auteur_api.ai.client import AIClient, get_ai_client
from auteur_api.ai.tracing import StageTrace, TraceSummary, summarize
from auteur_api.core.auth import CurrentUserId
from auteur_api.core.config import settings
from auteur_api.core.errors import invalid_state, not_found
from auteur_api.core.store import Store as StoreBackend
from auteur_api.core.store import get_store
from auteur_api.modules.generation.service import active_build_course_id
from auteur_api.modules.onboarding import service as onboarding
from auteur_api.modules.onboarding.schemas import (
    ConfirmObjectiveRequest,
    CreateLearningRequest,
    LearningRequestResponse,
    PrecisionSelectionRequest,
    RequestState,
    ReviseObjectiveRequest,
    to_response,
)
from auteur_api.modules.proposals import service as proposals
from auteur_api.modules.proposals.schemas import SelectProposalRequest

router = APIRouter(prefix="/learning-requests", tags=["learning-requests"])

Store = Annotated[StoreBackend, Depends(get_store)]
AI = Annotated[AIClient, Depends(get_ai_client)]


@router.post(
    "", response_model=LearningRequestResponse, status_code=status.HTTP_201_CREATED
)
async def create_learning_request(
    payload: CreateLearningRequest, store: Store, ai: AI, user_id: CurrentUserId
) -> LearningRequestResponse:
    """UF-01/UF-02: create the request, classify compatibility, and decide precision.

    The objective is formulated later, with the learning paths (DEC-021).
    """
    active_id = active_build_course_id(store, user_id)
    if active_id is not None:
        raise invalid_state(
            "A course is already being generated. Follow that build before "
            "starting another."
        )
    record = await onboarding.create_learning_request(
        payload, ai=ai, store=store, user_id=user_id
    )
    return to_response(record)


@router.get("/{request_id}", response_model=LearningRequestResponse)
def get_learning_request(
    request_id: str, store: Store, user_id: CurrentUserId
) -> LearningRequestResponse:
    """UF-05: resume from the last persisted step."""
    return to_response(store.get_learning_request(request_id, user_id=user_id))


class RequestDiagnosticsResponse(BaseModel):
    request_id: str
    state: str
    model: str
    trace_summary: TraceSummary
    traces: list[StageTrace]


@router.get("/{request_id}/diagnostics", response_model=RequestDiagnosticsResponse)
def get_request_diagnostics(
    request_id: str, store: Store, user_id: CurrentUserId
) -> RequestDiagnosticsResponse:
    """DEC-005: demo-only latency/tokens per stage for the pre-course steps."""
    if not settings.diagnostics_enabled:
        raise not_found("Resource")
    record = store.get_learning_request(request_id, user_id=user_id)
    traces = store.get_traces(record.id)
    return RequestDiagnosticsResponse(
        request_id=record.id,
        state=record.state,
        model=settings.openai_model,
        trace_summary=summarize(traces),
        traces=traces,
    )


@router.post("/{request_id}/precision", response_model=LearningRequestResponse)
def choose_precision(
    request_id: str,
    payload: PrecisionSelectionRequest,
    store: Store,
    user_id: CurrentUserId,
) -> LearningRequestResponse:
    """UF-02: save the learning-object focus. Formulation happens with the paths."""
    store.get_learning_request(request_id, user_id=user_id)
    record = onboarding.apply_precision(request_id, payload, store=store)
    return to_response(record)


@router.post("/{request_id}/objective/confirm", response_model=LearningRequestResponse)
def confirm_objective(
    request_id: str,
    payload: ConfirmObjectiveRequest,
    store: Store,
    user_id: CurrentUserId,
) -> LearningRequestResponse:
    """BR-OBJ-010: confirm an exact objective version. The product path confirms
    inside POST /directions (DEC-021)."""
    store.get_learning_request(request_id, user_id=user_id)
    record = onboarding.confirm_objective(request_id, payload.version, store=store)
    return to_response(record)


@router.post(
    "/{request_id}/objective/revisions", response_model=LearningRequestResponse
)
async def revise_objective(
    request_id: str,
    payload: ReviseObjectiveRequest,
    store: Store,
    ai: AI,
    user_id: CurrentUserId,
) -> LearningRequestResponse:
    """BR-OBJ-011: a correction creates a new version and invalidates dependents."""
    store.get_learning_request(request_id, user_id=user_id)
    record = await onboarding.revise_objective(
        request_id, payload.feedback, ai=ai, store=store
    )
    return to_response(record)


@router.post("/{request_id}/directions", response_model=LearningRequestResponse)
async def generate_directions(
    request_id: str, store: Store, ai: AI, user_id: CurrentUserId
) -> LearningRequestResponse:
    """DEC-021: formulate the objective, confirm it, and generate learning paths."""
    store.get_learning_request(request_id, user_id=user_id)
    record = await onboarding.prepare_directions(request_id, ai=ai, store=store)
    if record.state == RequestState.OBJECTIVE_CONFIRMED:
        record = await proposals.generate_proposals(request_id, ai=ai, store=store)
    return to_response(record)


@router.post("/{request_id}/proposals", response_model=LearningRequestResponse)
async def generate_proposals(
    request_id: str, store: Store, ai: AI, user_id: CurrentUserId
) -> LearningRequestResponse:
    """UF-03: 1-5 differentiated directions for the confirmed objective."""
    store.get_learning_request(request_id, user_id=user_id)
    record = await proposals.generate_proposals(request_id, ai=ai, store=store)
    return to_response(record)


@router.post("/{request_id}/proposals/select", response_model=LearningRequestResponse)
def select_proposal(
    request_id: str,
    payload: SelectProposalRequest,
    store: Store,
    user_id: CurrentUserId,
) -> LearningRequestResponse:
    """BR-PRP-005: exactly one selected proposal."""
    store.get_learning_request(request_id, user_id=user_id)
    record = proposals.select_proposal(request_id, payload.proposal_id, store=store)
    return to_response(record)
