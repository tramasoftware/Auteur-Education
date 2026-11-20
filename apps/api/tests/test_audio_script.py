"""Narration text splitting respects provider input units (DEC-024)."""

from auteur_api.modules.audio.script import measure, split_narration
from auteur_api.modules.generation.prompts import lesson_reading_text
from auteur_api.modules.generation.schemas import LessonDraftOutput, LessonSectionOutput


def test_split_chars_keeps_order() -> None:
    text = "Alpha.\n\nBravo sentence. Charlie.\n\nDelta."
    parts = split_narration(text, max_input=20, unit="chars")
    assert "".join(part.replace(" ", "") for part in parts)
    assert "Alpha." in parts[0]
    assert parts[-1].endswith("Delta.")
    assert all(measure(part, "chars") <= 20 for part in parts)


def test_split_bytes_does_not_break_utf8() -> None:
    text = "ñ" * 10
    parts = split_narration(text, max_input=8, unit="bytes")
    assert "".join(parts) == text
    assert all(measure(part, "bytes") <= 8 for part in parts)


def test_narration_uses_lesson_reading_text() -> None:
    draft = LessonDraftOutput(
        title="Title",
        sections=[
            LessonSectionOutput(kind="prose", heading="H", body="Body text."),
        ],
        sources_used_refs=[],
    )
    from auteur_api.modules.audio.script import narration_script

    assert narration_script(draft) == lesson_reading_text(draft)
    assert "prose" not in narration_script(draft)
