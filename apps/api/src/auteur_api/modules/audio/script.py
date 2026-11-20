"""Turn an approved lesson into ordered narration fragments."""

from __future__ import annotations

import hashlib
import json
import re

from auteur_api.modules.audio.providers.base import InputUnit
from auteur_api.modules.generation.prompts import lesson_reading_text
from auteur_api.modules.generation.schemas import LessonDraftOutput

_SENTENCE = re.compile(r"(?<=[.!?])\s+")


def narration_script(draft: LessonDraftOutput) -> str:
    """Same prose the reader sees. Do not change lesson_reading_text()."""
    return lesson_reading_text(draft)


def config_digest(
    *,
    provider: str,
    model: str,
    voice_id: str,
    output_format: str,
    input_unit: InputUnit,
    max_input: int,
) -> str:
    payload = json.dumps(
        {
            "provider": provider,
            "model": model,
            "voice_id": voice_id,
            "output_format": output_format,
            "input_unit": input_unit,
            "max_input": max_input,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256_text(payload)


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def measure(text: str, unit: InputUnit) -> int:
    if unit == "bytes":
        return len(text.encode("utf-8"))
    return len(text)


def split_narration(text: str, *, max_input: int, unit: InputUnit) -> list[str]:
    """Preserve order. Prefer paragraphs, then sentences, then a hard cut."""
    if max_input < 1:
        raise ValueError("max_input")
    stripped = text.strip()
    if not stripped:
        return []
    chunks: list[str] = []
    for paragraph in stripped.split("\n\n"):
        piece = paragraph.strip()
        if not piece:
            continue
        chunks.extend(_fit(piece, max_input=max_input, unit=unit))
    return chunks


def _fit(text: str, *, max_input: int, unit: InputUnit) -> list[str]:
    if measure(text, unit) <= max_input:
        return [text]
    sentences = [part.strip() for part in _SENTENCE.split(text) if part.strip()]
    if len(sentences) > 1:
        return _pack(sentences, max_input=max_input, unit=unit)
    return _hard_cut(text, max_input=max_input, unit=unit)


def _pack(parts: list[str], *, max_input: int, unit: InputUnit) -> list[str]:
    packed: list[str] = []
    current = ""
    for part in parts:
        if measure(part, unit) > max_input:
            if current:
                packed.append(current)
                current = ""
            packed.extend(_fit(part, max_input=max_input, unit=unit))
            continue
        candidate = f"{current} {part}".strip() if current else part
        if measure(candidate, unit) <= max_input:
            current = candidate
        else:
            packed.append(current)
            current = part
    if current:
        packed.append(current)
    return packed


def _hard_cut(text: str, *, max_input: int, unit: InputUnit) -> list[str]:
    if unit == "bytes":
        encoded = text.encode("utf-8")
        pieces: list[str] = []
        start = 0
        while start < len(encoded):
            end = min(start + max_input, len(encoded))
            while end > start:
                try:
                    pieces.append(encoded[start:end].decode("utf-8"))
                    break
                except UnicodeDecodeError:
                    end -= 1
            if end == start:
                end = min(start + max_input, len(encoded))
                pieces.append(encoded[start:end].decode("utf-8", errors="ignore"))
            start = end
        return [piece for piece in pieces if piece]
    return [text[i : i + max_input] for i in range(0, len(text), max_input)]
