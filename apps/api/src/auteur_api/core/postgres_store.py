"""Supabase/Postgres-backed store. Uses the service role (server-side only)."""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from auteur_api.ai.tracing import StageTrace, TokenUsage
from auteur_api.core.config import Settings, settings
from auteur_api.core.errors import not_found
from auteur_api.core.store import assert_owner
from auteur_api.modules.blueprints.schemas import (
    BlueprintInternal,
    BlueprintRecord,
    BlueprintState,
    BlueprintVersion,
    BlueprintVisible,
)
from auteur_api.modules.generation.schemas import (
    CourseAuditOutput,
    CourseListItem,
    CourseRecord,
    CourseState,
    CourseSynthesisOutput,
    EvidenceItem,
    KnowledgeCheckOutput,
    LessonDraftOutput,
    LessonRecord,
    LessonReviewOutput,
    LessonSpecOutput,
    LessonState,
    ModuleAuditOutput,
    ModuleRecord,
    ModuleState,
)
from auteur_api.modules.onboarding.schemas import (
    CompatibilityAssessment,
    Interpretation,
    LearningObjectiveOutput,
    LearningRequestInputs,
    LearningRequestRecord,
    ObjectiveVersion,
    PrecisionResult,
    RequestState,
    SelectedPrecision,
)
from auteur_api.modules.proposals.schemas import ProposalSetRecord


def _dt(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value).replace("Z", "+00:00")
    return datetime.fromisoformat(text)


def _dump(model: object | None) -> object | None:
    if model is None:
        return None
    return model.model_dump(mode="json")  # type: ignore[union-attr]


