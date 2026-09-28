"""Minimal functional traceability for generation (AI_GENERATION.md).

One StageTrace per model call: stage, target, prompt/schema version, model,
attempt, duration, tokens, status and failed validation codes. No prompts,
no private reasoning, no secrets.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel


class TokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    total_tokens: int = 0


class StageTrace(BaseModel):
    stage: str
    target: str
    prompt_version: str
    schema_version: str
    model: str
    attempt: int
    started_at: datetime
    duration_ms: int
    usage: TokenUsage
    status: Literal["ok", "invalid", "failed"]
    validation_codes: list[str] = []
    qa_result: str | None = None
    web_search: bool = False


def now() -> datetime:
    return datetime.now(UTC)


class TraceSummary(BaseModel):
    calls: int
    failed_calls: int
    total_duration_ms: int
    usage: TokenUsage


def summarize(traces: list[StageTrace]) -> TraceSummary:
    usage = TokenUsage()
    total_ms = 0
    failed = 0
    for trace in traces:
        usage.input_tokens += trace.usage.input_tokens
        usage.output_tokens += trace.usage.output_tokens
        usage.reasoning_tokens += trace.usage.reasoning_tokens
        usage.total_tokens += trace.usage.total_tokens
        total_ms += trace.duration_ms
        if trace.status != "ok":
            failed += 1
    return TraceSummary(
        calls=len(traces),
        failed_calls=failed,
        total_duration_ms=total_ms,
        usage=usage,
    )
