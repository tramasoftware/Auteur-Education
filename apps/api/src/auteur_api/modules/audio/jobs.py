"""Lease a chunk, call TTS outside Postgres, complete only with the same token."""

from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError
from auteur_api.modules.audio.models import AudioStore, ChunkRecord, NarrationRecord
from auteur_api.modules.audio.providers.base import TTSError, TTSProvider

logger = logging.getLogger("auteur_api.audio")

_SAFE_FAIL = "Lesson audio could not be prepared. You can retry."


async def run_narration(
    narration_id: str,
    *,
    store: AudioStore,
    provider: TTSProvider,
) -> None:
    row = store.get_narration(narration_id)
    if row is None:
        return
    if row.status == "ready":
        return
    store.set_narration_status(narration_id, "generating", error=None)
    while True:
        claimed = store.claim_chunk(narration_id, settings.tts_lease_seconds)
        if claimed is None:
            _finalize(store, narration_id)
            return
        await _run_claimed(store, provider, row, claimed)


async def resume_stale_narrations(
    *,
    store: AudioStore,
    provider: TTSProvider,
    runner,
) -> None:
    for narration_id in store.recoverable_narration_ids():
        await runner.schedule(
            run_narration(narration_id, store=store, provider=provider)
        )


async def _run_claimed(
    store: AudioStore,
    provider: TTSProvider,
    narration: NarrationRecord,
    chunk: ChunkRecord,
) -> None:
    attempt_id = chunk.lease_token or str(uuid4())
    retryable_left = chunk.attempts < settings.tts_max_chunk_attempts
    logger.info(
        "audio_attempt narration=%s chunk=%s attempt=%s index=%s",
        narration.id,
        chunk.id,
        attempt_id,
        chunk.index,
    )
    if chunk.object_path and chunk.status != "ready":
        # Should not happen; ready chunks are never claimed.
        pass
    try:
        result = await asyncio.to_thread(
            provider.synthesize,
            chunk.text,
            attempt_id=attempt_id,
            voice_id=narration.voice_id,
            model=narration.model,
            output_format=narration.output_format,
        )
        path = f"{narration.id}/{chunk.index}.mp3"
        await asyncio.to_thread(
            store.put_audio, path, result.audio, result.media_type
        )
        completed = store.complete_chunk(
            chunk.id,
            attempt_id,
            object_path=path,
            duration_ms=result.duration_ms,
            billed_units=result.billed_units,
            media_type=result.media_type,
            provider_job_id=result.provider_job_id,
        )
        if not completed:
            logger.info(
                "audio_complete_lease_mismatch chunk=%s attempt=%s",
                chunk.id,
                attempt_id,
            )
    except TTSError as exc:
        retry = exc.retryable and retryable_left
        store.fail_chunk(
            chunk.id, attempt_id, error=_SAFE_FAIL, retry=retry
        )
        logger.info(
            "audio_attempt_failed chunk=%s attempt=%s retry=%s",
            chunk.id,
            attempt_id,
            retry,
        )
        if not retry:
            store.set_narration_status(narration.id, "failed", error=_SAFE_FAIL)
    except ApiError:
        store.fail_chunk(
            chunk.id, attempt_id, error=_SAFE_FAIL, retry=retryable_left
        )
        if not retryable_left:
            store.set_narration_status(narration.id, "failed", error=_SAFE_FAIL)
        logger.info("audio_storage_failed chunk=%s attempt=%s", chunk.id, attempt_id)


def _finalize(store: AudioStore, narration_id: str) -> None:
    chunks = store.list_chunks(narration_id)
    if not chunks:
        store.set_narration_status(narration_id, "failed", error=_SAFE_FAIL)
        return
    if any(chunk.status in {"queued", "leased"} for chunk in chunks):
        return
    if all(chunk.status == "ready" for chunk in chunks):
        billed = sum(chunk.billed_units for chunk in chunks)
        rate = _rate(store, narration_id)
        cost = None if rate is None else (billed * rate + 999) // 1000
        store.set_narration_status(
            narration_id, "ready", error=None, estimated_cost_cents=cost
        )
        return
    store.set_narration_status(narration_id, "failed", error=_SAFE_FAIL)


def _rate(store: AudioStore, narration_id: str) -> int | None:
    row = store.get_narration(narration_id)
    if row is None:
        return None
    return store.cents_per_thousand(row.provider, row.model)