class PostgresStore:
    def __init__(self, client: Client) -> None:
        self._client = client
        self._trace_buffer: dict[str, list[StageTrace]] = {}

    def _table(self, name: str):
        return self._client.table(name)

    def _one(self, table: str, id_: str) -> dict[str, Any] | None:
        response = self._table(table).select("*").eq("id", id_).limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None

    def get_learning_request(
        self, request_id: str, *, user_id: str | None = None
    ) -> LearningRequestRecord:
        row = self._one("learning_requests", request_id)
        if row is None:
            raise not_found("Learning request")
        assert_owner(row["user_id"], user_id)
        return self._request_from_row(row)

    def save_learning_request(self, record: LearningRequestRecord) -> None:
        row = {
            "id": record.id,
            "user_id": record.user_id,
            "state": record.state.value,
            "initial_intent": record.inputs.initial_intent,
            "experience_level": record.inputs.experience_level.value,
            "prior_knowledge": record.inputs.prior_knowledge,
            "expected_outcome": record.inputs.expected_outcome,
            "interpretation": _dump(record.interpretation),
            "compatibility": _dump(record.compatibility),
            "precision": _dump(record.precision),
            "selected_precision": _dump(record.selected_precision),
            "proposal_set": _dump(record.proposal_set),
            "selected_proposal_id": record.selected_proposal_id,
            "blueprint_id": record.blueprint_id,
            "course_id": record.course_id,
            "created_at": record.created_at.isoformat(),
        }
        self._table("learning_requests").upsert(row).execute()
        self._table("objective_versions").delete().eq(
            "learning_request_id", record.id
        ).execute()
        if record.objective_versions:
            self._table("objective_versions").insert(
                [
                    {
                        "user_id": record.user_id,
                        "learning_request_id": record.id,
                        "version": item.version,
                        "statement": item.objective.statement,
                        "observable_capability": item.objective.observable_capability,
                        "learning_object": item.objective.learning_object,
                        "assumed_level_and_knowledge": (
                            item.objective.assumed_level_and_knowledge
                        ),
                        "scope": item.objective.scope,
                        "exclusions": item.objective.exclusions,
                        "achievement_criteria": item.objective.achievement_criteria,
                        "medium_limitations": item.objective.medium_limitations,
                        "confirmed": item.confirmed,
                        "feedback": item.feedback,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in record.objective_versions
                ]
            ).execute()
        for trace in self._trace_buffer.pop(record.id, []):
            self._insert_trace(record.id, record.user_id, trace)

    def get_blueprint(
        self, blueprint_id: str, *, user_id: str | None = None
    ) -> BlueprintRecord:
        row = self._one("blueprints", blueprint_id)
        if row is None:
            raise not_found("Blueprint")
        assert_owner(row["user_id"], user_id)
        versions = (
            self._table("blueprint_versions")
            .select("*")
            .eq("blueprint_id", blueprint_id)
            .order("version")
            .execute()
            .data
            or []
        )
        return BlueprintRecord(
            id=row["id"],
            user_id=row["user_id"],
            request_id=row["request_id"],
            proposal_id=row["proposal_id"],
            objective_version=row["objective_version"],
            state=BlueprintState(row["state"]),
            versions=[
                BlueprintVersion(
                    version=item["version"],
                    visible=BlueprintVisible.model_validate(item["visible"]),
                    internal=BlueprintInternal.model_validate(item["internal"]),
                    feedback=item.get("feedback"),
                    created_at=_dt(item["created_at"]),
                )
                for item in versions
            ],
            pending_feedback=row.get("pending_feedback"),
            approved_version=row.get("approved_version"),
            course_id=row.get("course_id"),
            failure_message=row.get("failure_message"),
            created_at=_dt(row["created_at"]),
        )

    def save_blueprint(self, record: BlueprintRecord) -> None:
        self._table("blueprints").upsert(
            {
                "id": record.id,
                "user_id": record.user_id,
                "request_id": record.request_id,
                "proposal_id": record.proposal_id,
                "objective_version": record.objective_version,
                "state": record.state.value,
                "pending_feedback": record.pending_feedback,
                "approved_version": record.approved_version,
                "course_id": record.course_id,
                "failure_message": record.failure_message,
                "created_at": record.created_at.isoformat(),
            }
        ).execute()
        existing = {
            item["version"]
            for item in (
                self._table("blueprint_versions")
                .select("version")
                .eq("blueprint_id", record.id)
                .execute()
                .data
                or []
            )
        }
        for version in record.versions:
            if version.version in existing:
                continue
            self._table("blueprint_versions").insert(
                {
                    "user_id": record.user_id,
                    "blueprint_id": record.id,
                    "version": version.version,
                    "visible": _dump(version.visible),
                    "internal": _dump(version.internal),
                    "feedback": version.feedback,
                    "created_at": version.created_at.isoformat(),
                }
            ).execute()

    def get_course(
        self, course_id: str, *, user_id: str | None = None
    ) -> CourseRecord:
        row = self._one("courses", course_id)
        if row is None:
            raise not_found("Course")
        assert_owner(row["user_id"], user_id)
        module_rows = (
            self._table("modules")
            .select("*")
            .eq("course_id", course_id)
            .order("index")
            .execute()
            .data
            or []
        )
        lesson_rows = (
            self._table("lessons")
            .select("*")
            .eq("course_id", course_id)
            .order("index")
            .execute()
            .data
            or []
        )
        lessons_by_module: dict[str, list[dict[str, Any]]] = {}
        for lesson in lesson_rows:
            lessons_by_module.setdefault(lesson["module_id"], []).append(lesson)
        modules = [
            ModuleRecord(
                id=module["id"],
                index=module["index"],
                title=module["title"],
                function=module["function"],
                guiding_questions=module.get("guiding_questions") or [],
                outcome=module["outcome"],
                qa_criteria=module.get("qa_criteria") or [],
                state=ModuleState(module["state"]),
                lessons=[
                    self._lesson_from_row(lesson)
                    for lesson in lessons_by_module.get(module["id"], [])
                ],
                synthesis=module.get("synthesis"),
                knowledge_check=(
                    KnowledgeCheckOutput.model_validate(module["knowledge_check"])
                    if module.get("knowledge_check")
                    else None
                ),
                audit=(
                    ModuleAuditOutput.model_validate(module["audit"])
                    if module.get("audit")
                    else None
                ),
                published_at=(
                    _dt(module["published_at"]) if module.get("published_at") else None
                ),
                failure=module.get("failure"),
            )
            for module in module_rows
        ]
        return CourseRecord(
            id=row["id"],
            user_id=row["user_id"],
            request_id=row["request_id"],
            blueprint_id=row["blueprint_id"],
            blueprint_version=row["blueprint_version"],
            title=row["title"],
            subtitle=row["subtitle"],
            objective_statement=row["objective_statement"],
            state=CourseState(row["state"]),
            current_activity=row.get("current_activity"),
            modules=modules,
            final_synthesis=(
                CourseSynthesisOutput.model_validate(row["final_synthesis"])
                if row.get("final_synthesis")
                else None
            ),
            course_audit=(
                CourseAuditOutput.model_validate(row["course_audit"])
                if row.get("course_audit")
                else None
            ),
            failure=row.get("failure"),
            module_limit=row.get("module_limit"),
            started_at=_dt(row["started_at"]) if row.get("started_at") else None,
            created_at=_dt(row["created_at"]),
            completed_at=_dt(row["completed_at"]) if row.get("completed_at") else None,
        )

    def save_course(self, record: CourseRecord) -> None:
        self._table("courses").upsert(
            {
                "id": record.id,
                "user_id": record.user_id,
                "request_id": record.request_id,
                "blueprint_id": record.blueprint_id,
                "blueprint_version": record.blueprint_version,
                "title": record.title,
                "subtitle": record.subtitle,
                "objective_statement": record.objective_statement,
                "state": record.state.value,
                "current_activity": record.current_activity,
                "final_synthesis": _dump(record.final_synthesis),
                "course_audit": _dump(record.course_audit),
                "failure": record.failure,
                "module_limit": record.module_limit,
                "started_at": (
                    record.started_at.isoformat() if record.started_at else None
                ),
                "completed_at": (
                    record.completed_at.isoformat() if record.completed_at else None
                ),
                "created_at": record.created_at.isoformat(),
            }
        ).execute()
        for module in record.modules:
            self._table("modules").upsert(
                {
                    "id": module.id,
                    "user_id": record.user_id,
                    "course_id": record.id,
                    "index": module.index,
                    "title": module.title,
                    "function": module.function,
                    "guiding_questions": module.guiding_questions,
                    "outcome": module.outcome,
                    "qa_criteria": module.qa_criteria,
                    "state": module.state.value,
                    "synthesis": module.synthesis,
                    "knowledge_check": _dump(module.knowledge_check),
                    "audit": _dump(module.audit),
                    "published_at": (
                        module.published_at.isoformat() if module.published_at else None
                    ),
                    "failure": module.failure,
                }
            ).execute()
            for lesson in module.lessons:
                self._table("lessons").upsert(
                    {
                        "id": lesson.id,
                        "user_id": record.user_id,
                        "course_id": record.id,
                        "module_id": module.id,
                        "index": lesson.index,
                        "title": lesson.title,
                        "purpose": lesson.purpose,
                        "state": lesson.state.value,
                        "attempts": lesson.attempts,
                        "research_rounds": lesson.research_rounds,
                        "evidence": [_dump(item) for item in lesson.evidence],
                        "research_questions": lesson.research_questions,
                        "unresolved_claims": lesson.unresolved_claims,
                        "spec": _dump(lesson.spec),
                        "draft": _dump(lesson.draft),
                        "review": _dump(lesson.review),
                        "word_count": lesson.word_count,
                        "failure": lesson.failure,
                    }
                ).execute()

    def list_courses_for_user(self, user_id: str) -> list[CourseListItem]:
        rows = (
            self._table("courses")
            .select(
                "id,title,subtitle,objective_statement,state,updated_at,created_at"
            )
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .execute()
            .data
            or []
        )
        return [
            CourseListItem(
                id=row["id"],
                title=row["title"],
                subtitle=row["subtitle"],
                objective_statement=row["objective_statement"],
                state=CourseState(row["state"]),
                updated_at=_dt(row.get("updated_at") or row["created_at"]),
            )
            for row in rows
        ]

    def add_trace(self, scope_id: str, trace: StageTrace) -> None:
        request = self._one("learning_requests", scope_id)
        if request is None:
            self._trace_buffer.setdefault(scope_id, []).append(trace)
            return
        self._insert_trace(scope_id, request["user_id"], trace)

    def get_traces(self, scope_id: str) -> list[StageTrace]:
        rows = (
            self._table("generation_traces")
            .select("*")
            .eq("learning_request_id", scope_id)
            .order("started_at")
            .execute()
            .data
            or []
        )
        traces = [self._trace_from_row(row) for row in rows]
        traces.extend(self._trace_buffer.get(scope_id, []))
        return traces

    def set_trace_qa_result(
        self,
        scope_id: str,
        *,
        stage: str,
        target: str,
        attempt: int,
        qa_result: str,
    ) -> None:
        for trace in reversed(self._trace_buffer.get(scope_id, [])):
            if (
                trace.stage == stage
                and trace.target == target
                and trace.attempt == attempt
            ):
                trace.qa_result = qa_result
                return
        rows = (
            self._table("generation_traces")
            .select("id")
            .eq("learning_request_id", scope_id)
            .eq("stage", stage)
            .eq("target", target)
            .eq("attempt", attempt)
            .order("started_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return
        self._table("generation_traces").update({"qa_result": qa_result}).eq(
            "id", rows[0]["id"]
        ).execute()

    def list_incomplete_course_ids(self) -> list[str]:
        rows = (
            self._table("courses")
            .select("id")
            .not_.in_("state", ["complete", "failed"])
            .execute()
            .data
            or []
        )
        return [row["id"] for row in rows]

    def _insert_trace(self, scope_id: str, user_id: str, trace: StageTrace) -> None:
        self._table("generation_traces").insert(
            {
                "user_id": user_id,
                "learning_request_id": scope_id,
                "stage": trace.stage,
                "target": trace.target,
                "prompt_version": trace.prompt_version,
                "schema_version": trace.schema_version,
                "model": trace.model,
                "attempt": trace.attempt,
                "started_at": trace.started_at.isoformat(),
                "duration_ms": trace.duration_ms,
                "input_tokens": trace.usage.input_tokens,
                "output_tokens": trace.usage.output_tokens,
                "reasoning_tokens": trace.usage.reasoning_tokens,
                "total_tokens": trace.usage.total_tokens,
                "status": trace.status,
                "validation_codes": trace.validation_codes,
                "qa_result": trace.qa_result,
                "web_search": trace.web_search,
            }
        ).execute()

    def _request_from_row(self, row: dict[str, Any]) -> LearningRequestRecord:
        versions = (
            self._table("objective_versions")
            .select("*")
            .eq("learning_request_id", row["id"])
            .order("version")
            .execute()
            .data
            or []
        )
        proposal_set = None
        if row.get("proposal_set"):
            proposal_set = ProposalSetRecord.model_validate(row["proposal_set"])
        selected_precision = None
        if row.get("selected_precision"):
            selected_precision = SelectedPrecision.model_validate(
                row["selected_precision"]
            )
        return LearningRequestRecord(
            id=row["id"],
            user_id=row["user_id"],
            created_at=_dt(row["created_at"]),
            state=RequestState(row["state"]),
            inputs=LearningRequestInputs(
                initial_intent=row["initial_intent"],
                experience_level=row["experience_level"],
                prior_knowledge=row.get("prior_knowledge"),
                expected_outcome=row["expected_outcome"],
            ),
            interpretation=Interpretation.model_validate(row["interpretation"]),
            compatibility=CompatibilityAssessment.model_validate(row["compatibility"]),
            precision=PrecisionResult.model_validate(row["precision"]),
            selected_precision=selected_precision,
            objective_versions=[
                ObjectiveVersion(
                    version=item["version"],
                    objective=LearningObjectiveOutput(
                        statement=item["statement"],
                        observable_capability=item["observable_capability"],
                        learning_object=item["learning_object"],
                        assumed_level_and_knowledge=item[
                            "assumed_level_and_knowledge"
                        ],
                        scope=item.get("scope") or [],
                        exclusions=item.get("exclusions") or [],
                        achievement_criteria=item.get("achievement_criteria") or [],
                        medium_limitations=item.get("medium_limitations") or [],
                    ),
                    confirmed=item["confirmed"],
                    feedback=item.get("feedback"),
                    created_at=_dt(item["created_at"]),
                )
                for item in versions
            ],
            proposal_set=proposal_set,
            selected_proposal_id=row.get("selected_proposal_id"),
            blueprint_id=row.get("blueprint_id"),
            course_id=row.get("course_id"),
        )

    def _lesson_from_row(self, row: dict[str, Any]) -> LessonRecord:
        evidence = [
            EvidenceItem.model_validate(item) for item in (row.get("evidence") or [])
        ]
        return LessonRecord(
            id=row["id"],
            index=row["index"],
            title=row["title"],
            purpose=row["purpose"],
            state=LessonState(row["state"]),
            attempts=row.get("attempts") or 0,
            research_rounds=row.get("research_rounds") or 0,
            evidence=evidence,
            research_questions=row.get("research_questions") or [],
            unresolved_claims=row.get("unresolved_claims") or [],
            spec=(
                LessonSpecOutput.model_validate(row["spec"])
                if row.get("spec")
                else None
            ),
            draft=(
                LessonDraftOutput.model_validate(row["draft"])
                if row.get("draft")
                else None
            ),
            word_count=row.get("word_count") or 0,
            review=(
                LessonReviewOutput.model_validate(row["review"])
                if row.get("review")
                else None
            ),
            failure=row.get("failure"),
        )

    @staticmethod
    def _trace_from_row(row: dict[str, Any]) -> StageTrace:
        return StageTrace(
            stage=row["stage"],
            target=row["target"],
            prompt_version=row["prompt_version"],
            schema_version=row["schema_version"],
            model=row["model"],
            attempt=row["attempt"],
            started_at=_dt(row["started_at"]),
            duration_ms=row["duration_ms"],
            usage=TokenUsage(
                input_tokens=row.get("input_tokens") or 0,
                output_tokens=row.get("output_tokens") or 0,
                reasoning_tokens=row.get("reasoning_tokens") or 0,
                total_tokens=row.get("total_tokens") or 0,
            ),
            status=row["status"],
            validation_codes=row.get("validation_codes") or [],
            qa_result=row.get("qa_result"),
            web_search=bool(row.get("web_search")),
        )


@lru_cache(maxsize=1)
def get_postgres_store() -> PostgresStore:
    client = create_supabase_client(settings)
    return PostgresStore(client)


def create_supabase_client(config: Settings) -> Client:
    assert config.supabase_url is not None
    assert config.supabase_service_role_key is not None
    return create_client(
        config.supabase_url,
        config.supabase_service_role_key.get_secret_value(),
    )
