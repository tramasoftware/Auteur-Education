"""Records shared by the memory store and Postgres."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

NarrationStatus = Literal["queued", "generating", "ready", "failed"]
ChunkStatus = Literal["queued", "leased", "ready", "failed"]

AUDIO_BUCKET = "lesson-audio"


@dataclass
class NarrationRecord:
    id: str
    user_id: str
    course_id: str
    module_id: str
    lesson_id: str
    content_sha256: str
    config_sha256: str
    provider: str
    model: str
    voice_id: str
    output_format: str
    status: NarrationStatus
    error: str | None = None
    billed_units: int = 0
    estimated_cost_cents: int | None = None
    duration_ms: int = 0


@dataclass
class ChunkRecord:
    id: str
    narration_id: str
    index: int
    text: str
    status: ChunkStatus
    attempts: int = 0
    lease_token: str | None = None
    lease_expires_at: str | None = None
    object_path: str | None = None
    duration_ms: int = 0
    billed_units: int = 0
    media_type: str | None = None
    error: str | None = None
    provider_job_id: str | None = None


@dataclass
class PlaybackChunk:
    index: int
    duration_ms: int
    url: str


@dataclass
class AudioProgress:
    position_ms: int = 0
    playback_rate: float = 1.0


@dataclass
class StoredObject:
    content: bytes
    media_type: str
    urls: int = 0


class AudioStore(Protocol):
    def get_by_hashes(
        self, lesson_id: str, content_sha256: str, config_sha256: str
    ) -> NarrationRecord | None: ...

    def get_narration(self, narration_id: str) -> NarrationRecord | None: ...

    def latest_for_lesson(
        self, lesson_id: str, user_id: str
    ) -> NarrationRecord | None: ...

    def insert_narration(self, record: NarrationRecord) -> NarrationRecord: ...

    def replace_chunks(self, narration_id: str, chunks: list[ChunkRecord]) -> None: ...

    def list_chunks(self, narration_id: str) -> list[ChunkRecord]: ...

    def set_narration_status(
        self,
        narration_id: str,
        status: NarrationStatus,
        *,
        error: str | None = None,
        estimated_cost_cents: int | None = None,
    ) -> None: ...

    def claim_chunk(
        self, narration_id: str, lease_seconds: int
    ) -> ChunkRecord | None: ...

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
    ) -> bool: ...

    def fail_chunk(
        self, chunk_id: str, lease_token: str, *, error: str, retry: bool
    ) -> bool: ...

    def requeue_failed(self, narration_id: str) -> int: ...

    def active_job_count(
        self, user_id: str, *, exclude_id: str | None = None
    ) -> int: ...

    def billed_units_this_month(self, user_id: str) -> int: ...

    def cents_per_thousand(self, provider: str, model: str) -> int | None: ...

    def put_audio(self, path: str, content: bytes, media_type: str) -> None: ...

    def signed_url(self, path: str, expires_seconds: int) -> str: ...

    def get_progress(self, user_id: str, lesson_id: str) -> AudioProgress: ...

    def save_progress(
        self,
        user_id: str,
        lesson_id: str,
        course_id: str,
        *,
        position_ms: int,
        playback_rate: float,
    ) -> AudioProgress: ...

    def recoverable_narration_ids(self) -> list[str]: ...
