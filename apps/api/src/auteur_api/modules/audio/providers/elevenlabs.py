"""ElevenLabs HTTP adapter. Prepared, not called until credentials exist."""

from __future__ import annotations

import logging

import httpx

from auteur_api.modules.audio.providers.base import (
    TTSCapabilities,
    TTSError,
    TTSResult,
)

logger = logging.getLogger("auteur_api.audio.elevenlabs")

_RETRYABLE = {408, 409, 429, 500, 502, 503, 504}


class ElevenLabsProvider:
    capabilities = TTSCapabilities(
        name="elevenlabs",
        max_input=5000,
        input_unit="chars",
        generation="sync",
        usage_unit="characters",
        media_type="audio/mpeg",
    )

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.elevenlabs.io",
        timeout_seconds: float = 60.0,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds

    def synthesize(
        self,
        text: str,
        *,
        attempt_id: str,
        voice_id: str,
        model: str,
        output_format: str,
    ) -> TTSResult:
        url = f"{self._base_url}/v1/text-to-speech/{voice_id}"
        headers = {
            "xi-api-key": self._api_key,
            "accept": "audio/mpeg",
            "content-type": "application/json",
        }
        payload = {"text": text, "model_id": model}
        try:
            response = httpx.post(
                url,
                headers=headers,
                params={"output_format": output_format},
                json=payload,
                timeout=self._timeout,
            )
        except httpx.TimeoutException as exc:
            raise TTSError("tts_timeout", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise TTSError("tts_network", retryable=True) from exc

        if response.status_code in _RETRYABLE:
            logger.info(
                "elevenlabs_retryable status=%s attempt=%s",
                response.status_code,
                attempt_id,
            )
            raise TTSError("tts_retryable", retryable=True)
        if response.status_code >= 400:
            logger.info(
                "elevenlabs_rejected status=%s attempt=%s",
                response.status_code,
                attempt_id,
            )
            raise TTSError("tts_rejected", retryable=False)

        audio = response.content
        if not audio:
            raise TTSError("tts_empty", retryable=True)
        return TTSResult(
            audio=audio,
            billed_units=len(text),
            duration_ms=_duration_from_mpeg(audio),
            media_type="audio/mpeg",
        )


def _duration_from_mpeg(audio: bytes) -> int:
    # Enough for a progress bar. Exact duration is not required of the adapter.
    if not audio:
        return 0
    return max(1000, int(len(audio) / 16))
