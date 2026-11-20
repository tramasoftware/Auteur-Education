"""Resolve the active TTS adapter from settings. Production never gets the mock."""

from __future__ import annotations

from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError
from auteur_api.modules.audio.providers.base import TTSProvider
from auteur_api.modules.audio.providers.elevenlabs import ElevenLabsProvider
from auteur_api.modules.audio.providers.mock import MockTTSProvider

_UNAVAILABLE = "Lesson audio is not available right now."


def audio_unavailable(message: str = _UNAVAILABLE) -> ApiError:
    return ApiError("audio_unavailable", message)


def create_tts_provider() -> TTSProvider:
    if not settings.tts_enabled:
        raise audio_unavailable()
    name = settings.tts_provider.strip().lower()
    if name == "mock":
        if not settings.mock_tts_permitted:
            raise audio_unavailable()
        return MockTTSProvider()
    if name == "elevenlabs":
        secret = settings.elevenlabs_api_key
        if secret is None:
            if settings.tts_allow_mock and settings.mock_tts_permitted:
                return MockTTSProvider()
            raise audio_unavailable()
        return ElevenLabsProvider(
            secret.get_secret_value(),
            base_url=settings.elevenlabs_base_url,
        )
    raise audio_unavailable()
