"""Request, inspect and retry lesson narration without touching course credits."""

from __future__ import annotations

from uuid import uuid4

from auteur_api.core.background import TaskRunner
from auteur_api.core.config import settings
from auteur_api.core.errors import invalid_state, not_found
from auteur_api.core.store import Store
from auteur_api.modules.audio.jobs import resume_stale_narrations, run_narration
from auteur_api.modules.audio.models import (
    AudioStore,
    ChunkRecord,
    NarrationRecord,
)
from auteur_api.modules.audio.providers.base import TTSProvider
from auteur_api.modules.audio.schemas import (
    AudioProgressResponse,
    NarrationStatusResponse,
    PlaybackChunkResponse,
    PlaybackResponse,
    progress_response,
    status_response,
)
from auteur_api.modules.audio.script import (
    config_digest,
    measure,
    narration_script,
    sha256_text,
    split_narration,
)
from auteur_api.modules.generation import service as courses
from auteur_api.modules.generation.schemas import (
    CourseRecord,
    LessonRecord,
    LessonState,
    ModuleRecord,
)


async def request_narration(
    *,
    store: Store,
    audio: AudioStore,
    provider: TTSProvider,
    runner: TaskRunner,
    user_id: str,
    course_id: str,
    module_id: str,
    lesson_id: str,
) -> NarrationStatusResponse:
    course, module, lesson = published_lesson(
        store, user_id, course_id, module_id, lesson_id
    )
    assert lesson.draft is not None
    caps = provider.capabilities
    max_input = caps.max_input
    if settings.tts_max_input:
        max_input = min(max_input, settings.tts_max_input)
    script = narration_script(lesson.draft)
    if not script.strip():
        raise invalid_state("This lesson has no text to narrate.")
    digest = sha256_text(script)
    config = config_digest(
        provider=caps.name,
        model=settings.tts_model,
        voice_id=settings.tts_voice_id,
        output_format=settings.tts_output_format,
        input_unit=caps.input_unit,
        max_input=max_input,
    )
    existing = audio.get_by_hashes(lesson_id, digest, config)
    if existing is not None:
        if existing.status in {"queued", "generating"}:
            await runner.schedule(
                run_narration(existing.id, store=audio, provider=provider)
            )
        return status_response(existing, audio.list_chunks(existing.id))

    units = measure(script, caps.input_unit)
    cap = settings.tts_monthly_unit_cap
    if cap > 0 and audio.billed_units_this_month(user_id) + units > cap:
        raise invalid_state("Lesson audio is paused this month. Try again later.")
    if audio.active_job_count(user_id) >= settings.tts_max_active_jobs_per_user:
        raise invalid_state("Another lesson is still preparing audio.")

    fragments = split_narration(script, max_input=max_input, unit=caps.input_unit)
    if not fragments:
        raise invalid_state("This lesson has no text to narrate.")

    record = NarrationRecord(
        id=str(uuid4()),
        user_id=user_id,
        course_id=course.id,
        module_id=module.id,
        lesson_id=lesson.id,
        content_sha256=digest,
        config_sha256=config,
        provider=caps.name,
        model=settings.tts_model,
        voice_id=settings.tts_voice_id,
        output_format=settings.tts_output_format,
        status="queued",
    )
    stored = audio.insert_narration(record)
    if stored.id == record.id or not audio.list_chunks(stored.id):
        audio.replace_chunks(
            stored.id,
            [
                ChunkRecord(
                    id=str(uuid4()),
                    narration_id=stored.id,
                    index=index,
                    text=fragment,
                    status="queued",
                )
                for index, fragment in enumerate(fragments)
            ],
        )
    if stored.status in {"queued", "generating"}:
        await runner.schedule(
            run_narration(stored.id, store=audio, provider=provider)
        )
    return status_response(stored, audio.list_chunks(stored.id))


