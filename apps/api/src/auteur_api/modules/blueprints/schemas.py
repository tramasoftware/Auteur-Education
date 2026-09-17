"""Blueprint contracts (AI-STG-05, BR-BLP-002..011).

The visible part is what the learner reviews and approves (BR-BLP-003). The
internal part guides generation and QA and is never shown as product content
(BR-BLP-004); it is only observable through demo diagnostics (DEC-005).
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import ClassVar, Literal

from pydantic import BaseModel, Field

from auteur_api.core.config import settings

MaterialistClassification = Literal["Central", "Complementary", "Not applicable"]


class BlueprintState(StrEnum):
    GENERATING = "generating"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    FAILED = "failed"


# --- Model output (strict schema) ---


class PlannedLessonOutput(BaseModel):
    title: str
    purpose: str


class PlannedModuleOutput(BaseModel):
    title: str
    function: str
    guiding_questions: list[str]
    outcome: str
    lessons: list[PlannedLessonOutput]


class BlueprintEstimates(BaseModel):
    modules: int
    lessons: int
    words: int
    study_hours: str


class BlueprintVisible(BaseModel):
    title: str
    subtitle: str
    objective_statement: str
    expected_outcome: str
    central_problem: str
    level_and_assumed_knowledge: str
    scope: list[str]
    exclusions: list[str]
    organizing_principle: str
    intellectual_arc: str
    modules: list[PlannedModuleOutput]
    order_justification: str
    length_justification: str
    estimates: BlueprintEstimates
    guiding_sources_or_traditions: list[str]
    relevant_controversies: list[str]
    risks_and_limitations: list[str]


class ModuleQaCriteria(BaseModel):
    module_title: str
    criteria: list[str]


class BlueprintInternal(BaseModel):
    conceptual_dependencies: list[str]
    prerequisites: list[str]
    foreseeable_confusions: list[str]
    claims_requiring_research: list[str]
    evidence_risks: list[str]
    materialist_classification: MaterialistClassification
    materialist_justification: str
    qa_criteria_per_module: list[ModuleQaCriteria]
    structure_deviation_reasons: str | None


class BlueprintOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "blueprint_v1"

    visible: BlueprintVisible
    internal: BlueprintInternal


# --- Record and API ---


class BlueprintVersion(BaseModel):
    version: int
    visible: BlueprintVisible
    internal: BlueprintInternal
    feedback: str | None
    created_at: datetime


class BlueprintRecord(BaseModel):
    id: str
    request_id: str
    proposal_id: str
    objective_version: int
    state: BlueprintState
    versions: list[BlueprintVersion] = []
    pending_feedback: str | None = None
    approved_version: int | None = None
    course_id: str | None = None
    failure_message: str | None = None
    created_at: datetime

    @property
    def current(self) -> BlueprintVersion | None:
        return self.versions[-1] if self.versions else None


class BlueprintResponse(BaseModel):
    id: str
    request_id: str
    proposal_id: str
    state: BlueprintState
    current_version: int | None
    blueprint: BlueprintVisible | None
    previous_versions: list[int]
    approved_version: int | None
    course_id: str | None
    failure_message: str | None


class ReviseBlueprintRequest(BaseModel):
    feedback: str = Field(min_length=1, max_length=settings.max_free_text_chars)


class ApproveBlueprintRequest(BaseModel):
    version: int


def to_response(record: BlueprintRecord) -> BlueprintResponse:
    current = record.current
    return BlueprintResponse(
        id=record.id,
        request_id=record.request_id,
        proposal_id=record.proposal_id,
        state=record.state,
        current_version=current.version if current else None,
        blueprint=current.visible if current else None,
        previous_versions=[v.version for v in record.versions[:-1]],
        approved_version=record.approved_version,
        course_id=record.course_id,
        failure_message=record.failure_message,
    )
