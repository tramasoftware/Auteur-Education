"""How routes reach the audio store and the active TTS adapter."""

from __future__ import annotations

from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError
from auteur_api.modules.audio.models import AudioStore
from auteur_api.modules.audio.providers.base import TTSProvider
from auteur_api.modules.audio.providers.factory import (
    audio_unavailable,
    create_tts_provider,
)

_UNAVAILABLE = "Lesson audio is not available right now."


def get_audio_store() -> AudioStore:
    if not settings.supabase_configured:
        raise ApiError("audio_unavailable", _UNAVAILABLE)
    from auteur_api.core.postgres_store import get_postgres_store
    from auteur_api.modules.audio.postgres import PostgresAudioStore

    return PostgresAudioStore(get_postgres_store()._client)


def get_tts_provider() -> TTSProvider:
    return create_tts_provider()


def require_cron_secret(authorization: str | None) -> None:
    secret = settings.cron_secret
    if secret is None:
        raise audio_unavailable()
    if not authorization:
        raise ApiError("unauthorized", "Sign in is required to continue.")
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or value.strip() != secret.get_secret_value():
        raise ApiError("unauthorized", "Sign in is required to continue.")