def get_status(
    *,
    store: Store,
    audio: AudioStore,
    user_id: str,
    course_id: str,
    module_id: str,
    lesson_id: str,
) -> NarrationStatusResponse:
    published_lesson(store, user_id, course_id, module_id, lesson_id)
    row = audio.latest_for_lesson(lesson_id, user_id)
    if row is None:
        raise not_found("Lesson audio")
    return status_response(row, audio.list_chunks(row.id))


def get_playback(
    *,
    store: Store,
    audio: AudioStore,
    user_id: str,
    course_id: str,
    module_id: str,
    lesson_id: str,
) -> PlaybackResponse:
    published_lesson(store, user_id, course_id, module_id, lesson_id)
    row = audio.latest_for_lesson(lesson_id, user_id)
    if row is None:
        raise not_found("Lesson audio")
    if row.status != "ready":
        raise invalid_state("Lesson audio is not ready yet.")
    chunks = audio.list_chunks(row.id)
    missing = any(
        chunk.status != "ready" or not chunk.object_path for chunk in chunks
    )
    if not chunks or missing:
        raise invalid_state("Lesson audio is not ready yet.")
    progress = audio.get_progress(user_id, lesson_id)
    signed = [
        PlaybackChunkResponse(
            index=chunk.index,
            duration_ms=chunk.duration_ms,
            url=audio.signed_url(chunk.object_path, settings.tts_signed_url_seconds),
        )
        for chunk in chunks
    ]
    media_type = chunks[0].media_type or "audio/mpeg"
    return PlaybackResponse(
        narration_id=row.id,
        media_type=media_type,
        duration_ms=row.duration_ms,
        position_ms=progress.position_ms,
        playback_rate=progress.playback_rate,
        chunks=signed,
    )


def save_progress(
    *,
    store: Store,
    audio: AudioStore,
    user_id: str,
    course_id: str,
    module_id: str,
    lesson_id: str,
    position_ms: int,
    playback_rate: float,
) -> AudioProgressResponse:
    published_lesson(store, user_id, course_id, module_id, lesson_id)
    row = audio.save_progress(
        user_id,
        lesson_id,
        course_id,
        position_ms=position_ms,
        playback_rate=playback_rate,
    )
    return progress_response(row)


async def retry_narration(
    *,
    store: Store,
    audio: AudioStore,
    provider: TTSProvider,
    runner: TaskRunner,
    user_id: str,
    course_id: str,
    module_id: str,
    lesson_id: str,
) -> NarrationStatusResponse:
    published_lesson(store, user_id, course_id, module_id, lesson_id)
    row = audio.latest_for_lesson(lesson_id, user_id)
    if row is None:
        raise not_found("Lesson audio")
    if row.status != "failed":
        raise invalid_state("This lesson audio cannot be retried.")
    audio.requeue_failed(row.id)
    audio.set_narration_status(row.id, "queued", error=None)
    await runner.schedule(run_narration(row.id, store=audio, provider=provider))
    updated = audio.get_narration(row.id) or row
    return status_response(updated, audio.list_chunks(row.id))


async def tick_stale_jobs(
    *,
    audio: AudioStore,
    provider: TTSProvider,
    runner: TaskRunner,
) -> int:
    ids = audio.recoverable_narration_ids()
    await resume_stale_narrations(store=audio, provider=provider, runner=runner)
    return len(ids)


def published_lesson(
    store: Store,
    user_id: str,
    course_id: str,
    module_id: str,
    lesson_id: str,
) -> tuple[CourseRecord, ModuleRecord, LessonRecord]:
    course = store.get_lesson_course(course_id, module_id, user_id=user_id)
    module = courses.published_module(course, module_id)
    lesson = next((item for item in module.lessons if item.id == lesson_id), None)
    if lesson is None:
        raise not_found("Lesson")
    if lesson.state != LessonState.APPROVED or lesson.draft is None:
        raise invalid_state("This lesson is not available yet.")
    return course, module, lesson
