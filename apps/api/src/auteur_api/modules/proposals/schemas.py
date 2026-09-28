"""Proposal contracts (AI-STG-04, BR-PRP-001..007)."""

from __future__ import annotations

from datetime import datetime
from typing import ClassVar, Literal

from pydantic import BaseModel

DifferentiationDimension = Literal[
    "central_question",
    "perspective",
    "organizing_principle",
    "scale_or_scope",
    "authors_or_traditions",
    "content_order",
    "balance_history_theory_system_cases",
    "intellectual_outcome",
    "depth",
    "reasoning_type",
]


# --- Model output (strict schema: every field required, use `| None`) ---


class CourseProposalOutput(BaseModel):
    title: str
    description: str
    central_question: str
    intellectual_outcome: str
    distinctive_trajectory: str
    organizing_principle: str
    scope: list[str]
    exclusions: list[str]
    level_fit: str
    guiding_authors_or_traditions: list[str]
    estimated_modules: int
    estimated_duration: str
    main_advantage: str
    trade_off: str


class PairwiseDifferenceOutput(BaseModel):
    proposal_a_index: int
    proposal_b_index: int
    differing_dimensions: list[DifferentiationDimension]
    explanation: str


class ProposalSetOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "proposal_set_v1"

    proposals: list[CourseProposalOutput]
    pairwise_differences: list[PairwiseDifferenceOutput]
    recommended_proposal_index: int | None
    recommendation_reason: str | None


# --- Records and API responses ---


class CourseProposal(CourseProposalOutput):
    id: str


class ProposalSetRecord(BaseModel):
    id: str
    objective_version: int
    proposals: list[CourseProposal]
    recommended_proposal_id: str | None
    recommendation_reason: str | None
    pairwise_differences: list[PairwiseDifferenceOutput]
    created_at: datetime


class ProposalSetResponse(BaseModel):
    id: str
    objective_version: int
    proposals: list[CourseProposal]
    recommended_proposal_id: str | None
    recommendation_reason: str | None


class SelectProposalRequest(BaseModel):
    proposal_id: str
