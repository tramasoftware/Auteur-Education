"""Isolated AI provider integration (DEC-001, DEC-002).

Everything provider-specific lives here. The rest of the backend depends on the
`AIClient` protocol and `StructuredResult`, so the provider can be replaced or
faked in tests. Credentials come from Settings and never leave the server.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Literal, Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from auteur_api.ai.tracing import TokenUsage
from auteur_api.core.config import Settings, settings

logger = logging.getLogger("auteur_api.ai")

T = TypeVar("T", bound=BaseModel)

GenerationErrorKind = Literal["provider", "schema", "refusal", "unconfigured"]


class GenerationError(Exception):
    """Raised when the model could not produce a valid structured output."""

    def __init__(self, kind: GenerationErrorKind, diagnostic: str) -> None:
        super().__init__(diagnostic)
        self.kind = kind
        self.diagnostic = diagnostic


@dataclass
class Citation:
    url: str
    title: str


@dataclass
class StructuredResult[T: BaseModel]:
    parsed: T
    usage: TokenUsage
    model: str
    duration_ms: int
    citations: list[Citation] = field(default_factory=list)


class AIClient(Protocol):
    async def generate_structured[T: BaseModel](
        self,
        *,
        instructions: str,
        input: str,
        schema: type[T],
        web_search: bool = False,
        search_context_size: str = "medium",
    ) -> StructuredResult[T]: ...


class UnconfiguredAIClient:
    """Used when no API key is configured; the app still starts safely."""

    async def generate_structured(
        self,
        *,
        instructions: str,
        input: str,
        schema: type[T],
        web_search: bool = False,
        search_context_size: str = "medium",
    ) -> StructuredResult[T]:
        raise GenerationError(
            "unconfigured", "AI provider is not configured on the server."
        )


class OpenAIClient:
    def __init__(self, config: Settings) -> None:
        # Imported lazily so the rest of the app does not depend on the SDK.
        from openai import AsyncOpenAI

        assert config.openai_api_key is not None
        self._client = AsyncOpenAI(
            api_key=config.openai_api_key.get_secret_value(),
            timeout=config.openai_timeout_seconds,
            max_retries=1,
        )
        self._model = config.openai_model
        self._reasoning_effort = config.openai_reasoning_effort

    async def generate_structured(
        self,
        *,
        instructions: str,
        input: str,
        schema: type[T],
        web_search: bool = False,
        search_context_size: str = "medium",
    ) -> StructuredResult[T]:
        import openai

        kwargs: dict = {}
        if web_search:
            kwargs["tools"] = [
                {"type": "web_search", "search_context_size": search_context_size}
            ]
        if self._reasoning_effort:
            kwargs["reasoning"] = {"effort": self._reasoning_effort}

        started = time.perf_counter()
        try:
            response = await self._client.responses.parse(
                model=self._model,
                instructions=instructions,
                input=input,
                text_format=schema,
                store=False,
                **kwargs,
            )
        except openai.APITimeoutError as exc:
            raise GenerationError("provider", "The AI provider timed out.") from exc
        except openai.RateLimitError as exc:
            raise GenerationError(
                "provider", "The AI provider is rate limiting requests."
            ) from exc
        except openai.APIConnectionError as exc:
            raise GenerationError(
                "provider", "Could not reach the AI provider."
            ) from exc
        except openai.APIStatusError as exc:
            # Never forward the raw provider message: it may echo request data.
            raise GenerationError(
                "provider", f"The AI provider returned status {exc.status_code}."
            ) from exc
        except ValidationError as exc:
            raise GenerationError("schema", _summarize_validation_error(exc)) from exc
        duration_ms = int((time.perf_counter() - started) * 1000)

        parsed = response.output_parsed
        if parsed is None:
            refusal = _find_refusal(response)
            if refusal:
                raise GenerationError("refusal", "The model declined the request.")
            raise GenerationError(
                "schema", "The model did not return a structured result."
            )

        usage = TokenUsage()
        if response.usage is not None:
            usage = TokenUsage(
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                reasoning_tokens=response.usage.output_tokens_details.reasoning_tokens,
                total_tokens=response.usage.total_tokens,
            )

        return StructuredResult(
            parsed=parsed,
            usage=usage,
            model=response.model or self._model,
            duration_ms=duration_ms,
            citations=_collect_citations(response),
        )


def _find_refusal(response) -> str | None:  # noqa: ANN001 - provider type
    for item in response.output:
        if getattr(item, "type", None) != "message":
            continue
        for content in item.content:
            if getattr(content, "type", None) == "refusal":
                return getattr(content, "refusal", "") or "refused"
    return None


def _collect_citations(response) -> list[Citation]:  # noqa: ANN001
    citations: list[Citation] = []
    seen: set[str] = set()
    for item in response.output:
        if getattr(item, "type", None) != "message":
            continue
        for content in item.content:
            for annotation in getattr(content, "annotations", None) or []:
                if getattr(annotation, "type", None) != "url_citation":
                    continue
                url = annotation.url
                if url in seen:
                    continue
                seen.add(url)
                citations.append(Citation(url=url, title=annotation.title))
    return citations


def _summarize_validation_error(exc: ValidationError) -> str:
    issues = [
        ".".join(str(p) for p in err.get("loc", ())) + ": " + str(err.get("msg"))
        for err in exc.errors()[:5]
    ]
    return "Structured output did not match the schema: " + "; ".join(issues)


@lru_cache(maxsize=1)
def _default_client() -> AIClient:
    if settings.openai_api_key is None:
        logger.warning("OPENAI_API_KEY is not configured; AI routes will fail safely.")
        return UnconfiguredAIClient()
    return OpenAIClient(settings)


def get_ai_client() -> AIClient:
    return _default_client()
