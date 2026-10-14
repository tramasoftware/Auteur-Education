"""Isolated AI provider integration (DEC-001, DEC-002).

Everything provider-specific lives here. The rest of the backend depends on the
`AIClient` protocol and `StructuredResult`, so the provider can be replaced or
faked in tests. Credentials come from Settings and never leave the server.
"""

from __future__ import annotations

import logging
import re
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
        # A structured response does not carry the search citations on this
        # model. The pages are collected from a plain search call, then the
        # schema call writes the evidence against that list (DEC-002).
        started = time.perf_counter()
        citations: list[Citation] = []
        search_usage = TokenUsage()
        structured_input = input
        if web_search:
            # Two searches raise the chance of pages. A miss or a provider
            # error on the last try does not stop the lesson (DEC-002).
            for attempt in range(1, 3):
                instructions = (
                    _SEARCH_INSTRUCTIONS if attempt == 1 else _SEARCH_RETRY
                )
                try:
                    search_response = await self._request(
                        lambda instructions=instructions: (
                            self._client.responses.create(
                                model=self._model,
                                instructions=instructions,
                                input=input,
                                tools=[
                                    {
                                        "type": "web_search",
                                        "search_context_size": search_context_size,
                                    }
                                ],
                                tool_choice={"type": "web_search"},
                                include=["web_search_call.action.sources"],
                                store=False,
                                **self._reasoning_kwargs(),
                            )
                        )
                    )
                except GenerationError as exc:
                    logger.warning(
                        "web_search_failed attempt=%s kind=%s",
                        attempt,
                        exc.kind,
                    )
                    citations = []
                    continue
                search_usage = _add_usage(search_usage, _read_usage(search_response))
                citations = _collect_citations(search_response)
                logger.info(
                    "web_search_citations attempt=%s count=%s",
                    attempt,
                    len(citations),
                )
                if citations:
                    break
            # Collapse editions before the writer sees the list, and before
            # the lesson cap of six, so copies do not fill the slots.
            from auteur_api.modules.generation.validators import research_pages

            citations = research_pages(citations)
            logger.info("web_search_works count=%s", len(citations))
            structured_input = f"{input}\n\n{_search_pages_block(citations)}"

        try:
            response = await self._request(
                lambda: self._client.responses.parse(
                    model=self._model,
                    instructions=instructions,
                    input=structured_input,
                    text_format=schema,
                    store=False,
                    **self._reasoning_kwargs(),
                )
            )
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

        usage = _add_usage(_read_usage(response), search_usage)

        return StructuredResult(
            parsed=parsed,
            usage=usage,
            model=response.model or self._model,
            duration_ms=duration_ms,
            citations=citations,
        )

    def _reasoning_kwargs(self) -> dict:
        if not self._reasoning_effort:
            return {}
        return {"reasoning": {"effort": self._reasoning_effort}}

    async def _request(self, call):  # noqa: ANN001
        import openai

        try:
            return await call()
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


_SEARCH_INSTRUCTIONS = (
    "Use the web search tool on the lesson in the input. Open relevant pages. "
    "Each page must be a different work: do not list another edition, archive "
    "copy, or mirror of the same entry. Copy each url exactly as the tool "
    "returned it. Do not invent or repair a path."
)

_SEARCH_RETRY = (
    "The previous reply included no pages from the web search tool. "
    "Call the web search tool now and open relevant pages. Each page must be "
    "a different work, not another edition or archive of the same entry. "
    "Copy each url exactly as the tool returned it."
)


def _search_pages_block(citations: list[Citation]) -> str:
    """The only URLs the structured research step is allowed to cite."""
    if not citations:
        return (
            "SEARCH PAGES: none. This search returned no pages. "
            "Leave the evidence list empty."
        )
    lines = [
        "SEARCH PAGES: these are the only pages this search returned. "
        "Copy each url exactly into the evidence set. Do not add or repair a url."
    ]
    for citation in citations:
        title = citation.title.strip() or "untitled"
        lines.append(f"- title: {title}")
        lines.append(f"  url: {citation.url}")
    return "\n".join(lines)


