"""Postgres + Storage persistence for lesson narration."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from supabase import Client

from auteur_api.core.errors import ApiError
from auteur_api.modules.audio.models import (
    AUDIO_BUCKET,
    AudioProgress,
    ChunkRecord,
    NarrationRecord,
)

logger = logging.getLogger("auteur_api.audio")


class PostgresAudioStore:
    def __init__(self, client: Client) -> None:
        self._client = client

    def get_by_hashes(
        self, lesson_id: str, content_sha256: str, config_sha256: str
    ) -> NarrationRecord | None:
        rows = self._rows(
            self._client.table("lesson_narrations")
            .select(_NARRATION)
            .eq("lesson_id", lesson_id)
            .eq("content_sha256", content_sha256)
            .eq("config_sha256", config_sha256)
            .limit(1)
            .execute()
            .data
        )
        return _narration(rows[0]) if rows else None

    def get_narration(self, narration_id: str) -> NarrationRecord | None:
        rows = self._rows(
            self._client.table("lesson_narrations")
            .select(_NARRATION)
            .eq("id", narration_id)
            .limit(1)
            .execute()
            .data
        )
        return _narration(rows[0]) if rows else None

    def latest_for_lesson(
        self, lesson_id: str, user_id: str
    ) -> NarrationRecord | None:
        rows = self._rows(
            self._client.table("lesson_narrations")
            .select(_NARRATION)
            .eq("lesson_id", lesson_id)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        return _narration(rows[0]) if rows else None

    def insert_narration(self, record: NarrationRecord) -> NarrationRecord:
        existing = self.get_by_hashes(
            record.lesson_id, record.content_sha256, record.config_sha256
        )
        if existing is not None:
            return existing
        payload = {
            "id": record.id,
            "user_id": record.user_id,
            "course_id": record.course_id,
            "module_id": record.module_id,
            "lesson_id": record.lesson_id,
            "content_sha256": record.content_sha256,
            "config_sha256": record.config_sha256,
            "provider": record.provider,
            "model": record.model,
            "voice_id": record.voice_id,
            "output_format": record.output_format,
            "status": record.status,
            "error": record.error,
            "billed_units": record.billed_units,
            "estimated_cost_cents": record.estimated_cost_cents,
            "duration_ms": record.duration_ms,
        }
        try:
            self._client.table("lesson_narrations").insert(payload).execute()
        except Exception:
            raced = self.get_by_hashes(
                record.lesson_id, record.content_sha256, record.config_sha256
            )
            if raced is not None:
                return raced
            logger.warning("lesson_narration_insert_failed")
            raise ApiError(
                "audio_unavailable", "Could not start lesson audio."
            ) from None
        return record

    def replace_chunks(self, narration_id: str, chunks: list[ChunkRecord]) -> None:
        self._client.table("lesson_narration_chunks").delete().eq(
            "narration_id", narration_id
        ).execute()
        if not chunks:
            return
        self._client.table("lesson_narration_chunks").insert(
            [
                {
                    "id": chunk.id,
                    "narration_id": chunk.narration_id,
                    "index": chunk.index,
                    "text": chunk.text,
                    "status": chunk.status,
                    "attempts": chunk.attempts,
                    "lease_token": chunk.lease_token,
                    "lease_expires_at": chunk.lease_expires_at,
                    "provider_job_id": chunk.provider_job_id,
                    "object_path": chunk.object_path,
                    "duration_ms": chunk.duration_ms,
                    "billed_units": chunk.billed_units,
                    "media_type": chunk.media_type,
                    "error": chunk.error,
                }
                for chunk in chunks
            ]
        ).execute()

    def list_chunks(self, narration_id: str) -> list[ChunkRecord]:
        rows = self._rows(
            self._client.table("lesson_narration_chunks")
            .select(_CHUNK)
            .eq("narration_id", narration_id)
            .order("index")
            .execute()
            .data
        )
        return [_chunk(row) for row in rows]

    def set_narration_status(
        self,
        narration_id: str,
        status: str,
        *,
        error: str | None = None,
        estimated_cost_cents: int | None = None,
    ) -> None:
        payload: dict[str, Any] = {"status": status, "error": error}
        if estimated_cost_cents is not None:
            payload["estimated_cost_cents"] = estimated_cost_cents
        self._client.table("lesson_narrations").update(payload).eq(
            "id", narration_id
        ).execute()

    def claim_chunk(
        self, narration_id: str, lease_seconds: int
    ) -> ChunkRecord | None:
        response = self._client.rpc(
            "claim_lesson_audio_chunk",
            {
                "p_narration_id": narration_id,
                "p_lease_seconds": lease_seconds,
            },
        ).execute()
        data = response.data
        if not data:
            return None
        if isinstance(data, list):
            data = data[0] if data else None
        if not data:
            return None
        return _chunk(data)

    def complete_chunk(
        self,
        chunk_id: str,
        lease_token: str,
        *,
        object_path: str,
        duration_ms: int,
        billed_units: int,
        media_type: str,
        provider_job_id: str | None = None,
    ) -> bool:
        if provider_job_id:
            self._client.table("lesson_narration_chunks").update(
                {"provider_job_id": provider_job_id}
            ).eq("id", chunk_id).eq("lease_token", lease_token).execute()
        response = self._client.rpc(
            "complete_lesson_audio_chunk",
            {
                "p_chunk_id": chunk_id,
                "p_lease_token": lease_token,
                "p_object_path": object_path,
                "p_duration_ms": duration_ms,
                "p_billed_units": billed_units,
                "p_media_type": media_type,
            },
        ).execute()
        return bool(response.data)

    def fail_chunk(
        self, chunk_id: str, lease_token: str, *, error: str, retry: bool
    ) -> bool:
        response = self._client.rpc(
            "fail_lesson_audio_chunk",
            {
                "p_chunk_id": chunk_id,
                "p_lease_token": lease_token,
                "p_error": error,
                "p_retry": retry,
            },
        ).execute()
        return bool(response.data)

    def requeue_failed(self, narration_id: str) -> int:
        rows = self._rows(
            self._client.table("lesson_narration_chunks")
            .select("id")
            .eq("narration_id", narration_id)
            .eq("status", "failed")
            .execute()
            .data
        )
        if not rows:
            return 0
        self._client.table("lesson_narration_chunks").update(
            {
                "status": "queued",
                "lease_token": None,
                "lease_expires_at": None,
                "error": None,
            }
        ).eq("narration_id", narration_id).eq("status", "failed").execute()
        return len(rows)

    def active_job_count(
        self, user_id: str, *, exclude_id: str | None = None
    ) -> int:
        query = (
            self._client.table("lesson_narrations")
            .select("id")
            .eq("user_id", user_id)
            .in_("status", ["queued", "generating"])
        )
        rows = self._rows(query.execute().data)
        return sum(1 for row in rows if row.get("id") != exclude_id)

    def billed_units_this_month(self, user_id: str) -> int:
        start = datetime.now(UTC).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        rows = self._rows(
            self._client.table("lesson_narrations")
            .select("billed_units")
            .eq("user_id", user_id)
            .gte("created_at", start.isoformat())
            .execute()
            .data
        )
        return sum(int(row.get("billed_units") or 0) for row in rows)

    def cents_per_thousand(self, provider: str, model: str) -> int | None:
        rows = self._rows(
            self._client.table("tts_price_versions")
            .select("cents_per_thousand")
            .eq("provider", provider)
            .eq("model", model)
            .eq("active", True)
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            return None
        value = rows[0].get("cents_per_thousand")
        return int(value) if value is not None else None

    def put_audio(self, path: str, content: bytes, media_type: str) -> None:
        try:
            self._client.storage.from_(AUDIO_BUCKET).upload(
                path,
                content,
                file_options={
                    "content-type": media_type,
                    "upsert": "true",
                    "cache-control": "private, max-age=3600",
                },
            )
        except Exception:
            logger.warning("lesson_audio_upload_failed")
            raise ApiError(
                "audio_unavailable", "Could not store lesson audio."
            ) from None

    def signed_url(self, path: str, expires_seconds: int) -> str:
        try:
            response = self._client.storage.from_(AUDIO_BUCKET).create_signed_url(
                path, expires_seconds
            )
        except Exception:
            logger.warning("lesson_audio_sign_failed")
            raise ApiError("audio_unavailable", "Could not prepare playback.") from None
        url = ""
        if isinstance(response, dict):
            url = str(
                response.get("signedURL")
                or response.get("signedUrl")
                or response.get("signed_url")
                or ""
            )
        if not url.startswith("https://"):
            raise ApiError("audio_unavailable", "Could not prepare playback.")
        return url

    def get_progress(self, user_id: str, lesson_id: str) -> AudioProgress:
        rows = self._rows(
            self._client.table("lesson_audio_progress")
            .select("position_ms, playback_rate")
            .eq("user_id", user_id)
            .eq("lesson_id", lesson_id)
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            return AudioProgress()
        return AudioProgress(
            position_ms=int(rows[0].get("position_ms") or 0),
            playback_rate=float(rows[0].get("playback_rate") or 1),
        )

    def save_progress(
        self,
        user_id: str,
        lesson_id: str,
        course_id: str,
        *,
        position_ms: int,
        playback_rate: float,
    ) -> AudioProgress:
        self._client.table("lesson_audio_progress").upsert(
            {
                "user_id": user_id,
                "lesson_id": lesson_id,
                "course_id": course_id,
                "position_ms": position_ms,
                "playback_rate": playback_rate,
            },
            on_conflict="user_id,lesson_id",
        ).execute()
        return AudioProgress(position_ms=position_ms, playback_rate=playback_rate)

    def recoverable_narration_ids(self) -> list[str]:
        generating = self._rows(
            self._client.table("lesson_narrations")
            .select("id")
            .in_("status", ["queued", "generating"])
            .execute()
            .data
        )
        ids = [str(row["id"]) for row in generating if row.get("id")]
        if not ids:
            return []
        pending: list[str] = []
        now = datetime.now(UTC).isoformat()
        for narration_id in ids:
            chunks = self.list_chunks(narration_id)
            if any(
                chunk.status == "queued"
                or (
                    chunk.status == "leased"
                    and chunk.lease_expires_at is not None
                    and chunk.lease_expires_at <= now
                )
                for chunk in chunks
            ):
                pending.append(narration_id)
        return pending

    @staticmethod
    def _rows(data: Any) -> list[dict[str, Any]]:
        if not data:
            return []
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        if isinstance(data, dict):
            return [data]
        return []


_NARRATION = (
    "id, user_id, course_id, module_id, lesson_id, content_sha256, "
    "config_sha256, provider, model, voice_id, output_format, status, error, "
    "billed_units, estimated_cost_cents, duration_ms"
)
_CHUNK = (
    "id, narration_id, index, text, status, attempts, lease_token, "
    "lease_expires_at, provider_job_id, object_path, duration_ms, billed_units, "
    "media_type, error"
)


def _narration(row: dict[str, Any]) -> NarrationRecord:
    return NarrationRecord(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        course_id=str(row["course_id"]),
        module_id=str(row["module_id"]),
        lesson_id=str(row["lesson_id"]),
        content_sha256=str(row["content_sha256"]),
        config_sha256=str(row["config_sha256"]),
        provider=str(row["provider"]),
        model=str(row["model"]),
        voice_id=str(row.get("voice_id") or ""),
        output_format=str(row["output_format"]),
        status=row["status"],
        error=row.get("error"),
        billed_units=int(row.get("billed_units") or 0),
        estimated_cost_cents=(
            int(row["estimated_cost_cents"])
            if row.get("estimated_cost_cents") is not None
            else None
        ),
        duration_ms=int(row.get("duration_ms") or 0),
    )


def _chunk(row: dict[str, Any]) -> ChunkRecord:
    expires = row.get("lease_expires_at")
    return ChunkRecord(
        id=str(row["id"]),
        narration_id=str(row["narration_id"]),
        index=int(row["index"]),
        text=str(row["text"]),
        status=row["status"],
        attempts=int(row.get("attempts") or 0),
        lease_token=str(row["lease_token"]) if row.get("lease_token") else None,
        lease_expires_at=str(expires) if expires else None,
        object_path=row.get("object_path"),
        duration_ms=int(row.get("duration_ms") or 0),
        billed_units=int(row.get("billed_units") or 0),
        media_type=row.get("media_type"),
        error=row.get("error"),
        provider_job_id=row.get("provider_job_id"),
    )
