"""Supabase/Postgres-backed store. Uses the service role (server-side only)."""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from datetime import date, datetime
from functools import lru_cache
from typing import Any

import httpx
from supabase import Client, create_client

from auteur_api.ai.tracing import StageTrace, TokenUsage
from auteur_api.core.config import Settings, settings
from auteur_api.core.errors import ApiError, invalid_state, not_found
from auteur_api.core.store import (
    CourseBuildSnapshot,
    ProfileRecord,
    assert_owner,
    course_structure_counts,
    normalize_text_size,
)
from auteur_api.modules.auth.profile_photo import BUCKET, profile_photo_object_path
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
from auteur_api.modules.learning_progress.logic import (
    CourseLearningProgress,
    LessonRead,
    ProgressWrite,
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

logger = logging.getLogger("auteur_api.profile_photo")


def _dt(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value).replace("Z", "+00:00")
    return datetime.fromisoformat(text)


def _https_avatar(value: object) -> str | None:
    if (
        not isinstance(value, str)
        or not value.startswith("https://")
        or len(value) > 500
    ):
        return None
    return value


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

    def _read(self, build: Callable[[], Any]) -> Any:
        """Retry a read when the HTTP connection drops before a response."""
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                return build().execute()
            except httpx.TransportError as exc:
                last_error = exc
                if attempt == 2:
                    raise
        raise last_error  # pragma: no cover

    def _one(self, table: str, id_: str) -> dict[str, Any] | None:
        response = self._read(
            lambda: self._table(table).select("*").eq("id", id_).limit(1)
        )
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
            self._read(
                lambda: self._table("modules")
                .select("*")
                .eq("course_id", course_id)
                .order("index")
            ).data
            or []
        )
        lesson_rows = (
            self._read(
                lambda: self._table("lessons")
                .select("*")
                .eq("course_id", course_id)
                .order("index")
            ).data
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
        module_count, lesson_count = course_structure_counts(record)
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
                "module_count": module_count,
                "lesson_count": lesson_count,
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
                "id,title,subtitle,objective_statement,state,updated_at,created_at,module_count,lesson_count"
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
                created_at=_dt(row["created_at"]),
                module_count=row.get("module_count") or 0,
                lesson_count=row.get("lesson_count") or 0,
            )
            for row in rows
        ]

    def list_course_build_snapshots(self, user_id: str) -> list[CourseBuildSnapshot]:
        """BR-GEN-002: one read of course and module states. Lessons stay unread."""
        response = self._read(
            lambda: self._table("courses")
            .select("id,state,module_limit,final_synthesis,modules(state)")
            .eq("user_id", user_id)
            .not_.in_("state", ["complete", "failed"])
            .order("updated_at", desc=True)
        )
        rows = response.data or []
        return [
            CourseBuildSnapshot(
                id=row["id"],
                state=CourseState(row["state"]),
                module_limit=row["module_limit"],
                has_final_synthesis=row.get("final_synthesis") is not None,
                module_states=tuple(
                    ModuleState(module["state"])
                    for module in (row.get("modules") or [])
                ),
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

    def get_profile(self, user_id: str) -> ProfileRecord:
        rows = (
            self._table("profiles")
            .select(
                "first_name,last_name,birth_date,gender,avatar_url,image_url,"
                "text_size,generated_course_count"
            )
            .eq("id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return ProfileRecord()
        row = rows[0]
        raw_birth = row.get("birth_date")
        birth_date = None
        if raw_birth:
            try:
                birth_date = date.fromisoformat(str(raw_birth)[:10])
            except ValueError:
                birth_date = None
        return ProfileRecord(
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
            birth_date=birth_date,
            gender=row.get("gender"),
            avatar_url=_https_avatar(row.get("avatar_url")),
            image_url=_https_avatar(row.get("image_url")),
            text_size=normalize_text_size(row.get("text_size")),
            generated_course_count=int(row.get("generated_course_count") or 0),
        )

    def update_profile(self, user_id: str, profile: ProfileRecord) -> ProfileRecord:
        """Replace the signed-in member's editable profile fields."""
        current = self.get_profile(user_id)
        birth_date = (
            profile.birth_date.isoformat() if profile.birth_date else None
        )
        payload = {
            "first_name": profile.first_name,
            "last_name": profile.last_name,
            "birth_date": birth_date,
            "gender": profile.gender,
        }
        existing = (
            self._table("profiles")
            .select("id")
            .eq("id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            self._table("profiles").update(payload).eq("id", user_id).execute()
        else:
            self._table("profiles").insert({"id": user_id, **payload}).execute()
        return ProfileRecord(
            first_name=profile.first_name,
            last_name=profile.last_name,
            birth_date=profile.birth_date,
            gender=profile.gender,
            avatar_url=current.avatar_url,
            image_url=current.image_url,
            text_size=current.text_size,
            generated_course_count=current.generated_course_count,
        )

    def update_text_size(self, user_id: str, text_size: str) -> ProfileRecord:
        """Store the signed-in member's reading text size."""
        self._ensure_profile(user_id)
        self._table("profiles").update(
            {"text_size": normalize_text_size(text_size)}
        ).eq("id", user_id).execute()
        return self.get_profile(user_id)

    def create_profile_photo(
        self, user_id: str, content: bytes, content_type: str
    ) -> ProfileRecord:
        current = self.get_profile(user_id)
        if current.image_url:
            raise invalid_state("A profile photo already exists. Update it instead.")
        self._ensure_profile(user_id)
        url = self._store_profile_photo(user_id, content, content_type)
        try:
            self._write_image_url(user_id, url)
        except Exception:
            self._remove_profile_photo(user_id)
            logger.warning("profile_photo_url_save_failed")
            raise ApiError(
                "provider_unavailable",
                "Could not save your photo. Try again.",
            ) from None
        return self.get_profile(user_id)

    def replace_profile_photo(
        self, user_id: str, content: bytes, content_type: str
    ) -> ProfileRecord:
        current = self.get_profile(user_id)
        if not current.image_url:
            raise not_found("Profile photo")
        url = self._store_profile_photo(user_id, content, content_type)
        self._write_image_url(user_id, url)
        return self.get_profile(user_id)

    def delete_profile_photo(self, user_id: str) -> ProfileRecord:
        current = self.get_profile(user_id)
        if not current.image_url:
            raise not_found("Profile photo")
        self._remove_profile_photo(user_id)
        self._write_image_url(user_id, None)
        return self.get_profile(user_id)

    def _ensure_profile(self, user_id: str) -> None:
        existing = (
            self._table("profiles")
            .select("id")
            .eq("id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not existing:
            self._table("profiles").insert({"id": user_id}).execute()

    def _write_image_url(self, user_id: str, image_url: str | None) -> None:
        self._table("profiles").update({"image_url": image_url}).eq(
            "id", user_id
        ).execute()

    def _store_profile_photo(
        self, user_id: str, content: bytes, content_type: str
    ) -> str:
        path = profile_photo_object_path(user_id)
        try:
            self._client.storage.from_(BUCKET).upload(
                path,
                content,
                file_options={
                    "content-type": content_type,
                    "upsert": "true",
                    "cache-control": "3600",
                },
            )
        except Exception:
            logger.warning("profile_photo_upload_failed")
            raise ApiError(
                "provider_unavailable",
                "Could not save your photo. Try again.",
            ) from None
        base = self._client.storage.from_(BUCKET).get_public_url(path)
        url = f"{base}{'&' if '?' in base else '?'}v={time.time_ns()}"
        if not url.startswith("https://") or len(url) > 500:
            self._remove_profile_photo(user_id)
            raise ApiError("internal_error", "Could not save your photo. Try again.")
        return url

    def _remove_profile_photo(self, user_id: str) -> None:
        try:
            self._client.storage.from_(BUCKET).remove(
                [profile_photo_object_path(user_id)]
            )
        except Exception:
            logger.warning("profile_photo_delete_failed")
            raise ApiError(
                "provider_unavailable",
                "Could not remove your photo. Try again.",
            ) from None

    def reassign_owner(self, from_user_id: str, to_user_id: str) -> None:
        """Move one visitor's rows onto a permanent account (BR-AUT-005)."""
        if from_user_id == to_user_id:
            return
        self._table("profiles").upsert({"id": to_user_id}, on_conflict="id").execute()
        for table in (
            "learning_requests",
            "objective_versions",
            "blueprints",
            "blueprint_versions",
            "courses",
            "modules",
            "lessons",
            "lesson_reads",
            "course_learning_progress",
            "generation_traces",
        ):
            self._table(table).update({"user_id": to_user_id}).eq(
                "user_id", from_user_id
            ).execute()

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

    def list_lesson_reads(self, user_id: str, course_id: str) -> list[LessonRead]:
        rows = (
            self._table("lesson_reads")
            .select("user_id,lesson_id,course_id,read,marked_at,updated_at")
            .eq("user_id", user_id)
            .eq("course_id", course_id)
            .execute()
            .data
            or []
        )
        return [
            LessonRead(
                user_id=row["user_id"],
                lesson_id=row["lesson_id"],
                course_id=row["course_id"],
                read=bool(row["read"]),
                marked_at=_dt(row["marked_at"]) if row.get("marked_at") else None,
                updated_at=_dt(row["updated_at"]),
            )
            for row in rows
        ]

    def get_course_learning_progress(
        self, user_id: str, course_id: str
    ) -> CourseLearningProgress | None:
        rows = (
            self._table("course_learning_progress")
            .select(
                "user_id,course_id,last_lesson_id,last_activity_at,position_revision,"
                "first_completed_at,current_completed_at,synthesis_auto_presented_at"
            )
            .eq("user_id", user_id)
            .eq("course_id", course_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return None
        row = rows[0]
        return CourseLearningProgress(
            user_id=row["user_id"],
            course_id=row["course_id"],
            last_lesson_id=row.get("last_lesson_id"),
            last_activity_at=(
                _dt(row["last_activity_at"]) if row.get("last_activity_at") else None
            ),
            position_revision=int(row.get("position_revision") or 0),
            first_completed_at=(
                _dt(row["first_completed_at"])
                if row.get("first_completed_at")
                else None
            ),
            current_completed_at=(
                _dt(row["current_completed_at"])
                if row.get("current_completed_at")
                else None
            ),
            synthesis_auto_presented_at=(
                _dt(row["synthesis_auto_presented_at"])
                if row.get("synthesis_auto_presented_at")
                else None
            ),
        )

    def apply_lesson_read(
        self,
        user_id: str,
        course_id: str,
        lesson_id: str,
        *,
        read: bool,
        expected_updated_at: datetime | None,
    ) -> ProgressWrite:
        self.get_course(course_id, user_id=user_id)
        return self._progress_outcome(
            "apply_lesson_read",
            {
                "p_user_id": user_id,
                "p_course_id": course_id,
                "p_lesson_id": lesson_id,
                "p_read": read,
                "p_expected_updated_at": (
                    expected_updated_at.isoformat() if expected_updated_at else None
                ),
            },
        )

    def record_lesson_visit(
        self,
        user_id: str,
        course_id: str,
        lesson_id: str,
        *,
        position_revision: int,
    ) -> ProgressWrite:
        self.get_course(course_id, user_id=user_id)
        return self._progress_outcome(
            "record_lesson_visit",
            {
                "p_user_id": user_id,
                "p_course_id": course_id,
                "p_lesson_id": lesson_id,
                "p_position_revision": position_revision,
            },
        )

    def record_synthesis_presentation(
        self, user_id: str, course_id: str
    ) -> ProgressWrite:
        self.get_course(course_id, user_id=user_id)
        return self._progress_outcome(
            "record_synthesis_presentation",
            {"p_user_id": user_id, "p_course_id": course_id},
        )

    def reconcile_learning_progress(self, user_id: str, course_id: str) -> None:
        outcome = self._rpc_payload(
            "reconcile_course_learning",
            {"p_user_id": user_id, "p_course_id": course_id},
        )
        if outcome == "not_found":
            raise not_found("Course")

    def _progress_outcome(self, name: str, params: dict[str, Any]) -> ProgressWrite:
        outcome = self._rpc_payload(name, params)
        try:
            return ProgressWrite(outcome)
        except ValueError:
            raise ApiError(
                "internal_error",
                "Progress could not be saved. Try again.",
            ) from None

    def _rpc_payload(self, name: str, params: dict[str, Any]) -> str:
        response = self._client.rpc(name, params).execute()
        data = response.data
        if isinstance(data, str):
            data = json.loads(data)
        if isinstance(data, list):
            data = data[0] if data else None
        if not isinstance(data, dict) or "outcome" not in data:
            raise ApiError(
                "internal_error",
                "Progress could not be saved. Try again.",
            )
        return str(data["outcome"])


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
