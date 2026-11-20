"""In-process TTS for development and tests. No network. Never used in production."""

from __future__ import annotations

from auteur_api.modules.audio.providers.base import (
    TTSCapabilities,
    TTSError,
    TTSResult,
)

# MPEG-1 Layer III, 32 kbps, 44.1 kHz, mono. One frame is 26.1 ms.
_HEADER = bytes.fromhex("fff330c400")
_FRAME = (_HEADER + bytes(99))[:104]
_FRAME_COUNT = 40
SILENT_MP3 = _FRAME * _FRAME_COUNT
MOCK_DURATION_MS = int(_FRAME_COUNT * 1152 / 44100 * 1000)


class MockTTSProvider:
    capabilities = TTSCapabilities(
        name="mock",
        max_input=4000,
        input_unit="chars",
        generation="sync",
        usage_unit="characters",
        media_type="audio/mpeg",
    )

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.fail_times = 0
        self.fail_retryable = True

    def synthesize(
        self,
        text: str,
        *,
        attempt_id: str,
        voice_id: str,
        model: str,
        output_format: str,
    ) -> TTSResult:
        del attempt_id, voice_id, model, output_format
        self.calls.append(text)
        if self.fail_times > 0:
            self.fail_times -= 1
            raise TTSError("mock_provider_error", retryable=self.fail_retryable)
        return TTSResult(
            audio=SILENT_MP3,
            billed_units=len(text),
            duration_ms=MOCK_DURATION_MS,
            media_type=self.capabilities.media_type,
        )