def _read_usage(response) -> TokenUsage:  # noqa: ANN001
    usage = getattr(response, "usage", None)
    if usage is None:
        return TokenUsage()
    details = getattr(usage, "output_tokens_details", None)
    reasoning = getattr(details, "reasoning_tokens", 0) if details is not None else 0
    return TokenUsage(
        input_tokens=usage.input_tokens or 0,
        output_tokens=usage.output_tokens or 0,
        reasoning_tokens=reasoning or 0,
        total_tokens=usage.total_tokens or 0,
    )


def _add_usage(left: TokenUsage, right: TokenUsage) -> TokenUsage:
    return TokenUsage(
        input_tokens=left.input_tokens + right.input_tokens,
        output_tokens=left.output_tokens + right.output_tokens,
        reasoning_tokens=left.reasoning_tokens + right.reasoning_tokens,
        total_tokens=left.total_tokens + right.total_tokens,
    )


def _find_refusal(response) -> str | None:  # noqa: ANN001 - provider type
    for item in response.output:
        if getattr(item, "type", None) != "message":
            continue
        for content in item.content:
            if getattr(content, "type", None) == "refusal":
                return getattr(content, "refusal", "") or "refused"
    return None


def _item_url(item) -> str:  # noqa: ANN001
    if isinstance(item, dict):
        return str(item.get("url") or "")
    return str(getattr(item, "url", "") or "")


def _item_title(item) -> str:  # noqa: ANN001
    if isinstance(item, dict):
        return str(item.get("title") or "")
    return str(getattr(item, "title", "") or "")


def _remember_citation(
    found: dict[str, Citation], order: list[str], url: str, title: str
) -> None:
    url = url.strip()
    if not url:
        return
    title = title.strip()
    current = found.get(url)
    if current is None:
        found[url] = Citation(url=url, title=title)
        order.append(url)
        return
    if title and not current.title:
        found[url] = Citation(url=current.url, title=title)


# The provider appends this to URLs it actually opened. A bare slug the model
# types does not carry it.
_TOOL_LINK = re.compile(r"https://[^\s<>\"']*utm_source=openai[^\s<>\"']*")


def _collect_citations(response) -> list[Citation]:  # noqa: ANN001
    """URLs the search tool actually returned.

    Annotations, opened pages, and `web_search_call.action.sources`. A URL is
    also kept when the tool marked it with utm_source=openai. The string the
    model writes into a schema field is not a citation.
    """
    found: dict[str, Citation] = {}
    order: list[str] = []
    for item in getattr(response, "output", None) or []:
        item_type = getattr(item, "type", None)
        if item_type == "message":
            for content in getattr(item, "content", None) or []:
                for annotation in getattr(content, "annotations", None) or []:
                    if getattr(annotation, "type", None) != "url_citation":
                        continue
                    _remember_citation(
                        found,
                        order,
                        _item_url(annotation),
                        _item_title(annotation),
                    )
                text = getattr(content, "text", "") or ""
                for match in _TOOL_LINK.findall(text):
                    _remember_citation(found, order, match.rstrip(".,)"), "")
            continue
        if item_type != "web_search_call":
            continue
        action = getattr(item, "action", None)
        if action is None:
            continue
        action_type = getattr(action, "type", None)
        if isinstance(action, dict):
            action_type = action.get("type")
        if action_type == "search":
            sources = (
                action.get("sources")
                if isinstance(action, dict)
                else getattr(action, "sources", None)
            )
            for source in sources or []:
                _remember_citation(found, order, _item_url(source), _item_title(source))
        elif action_type in ("open_page", "find_in_page"):
            _remember_citation(found, order, _item_url(action), "")
    return [found[url] for url in order]


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
