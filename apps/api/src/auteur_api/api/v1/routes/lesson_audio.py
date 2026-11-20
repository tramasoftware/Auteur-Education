"""Lesson audio. GET never synthesizes. POST schedules durable work (DEC-024)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, status

from auteur_api.core.auth import CurrentUserId
from auteur_api.core.background import TaskRunner, bind_request_tasks, get_task_runner
from auteur_api.core.store import Store as StoreBackend
from auteur_api.core.store import get_store
from auteur_api.modules.audio.access import (
    get_audio_store,
    get_tts_provider,
    require_cron_secret,
)
from auteur_api.modules.audio.models import AudioStore
from auteur_api.modules.audio.providers.base import TTSProvider
from auteur_api.modules.audio.schemas import (
    AudioProgressRequest,
    AudioProgressResponse,
    NarrationStatusResponse,
    PlaybackResponse,
    TickResponse,
)
from auteur_api.modules.audio.service import (
    get_playback,
    get_status,
    request_narration,
    retry_narration,
    save_progress,
    tick_stale_jobs,
)

router = APIRouter(tags=["audio"])

Store = Annotated[StoreBackend, Depends(get_store)]
Runner = Annotated[TaskRunner, Depends(get_task_runner)]


def authorized_audio_store(
    user_id: CurrentUserId,
    audio: Annotated[AudioStore, Depends(get_audio_store)],
) -> AudioStore:
    del user_id
    return audio


def authorized_tts_provider(
    user_id: CurrentUserId,
    provider: Annotated[TTSProvider, Depends(get_tts_provider)],
) -> TTSProvider:
    del user_id
    return provider


def cron_guard(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    require_cron_secret(authorization)


def cron_audio_store(
    _: Annotated[None, Depends(cron_guard)],
    audio: Annotated[AudioStore, Depends(get_audio_store)],
) -> AudioStore:
    return audio


def cron_tts_provider(
    _: Annotated[None, Depends(cron_guard)],
    provider: Annotated[TTSProvider, Depends(get_tts_provider)],
) -> TTSProvider:
    return provider


Audio = Annotated[AudioStore, Depends(authorized_audio_store)]
Provider = Annotated[TTSProvider, Depends(authorized_tts_provider)]
CronAudio = Annotated[AudioStore, Depends(cron_audio_store)]
CronProvider = Annotated[TTSProvider, Depends(cron_tts_provider)]


@router.post(
    "/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}/audio",
    response_model=NarrationStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def post_lesson_audio(
    course_id: str,
    module_id: str,
    lesson_id: str,
    store: Store,
    audio: Audio,
    provider: Provider,
    runner: Runner,
    user_id: CurrentUserId,
    _: Annotated[None, Depends(bind_request_tasks)],
) -> NarrationStatusResponse:
    return await request_narration(
        store=store,
        audio=audio,
        provider=provider,
        runner=runner,
        user_id=user_id,
        course_id=course_id,
        module_id=module_id,
        lesson_id=lesson_id,
    )


@router.get(
    "/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}/audio",
    response_model=NarrationStatusResponse,
)
def get_lesson_audio(
    course_id: str,
    module_id: str,
    lesson_id: str,
    store: Store,
    audio: Audio,
    user_id: CurrentUserId,
) -> NarrationStatusResponse:
    return get_status(
        store=store,
        audio=audio,
        user_id=user_id,
        course_id=course_id,
        module_id=module_id,
        lesson_id=lesson_id,
    )


@router.get(
    "/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}/audio/playback",
    response_model=PlaybackResponse,
)
def get_lesson_audio_playback(
    course_id: str,
    module_id: str,
    lesson_id: str,
    store: Store,
    audio: Audio,
    user_id: CurrentUserId,
) -> PlaybackResponse:
    return get_playback(
        store=store,
        audio=audio,
        user_id=user_id,
        course_id=course_id,
        module_id=module_id,
        lesson_id=lesson_id,
    )


@router.put(
    "/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}/audio/progress",
    response_model=AudioProgressResponse,
)
def put_lesson_audio_progress(
    course_id: str,
    module_id: str,
    lesson_id: str,
    body: AudioProgressRequest,
    store: Store,
    audio: Audio,
    user_id: CurrentUserId,
) -> AudioProgressResponse:
    return save_progress(
        store=store,
        audio=audio,
        user_id=user_id,
        course_id=course_id,
        module_id=module_id,
        lesson_id=lesson_id,
        position_ms=body.position_ms,
        playback_rate=body.playback_rate,
    )


@router.post(
    "/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}/audio/retry",
    response_model=NarrationStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def post_lesson_audio_retry(
    course_id: str,
    module_id: str,
    lesson_id: str,
    store: Store,
    audio: Audio,
    provider: Provider,
    runner: Runner,
    user_id: CurrentUserId,
    _: Annotated[None, Depends(bind_request_tasks)],
) -> NarrationStatusResponse:
    return await retry_narration(
        store=store,
        audio=audio,
        provider=provider,
        runner=runner,
        user_id=user_id,
        course_id=course_id,
        module_id=module_id,
        lesson_id=lesson_id,
    )


@router.get("/internal/audio/tick", response_model=TickResponse)
async def tick_lesson_audio(
    audio: CronAudio,
    provider: CronProvider,
    runner: Runner,
    _: Annotated[None, Depends(bind_request_tasks)],
) -> TickResponse:
    resumed = await tick_stale_jobs(audio=audio, provider=provider, runner=runner)
    return TickResponse(resumed=resumed)
