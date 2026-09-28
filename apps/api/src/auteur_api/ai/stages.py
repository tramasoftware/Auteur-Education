"""Run one logical generation stage: call, validate, retry, trace.

Implements AI-VAL-01 (schema), the "Reintentos y recuperación" rules
(up to N attempts, each retry carries the previous diagnostic) and BR-GEN-008.
Programmatic validators return a list of stable validation codes; an empty list
means the output is acceptable.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from pydantic import BaseModel

from auteur_api.ai.client import AIClient, GenerationError, StructuredResult
from auteur_api.ai.tracing import StageTrace, TokenUsage, now
from auteur_api.core.store import DemoStore

logger = logging.getLogger("auteur_api.ai.stages")

type Validator[T] = Callable[[StructuredResult[T]], list[str]]

UNTRUSTED_OPEN = "<<<UNTRUSTED_DATA"
UNTRUSTED_CLOSE = "UNTRUSTED_DATA>>>"


def untrusted(label: str, text: str) -> str:
    """Delimit user or external text as data, not instructions (AI-VAL-07)."""
    cleaned = text.replace(UNTRUSTED_OPEN, "").replace(UNTRUSTED_CLOSE, "")
    return f"{UNTRUSTED_OPEN} {label}\n{cleaned}\n{UNTRUSTED_CLOSE}"


class StageFailed(Exception):
    def __init__(self, stage: str, target: str, diagnostic: str, kind: str) -> None:
        super().__init__(diagnostic)
        self.stage = stage
        self.target = target
        self.diagnostic = diagnostic
        self.kind = kind


async def run_stage[T: BaseModel](
    *,
    ai: AIClient,
    store: DemoStore,
    scope_id: str,
    stage: str,
    target: str,
    prompt_version: str,
    instructions: str,
    input: str,
    schema: type[T],
    validate: Validator[T] | None = None,
    web_search: bool = False,
    search_context_size: str = "medium",
    max_attempts: int = 3,
) -> StructuredResult[T]:
    schema_version = getattr(schema, "SCHEMA_VERSION", "v1")
    diagnostic: str | None = None

    for attempt in range(1, max_attempts + 1):
        started_at = now()
        attempt_input = input
        if diagnostic:
            attempt_input = (
                f"{input}\n\nPREVIOUS ATTEMPT DIAGNOSTIC (fix these problems, keep "
                f"everything that was valid):\n{diagnostic}"
            )
        try:
            result = await ai.generate_structured(
                instructions=instructions,
                input=attempt_input,
                schema=schema,
                web_search=web_search,
                search_context_size=search_context_size,
            )
        except GenerationError as exc:
            store.add_trace(
                scope_id,
                StageTrace(
                    stage=stage,
                    target=target,
                    prompt_version=prompt_version,
                    schema_version=schema_version,
                    model="unknown",
                    attempt=attempt,
                    started_at=started_at,
                    duration_ms=int((now() - started_at).total_seconds() * 1000),
                    usage=TokenUsage(),
                    status="failed",
                    validation_codes=[f"{exc.kind}_error"],
                    web_search=web_search,
                ),
            )
            logger.warning(
                "stage_failed stage=%s target=%s attempt=%s kind=%s",
                stage,
                target,
                attempt,
                exc.kind,
            )
            if exc.kind in ("unconfigured", "provider"):
                # Provider problems are not fixed by re-prompting.
                raise StageFailed(stage, target, exc.diagnostic, exc.kind) from exc
            diagnostic = exc.diagnostic
            continue

        codes = validate(result) if validate else []
        store.add_trace(
            scope_id,
            StageTrace(
                stage=stage,
                target=target,
                prompt_version=prompt_version,
                schema_version=schema_version,
                model=result.model,
                attempt=attempt,
                started_at=started_at,
                duration_ms=result.duration_ms,
                usage=result.usage,
                status="ok" if not codes else "invalid",
                validation_codes=codes,
                web_search=web_search,
            ),
        )
        logger.info(
            "stage_done stage=%s target=%s attempt=%s status=%s ms=%s tokens=%s",
            stage,
            target,
            attempt,
            "ok" if not codes else "invalid",
            result.duration_ms,
            result.usage.total_tokens,
        )
        if not codes:
            return result
        diagnostic = "Validation failed with codes: " + ", ".join(codes)

    raise StageFailed(
        stage,
        target,
        diagnostic or "No valid output after the maximum number of attempts.",
        "validation",
    )
