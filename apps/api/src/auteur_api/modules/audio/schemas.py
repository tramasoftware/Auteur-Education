"""Learner-facing audio contracts. Provider names stay off this surface."""

from __future__ import annotations

from pydantic import BaseModel, Field

from auteur_api.modules.audio.models import AudioProgress, ChunkRecord, NarrationRecord


class NarrationStatusResponse(BaseModel):
    narration_id: str
    status: str
    error_message: str | None = None
    chunk_count: int
    ready_chunks: int
    duration_ms: int
    estimated_cost_cents: int | None = None


class PlaybackChunkResponse(BaseModel):
    index: int
    duration_ms: int
    url: str


class PlaybackResponse(BaseModel):
    narration_id: str
    media_type: str
    duration_ms: int
    position_ms: int
    playback_rate: float
    chunks: list[PlaybackChunkResponse]


class AudioProgressRequest(BaseModel):
    position_ms: int = Field(ge=0)
    playback_rate: float = Field(gt=0, le=3)


class AudioProgressResponse(BaseModel):
    position_ms: int
    playback_rate: float


class TickResponse(BaseModel):
    resumed: int


def status_response(
    row: NarrationRecord, chunks: list[ChunkRecord]
) -> NarrationStatusResponse:
    return NarrationStatusResponse(
        narration_id=row.id,
        status=row.status,
        error_message=row.error if row.status == "failed" else None,
        chunk_count=len(chunks),
        ready_chunks=sum(1 for chunk in chunks if chunk.status == "ready"),
        duration_ms=row.duration_ms,
        estimated_cost_cents=row.estimated_cost_cents,
    )


def progress_response(row: AudioProgress) -> AudioProgressResponse:
    return AudioProgressResponse(
        position_ms=row.position_ms, playback_rate=row.playback_rate
    )
