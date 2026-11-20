"""Shared TTS contract. Keep this small: only what lesson narration needs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

InputUnit = Literal["chars", "bytes"]
GenerationMode = Literal["sync", "async"]
UsageUnit = Literal["characters", "bytes", "requests"]


@dataclass(frozen=True)
class TTSCapabilities:
    name: str
    max_input: int
    input_unit: InputUnit
    generation: GenerationMode
    usage_unit: UsageUnit
    media_type: str


@dataclass(frozen=True)
class TTSResult:
    audio: bytes
    billed_units: int
    duration_ms: int
    media_type: str
    provider_job_id: str | None = None


class TTSError(Exception):
    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class TTSProvider(Protocol):
    capabilities: TTSCapabilities

    def synthesize(
        self,
        text: str,
        *,
        attempt_id: str,
        voice_id: str,
        model: str,
        output_format: str,
    ) -> TTSResult: ...
