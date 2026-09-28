"""Learning request contracts: onboarding, compatibility, precision, objective.

Covers AI-STG-01/02/03 outputs, the in-memory record and the API models
(MVP.md §2-4, USER_FLOWS UF-01..UF-03, BUSINESS_RULES BR-ONB-*, BR-OBJ-*).
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import ClassVar, Literal

from pydantic import BaseModel, Field

from auteur_api.core.config import settings
from auteur_api.modules.proposals.schemas import ProposalSetRecord, ProposalSetResponse


class ExperienceLevel(StrEnum):
    # BR-ONB-004: exactly one of these values.
    NONE = "None"
    BASIC = "Basic"
    INTERMEDIATE = "Intermediate"
    ADVANCED = "Advanced"


class RequestState(StrEnum):
    DRAFT = "draft"
    INCOMPATIBLE = "incompatible"
    PRECISION_REQUIRED = "precision_required"
    OBJECTIVE_CONFIRMATION = "objective_confirmation"
    OBJECTIVE_CONFIRMED = "objective_confirmed"
    PROPOSALS_READY = "proposals_ready"
    PROPOSAL_SELECTED = "proposal_selected"
    BLUEPRINT_GENERATING = "blueprint_generating"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"


Compatibility = Literal["Allowed", "Allowed with reframing", "Incompatible"]


# --- API requests ---

_MAX = settings.max_free_text_chars


class CreateLearningRequest(BaseModel):
    initial_intent: str = Field(min_length=1, max_length=_MAX)
    experience_level: ExperienceLevel
    prior_knowledge: str | None = Field(default=None, max_length=_MAX)
    expected_outcome: str = Field(min_length=1, max_length=_MAX)


class PrecisionSelectionRequest(BaseModel):
    option_id: str | None = None
    free_text: str | None = Field(default=None, min_length=1, max_length=_MAX)


class ConfirmObjectiveRequest(BaseModel):
    version: int


class ReviseObjectiveRequest(BaseModel):
    feedback: str = Field(min_length=1, max_length=_MAX)


# --- Model outputs (strict schema: all fields required, use `| None`) ---


class CompatibilityAssessment(BaseModel):
    classification: Compatibility
    explanation: str
    compatible_aspects: list[str]
    unreachable_aspects: list[str]
    safe_reframing: str | None
    risk_category: str | None


class PrecisionOptionOutput(BaseModel):
    title: str
    explanation: str
    relation_to_intention: str


class PrecisionResultOutput(BaseModel):
    needs_precision: bool
    reason: str
    options: list[PrecisionOptionOutput]
    allows_free_text: bool


class RequestAnalysisOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "request_analysis_v1"

    input_is_english: bool
    detected_language: str
    interpreted_intention: str
    learning_domain: str
    explicitly_stated: list[str]
    reasonably_inferred: list[str]
    ambiguities: list[str]
    compatibility: CompatibilityAssessment
    precision: PrecisionResultOutput


class LearningObjectiveOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "learning_objective_v1"

    statement: str
    observable_capability: str
    learning_object: str
    assumed_level_and_knowledge: str
    scope: list[str]
    exclusions: list[str]
    achievement_criteria: list[str]
    medium_limitations: list[str]


# --- Record (in-memory) ---


class LearningRequestInputs(BaseModel):
    initial_intent: str
    experience_level: ExperienceLevel
    prior_knowledge: str | None
    expected_outcome: str


class Interpretation(BaseModel):
    interpreted_intention: str
    learning_domain: str
    explicitly_stated: list[str]
    reasonably_inferred: list[str]
    ambiguities: list[str]


class PrecisionOption(PrecisionOptionOutput):
    id: str


class PrecisionResult(BaseModel):
    needs_precision: bool
    reason: str
    options: list[PrecisionOption]
    allows_free_text: bool


class SelectedPrecision(BaseModel):
    option_id: str | None
    free_text: str | None
    learning_object: str


class ObjectiveVersion(BaseModel):
    version: int
    objective: LearningObjectiveOutput
    confirmed: bool
    feedback: str | None
    created_at: datetime


class LearningRequestRecord(BaseModel):
    id: str
    created_at: datetime
    state: RequestState
    inputs: LearningRequestInputs
    interpretation: Interpretation
    compatibility: CompatibilityAssessment
    precision: PrecisionResult
    selected_precision: SelectedPrecision | None = None
    objective_versions: list[ObjectiveVersion] = []
    proposal_set: ProposalSetRecord | None = None
    selected_proposal_id: str | None = None
    blueprint_id: str | None = None
    course_id: str | None = None

    @property
    def current_objective(self) -> ObjectiveVersion | None:
        return self.objective_versions[-1] if self.objective_versions else None


# --- API responses ---


class ObjectiveResponse(LearningObjectiveOutput):
    version: int
    confirmed: bool


class LearningRequestResponse(BaseModel):
    id: str
    state: RequestState
    inputs: LearningRequestInputs
    compatibility: CompatibilityAssessment
    precision: PrecisionResult
    selected_precision: SelectedPrecision | None
    objective: ObjectiveResponse | None
    proposals: ProposalSetResponse | None
    selected_proposal_id: str | None
    blueprint_id: str | None
    course_id: str | None


def to_response(record: LearningRequestRecord) -> LearningRequestResponse:
    current = record.current_objective
    objective = None
    if current is not None:
        objective = ObjectiveResponse(
            **current.objective.model_dump(),
            version=current.version,
            confirmed=current.confirmed,
        )
    proposals = None
    if record.proposal_set is not None:
        proposals = ProposalSetResponse(
            id=record.proposal_set.id,
            objective_version=record.proposal_set.objective_version,
            proposals=record.proposal_set.proposals,
            recommended_proposal_id=record.proposal_set.recommended_proposal_id,
            recommendation_reason=record.proposal_set.recommendation_reason,
        )
    return LearningRequestResponse(
        id=record.id,
        state=record.state,
        inputs=record.inputs,
        compatibility=record.compatibility,
        precision=record.precision,
        selected_precision=record.selected_precision,
        objective=objective,
        proposals=proposals,
        selected_proposal_id=record.selected_proposal_id,
        blueprint_id=record.blueprint_id,
        course_id=record.course_id,
    )
