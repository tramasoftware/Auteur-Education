"""In-memory audio store for tests. Production uses Postgres and Storage."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from threading import Lock
from uuid import uuid4

from auteur_api.core.errors import ApiError
from auteur_api.modules.audio.models import (
    AUDIO_BUCKET,
    AudioProgress,
    ChunkRecord,
    NarrationRecord,
    StoredObject,
)

_SIGNED = "https://audio.test"


class MemoryAudioStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.narrations: dict[str, NarrationRecord] = {}
        self.chunks: dict[str, list[ChunkRecord]] = {}
        self.objects: dict[str, StoredObject] = {}
        self.progress: dict[tuple[str, str], AudioProgress] = {}
        self.prices: dict[tuple[str, str], int] = {}
        self.put_failures = 0
        self.signed_failures = 0

    def get_by_hashes(
        self, lesson_id: str, content_sha256: str, config_sha256: str
    ) -> NarrationRecord | None:
        with self._lock:
            for row in self.narrations.values():
                if (
                    row.lesson_id == lesson_id
                    and row.content_sha256 == content_sha256
                    and row.config_sha256 == config_sha256
                ):
                    return row
        return None

    def get_narration(self, narration_id: str) -> NarrationRecord | None:
        return self.narrations.get(narration_id)

    def latest_for_lesson(
        self, lesson_id: str, user_id: str
    ) -> NarrationRecord | None:
        matches = [
            row
            for row in self.narrations.values()
            if row.lesson_id == lesson_id and row.user_id == user_id
        ]
        if not matches:
            return None
        return matches[-1]

    def insert_narration(self, record: NarrationRecord) -> NarrationRecord:
        with self._lock:
            for row in self.narrations.values():
                if (
                    row.lesson_id == record.lesson_id
                    and row.content_sha256 == record.content_sha256
                    and row.config_sha256 == record.config_sha256
                ):
                    return row
            self.narrations[record.id] = record
            self.chunks.setdefault(record.id, [])
            return record

    def replace_chunks(self, narration_id: str, chunks: list[ChunkRecord]) -> None:
        with self._lock:
            self.chunks[narration_id] = list(chunks)

    def list_chunks(self, narration_id: str) -> list[ChunkRecord]:
        return list(self.chunks.get(narration_id, []))

    def set_narration_status(
        self,
        narration_id: str,
        status: str,
        *,
        error: str | None = None,
        estimated_cost_cents: int | None = None,
    ) -> None:
        row = self.narrations[narration_id]
        row.status = status
        row.error = error
        if estimated_cost_cents is not None:
            row.estimated_cost_cents = estimated_cost_cents

    def claim_chunk(
        self, narration_id: str, lease_seconds: int
    ) -> ChunkRecord | None:
        now = datetime.now(UTC)
        with self._lock:
            for chunk in self.chunks.get(narration_id, []):
                expired = chunk.status == "leased" and _expired(chunk, now)
                if chunk.status == "queued" or expired:
                    chunk.status = "leased"
                    chunk.lease_token = str(uuid4())
                    chunk.attempts += 1
                    chunk.error = None
                    chunk.lease_expires_at = (
                        now + timedelta(seconds=lease_seconds)
                    ).isoformat()
                    return chunk
        return None

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
        with self._lock:
            chunk = self._chunk(chunk_id)
            if chunk is None or chunk.lease_token != lease_token:
                return False
            if chunk.status != "leased":
                return False
            chunk.status = "ready"
            chunk.object_path = object_path
            chunk.duration_ms = duration_ms
            chunk.billed_units = billed_units
            chunk.media_type = media_type
            chunk.provider_job_id = provider_job_id
            chunk.error = None
            self._refresh_totals(chunk.narration_id)
            return True

    def fail_chunk(
        self, chunk_id: str, lease_token: str, *, error: str, retry: bool
    ) -> bool:
        with self._lock:
            chunk = self._chunk(chunk_id)
            if chunk is None or chunk.lease_token != lease_token:
                return False
            if chunk.status != "leased":
                return False
            chunk.error = error
            if retry:
                chunk.status = "queued"
                chunk.lease_token = None
                chunk.lease_expires_at = None
            else:
                chunk.status = "failed"
            return True

    def requeue_failed(self, narration_id: str) -> int:
        count = 0
        with self._lock:
            for chunk in self.chunks.get(narration_id, []):
                if chunk.status == "failed":
                    chunk.status = "queued"
                    chunk.lease_token = None
                    chunk.lease_expires_at = None
                    chunk.error = None
                    count += 1
        return count

    def active_job_count(
        self, user_id: str, *, exclude_id: str | None = None
    ) -> int:
        return sum(
            1
            for row in self.narrations.values()
            if row.user_id == user_id
            and row.status in {"queued", "generating"}
            and row.id != exclude_id
        )

    def billed_units_this_month(self, user_id: str) -> int:
        return sum(
            row.billed_units
            for row in self.narrations.values()
            if row.user_id == user_id
        )

    def cents_per_thousand(self, provider: str, model: str) -> int | None:
        return self.prices.get((provider, model))

    def put_audio(self, path: str, content: bytes, media_type: str) -> None:
        if self.put_failures > 0:
            self.put_failures -= 1
            raise ApiError("audio_unavailable", "Could not store lesson audio.")
        self.objects[path] = StoredObject(content=content, media_type=media_type)

    def signed_url(self, path: str, expires_seconds: int) -> str:
        del expires_seconds
        if self.signed_failures > 0:
            self.signed_failures -= 1
            raise ApiError("audio_unavailable", "Could not prepare playback.")
        if path not in self.objects:
            raise ApiError("audio_unavailable", "Could not prepare playback.")
        self.objects[path].urls += 1
        return f"{_SIGNED}/{AUDIO_BUCKET}/{path}?token=signed"

    def get_progress(self, user_id: str, lesson_id: str) -> AudioProgress:
        return self.progress.get((user_id, lesson_id), AudioProgress())

    def save_progress(
        self,
        user_id: str,
        lesson_id: str,
        course_id: str,
        *,
        position_ms: int,
        playback_rate: float,
    ) -> AudioProgress:
        del course_id
        row = AudioProgress(position_ms=position_ms, playback_rate=playback_rate)
        self.progress[(user_id, lesson_id)] = row
        return row

    def recoverable_narration_ids(self) -> list[str]:
        now = datetime.now(UTC)
        ids: list[str] = []
        for narration_id, chunks in self.chunks.items():
            row = self.narrations.get(narration_id)
            if row is None or row.status not in {"queued", "generating"}:
                continue
            if any(
                chunk.status == "queued" or _expired(chunk, now) for chunk in chunks
            ):
                ids.append(narration_id)
        return ids

    def _chunk(self, chunk_id: str) -> ChunkRecord | None:
        for group in self.chunks.values():
            for chunk in group:
                if chunk.id == chunk_id:
                    return chunk
        return None

    def _refresh_totals(self, narration_id: str) -> None:
        chunks = self.chunks.get(narration_id, [])
        row = self.narrations[narration_id]
        row.billed_units = sum(chunk.billed_units for chunk in chunks)
        row.duration_ms = sum(chunk.duration_ms for chunk in chunks)


def _expired(chunk: ChunkRecord, now: datetime) -> bool:
    if not chunk.lease_expires_at:
        return False
    expires = datetime.fromisoformat(chunk.lease_expires_at)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return expires <= now
