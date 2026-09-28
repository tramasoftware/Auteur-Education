"""Course build contracts (AI-STG-06..16, BR-GEN-*, BR-SRC-*, BR-KCK-*).

Model output schemas are strict (every field required, `| None` for optional).
Records hold the full build state in memory; API responses only expose published
content (BR-GEN-004) plus real, persisted build states (BR-GEN-007).
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import ClassVar, Literal

from pydantic import BaseModel

from auteur_api.modules.blueprints.schemas import BlueprintInternal


class CourseState(StrEnum):
    QUEUED = "queued"
    RESEARCHING = "researching"
    WRITING = "writing"
    REVIEWING = "reviewing"
    PARTIALLY_AVAILABLE = "partially_available"
    COMPLETE = "complete"
    FAILED = "failed"


class ModuleState(StrEnum):
    QUEUED = "queued"
    RESEARCHING = "researching"
    WRITING = "writing"
    REVIEWING = "reviewing"
    PUBLISHED = "published"
    FAILED = "failed"
    NOT_BUILT = "not_built"  # DEC-007 demo module limit


class LessonState(StrEnum):
    QUEUED = "queued"
    RESEARCHING = "researching"
    WRITING = "writing"
    REVIEWING = "reviewing"
    APPROVED = "approved"
    FAILED = "failed"


# --- Research and evidence (AI-STG-06/07) ---

SourceType = Literal[
    "primary",
    "academic",
    "institution",
    "reference_work",
    "specialized_media",
    "general",
]
SourceRole = Literal[
    "primary_support",
    "corroboration",
    "counterpoint",
    "orientation",
    "complementary",
]
SupportLevel = Literal["strong", "moderate", "weak"]


class PlannedClaimOutput(BaseModel):
    claim: str
    evidence_type: str
    needs_contrast: bool


class EvidenceItemOutput(BaseModel):
    ref: str
    url: str
    title: str
    author_or_institution: str | None
    date: str | None
    source_type: SourceType
    relevant_excerpt: str
    supports_claims: list[str]
    support_level: SupportLevel
    limits: str | None
    role: SourceRole


class ResearchOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "research_v1"

    research_questions: list[str]
    planned_claims: list[PlannedClaimOutput]
    search_queries: list[str]
    evidence: list[EvidenceItemOutput]
    unresolved_claims: list[str]
    blocking_conditions: list[str]


Verification = Literal["retrieved", "unverified"]


class EvidenceItem(EvidenceItemOutput):
    verification: Verification
    retrieved_at: datetime


# --- Lesson spec, draft, review (AI-STG-08..11) ---


class LessonSpecOutput(BaseModel):
    lesson_objective: str
    intellectual_gain: str
    entry_knowledge: str
    core_concepts: list[str]
    main_claims: list[str]
    assigned_evidence_refs: list[str]
    argument_path: str
    verbal_examples: list[str]
    limit_or_controversy: str
    link_to_previous: str
    bridge_to_next: str
    target_words: int
    acceptance_criteria: list[str]


SectionKind = Literal[
    "problem",
    "central_idea",
    "concepts",
    "argument",
    "example",
    "limit_or_contrast",
    "synthesis",
    "bridge",
]


class LessonSectionOutput(BaseModel):
    kind: SectionKind
    heading: str
    body: str


class LessonDraftOutput(BaseModel):
    title: str
    sections: list[LessonSectionOutput]
    sources_used_refs: list[str]


class LessonWriteOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "lesson_write_v1"

    spec: LessonSpecOutput
    draft: LessonDraftOutput


ClaimStatus = Literal["Supported", "Needs revision", "Needs research", "Remove"]
ReviewResult = Literal["Pass", "Revise", "Research again", "Block"]
QaCheckName = Literal[
    "structure",
    "objective_fidelity",
    "level_fit",
    "progression",
    "source_traceability",
    "claim_accuracy",
    "specificity_depth",
    "coherence",
    "audio_fitness",
    "safety",
]


class ClaimAuditItemOutput(BaseModel):
    text: str
    type: Literal["factual", "interpretive", "pedagogical", "transitional"]
    importance: Literal["central", "secondary"]
    evidence_refs: list[str]
    support_level: Literal["strong", "moderate", "weak", "none"]
    needs_contrast: bool
    status: ClaimStatus
    recommended_fix: str | None


class QaCheckOutput(BaseModel):
    check: QaCheckName
    passed: bool
    note: str


class LessonReviewOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "lesson_review_v1"

    claims: list[ClaimAuditItemOutput]
    checks: list[QaCheckOutput]
    result: ReviewResult
    issues: list[str]
    corrective_actions: list[str]


# --- Module synthesis, Knowledge Check, audits (AI-STG-12..16) ---


class ModuleSynthesisOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "module_synthesis_v1"

    body: str


class KnowledgeCheckOptionOutput(BaseModel):
    text: str
    is_correct: bool
    explanation: str


class KnowledgeCheckQuestionOutput(BaseModel):
    question: str
    options: list[KnowledgeCheckOptionOutput]
    assessed_concepts: list[str]
    related_lesson_titles: list[str]


class KnowledgeCheckOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "knowledge_check_v1"

    questions: list[KnowledgeCheckQuestionOutput]


AuditResult = Literal["Pass", "Revise", "Block"]


class ModuleAuditOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "module_audit_v1"

    result: AuditResult
    issues: list[str]
    notes: str


class CourseSynthesisOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "course_synthesis_v1"

    body: str
    new_questions: list[str]


class CourseAuditOutput(BaseModel):
    SCHEMA_VERSION: ClassVar[str] = "course_audit_v1"

    result: AuditResult
    issues: list[str]
    notes: str


# --- Records ---


class LessonRecord(BaseModel):
    id: str
    index: int
    title: str
    purpose: str
    state: LessonState = LessonState.QUEUED
    attempts: int = 0
    research_rounds: int = 0
    evidence: list[EvidenceItem] = []
    research_questions: list[str] = []
    unresolved_claims: list[str] = []
    spec: LessonSpecOutput | None = None
    draft: LessonDraftOutput | None = None
    word_count: int = 0
    review: LessonReviewOutput | None = None
    failure: str | None = None


class ModuleRecord(BaseModel):
    id: str
    index: int
    title: str
    function: str
    guiding_questions: list[str]
    outcome: str
    qa_criteria: list[str]
    state: ModuleState = ModuleState.QUEUED
    lessons: list[LessonRecord] = []
    synthesis: str | None = None
    knowledge_check: KnowledgeCheckOutput | None = None
    audit: ModuleAuditOutput | None = None
    published_at: datetime | None = None
    failure: str | None = None


class CourseRecord(BaseModel):
    id: str
    request_id: str
    blueprint_id: str
    blueprint_version: int
    title: str
    subtitle: str
    objective_statement: str
    state: CourseState = CourseState.QUEUED
    current_activity: str | None = None
    modules: list[ModuleRecord] = []
    final_synthesis: CourseSynthesisOutput | None = None
    course_audit: CourseAuditOutput | None = None
    failure: str | None = None
    module_limit: int | None = None
    created_at: datetime
    completed_at: datetime | None = None


# --- API responses (published content only) ---


class ModuleSummary(BaseModel):
    id: str
    index: int
    title: str
    function: str
    state: ModuleState
    lesson_count: int
    published_at: datetime | None


class CourseResponse(BaseModel):
    id: str
    request_id: str
    blueprint_id: str
    blueprint_version: int
    title: str
    subtitle: str
    objective_statement: str
    state: CourseState
    current_activity: str | None
    modules: list[ModuleSummary]
    final_synthesis: CourseSynthesisOutput | None
    failure: str | None
    module_limit: int | None


class LessonSummary(BaseModel):
    id: str
    index: int
    title: str
    purpose: str
    word_count: int


class SourceView(BaseModel):
    ref: str
    url: str
    title: str
    author_or_institution: str | None
    date: str | None
    source_type: SourceType
    role: SourceRole
    verification: Verification


class ModuleResponse(BaseModel):
    id: str
    course_id: str
    index: int
    title: str
    function: str
    guiding_questions: list[str]
    outcome: str
    state: ModuleState
    lessons: list[LessonSummary]
    synthesis: str | None
    knowledge_check: KnowledgeCheckOutput | None
    sources: list[SourceView]
    published_at: datetime | None


class LessonResponse(BaseModel):
    id: str
    course_id: str
    module_id: str
    index: int
    title: str
    purpose: str
    sections: list[LessonSectionOutput]
    sources: list[SourceView]
    word_count: int
    previous_lesson_id: str | None
    next_lesson_id: str | None


# --- Demo diagnostics (DEC-005) ---


class LessonDiagnostics(BaseModel):
    id: str
    title: str
    state: LessonState
    attempts: int
    research_rounds: int
    evidence_total: int
    evidence_retrieved: int
    unresolved_claims: list[str]
    word_count: int
    review_result: ReviewResult | None
    review_issues: list[str]
    claim_audit: list[ClaimAuditItemOutput]
    failure: str | None


class ModuleDiagnostics(BaseModel):
    id: str
    title: str
    state: ModuleState
    qa_criteria: list[str]
    lessons: list[LessonDiagnostics]
    audit: ModuleAuditOutput | None
    failure: str | None


class CourseDiagnosticsResponse(BaseModel):
    course_id: str
    state: CourseState
    model: str
    blueprint_internal: BlueprintInternal
    modules: list[ModuleDiagnostics]
    course_audit: CourseAuditOutput | None
    trace_summary: dict
    traces: list[dict]
