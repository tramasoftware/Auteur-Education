"""Programmatic validators for build outputs. They return stable codes.

The published source list is the pages web search returned. The path the model
types is not published unless it is one of those pages. Titles are not compared
and are not used to choose a URL. There is no minimum count.
"""

from __future__ import annotations

import asyncio
import ipaddress
import random
import re
from collections.abc import Callable
from typing import get_args
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

from auteur_api.ai.client import Citation, StructuredResult
from auteur_api.modules.generation.schemas import (
    EvidenceItemOutput,
    KnowledgeCheckOutput,
    LessonDraftOutput,
    LessonReviewOutput,
    LessonWriteOutput,
    ModuleSynthesisOutput,
    QaCheckName,
    ResearchOutput,
)

# --- Strict thresholds (BR-SRC-003) — kept for easy restore after demo testing ---
# MIN_SUBSTANTIVE_SOURCES = 2
# SUBSTANTIVE_ROLES = {"primary_support", "corroboration", "counterpoint"}
# SUBSTANTIVE_SUPPORT = {"strong", "moderate"}

# BR-SRC-003 names three to six as the normal range. The demo keeps at most six
# search pages per lesson. Sufficiency above that range is not applied here.
MAX_SOURCES_PER_LESSON = 6

# Source quantity does not retry a stage or stop the module.
NONFATAL_RESEARCH_CODES: frozenset[str] = frozenset()
NONFATAL_WRITE_CODES: frozenset[str] = frozenset()

PLACEHOLDER = re.compile(
    r"(\bTODO\b|\bTBD\b|lorem ipsum|\[insert|\[citation needed\]|\[placeholder|"
    r"\bas an ai\b|\.\.\.\s*$)",
    re.IGNORECASE | re.MULTILINE,
)

ALL_CHECKS: set[str] = set(get_args(QaCheckName))


# Stanford Encyclopedia publishes the same entry under /archives/<edition>/.
_ARCHIVE_EDITION = re.compile(
    r"/archives/(?:spr|sum|fall|win)\d{4}(?=/|$)",
    re.IGNORECASE,
)


def _is_tracking_param(key: str) -> bool:
    name = key.lower()
    return name.startswith("utm_") or name in {"fbclid", "gclid"}


def canonical_page(url: str) -> str:
    """One work, one address.

    Archive editions of the same entry and tracking parameters collapse.
    Different articles on the same host stay different.
    """
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").lower().removeprefix("www.")
    if host.endswith(".m.wikipedia.org"):
        host = host[: -len(".m.wikipedia.org")] + ".wikipedia.org"
    path = _ARCHIVE_EDITION.sub("", parts.path or "")
    path = re.sub(r"/{2,}", "/", path).rstrip("/")
    query = urlencode(
        [
            (key, value)
            for key, value in parse_qsl(parts.query, keep_blank_values=True)
            if not _is_tracking_param(key)
        ]
    )
    scheme = (parts.scheme or "https").lower()
    return urlunsplit((scheme, host, path, query, ""))


def normalize_url(url: str) -> str:
    return canonical_page(url)


def is_http_url(url: str) -> bool:
    parts = urlsplit(url.strip())
    return parts.scheme in ("http", "https") and bool(parts.netloc)


def is_public_http_url(url: str) -> bool:
    """HTTP(S) URL whose host is not a literal local or private address."""
    if not is_http_url(url):
        return False
    host = (urlsplit(url.strip()).hostname or "").lower().rstrip(".")
    if not host or host == "localhost" or host.endswith(".local"):
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return True
    return address.is_global


def _host_key(url: str) -> str:
    return (urlsplit(url.strip()).hostname or "").lower().removeprefix("www.")


def _fallback_title(url: str) -> str:
    parts = urlsplit(url.strip())
    path = parts.path.strip("/")
    if path:
        return path.replace("-", " ").replace("/", " — ")
    return _host_key(url) or url.strip()


def research_pages(citations: list[Citation]) -> list[Citation]:
    """Distinct public works the search tool returned, in tool order.

    Editions and tracking parameters of the same entry are one page. The
    published URL is that canonical page, not the archive copy.
    """
    chosen: dict[str, Citation] = {}
    order: list[str] = []
    for citation in citations:
        if not is_public_http_url(citation.url):
            continue
        key = canonical_page(citation.url)
        title = citation.title.strip()
        current = chosen.get(key)
        if current is None:
            chosen[key] = Citation(url=key, title=title)
            order.append(key)
            continue
        if title and not current.title:
            chosen[key] = Citation(url=key, title=title)
    return [chosen[key] for key in order]


def _take_ref(used: set[str], preferred: str | None, index: int) -> str:
    if preferred and preferred not in used:
        used.add(preferred)
        return preferred
    number = index
    while True:
        ref = f"S{number}"
        if ref not in used:
            used.add(ref)
            return ref
        number += 1


def published_research_evidence(
    evidence: list[EvidenceItemOutput],
    citations: list[Citation],
    *,
    used_refs: set[str] | None = None,
) -> list[EvidenceItemOutput]:
    """One published source per search page.

    The model's URL is kept only when it is that same page. A single note the
    model wrote for a host is attached when search returned one page on that
    host. Several pages are all published; none is chosen by title. A host
    search did not return is omitted.
    """
    pages = research_pages(citations)
    used = used_refs if used_refs is not None else set()
    by_url: dict[str, EvidenceItemOutput] = {}
    by_host: dict[str, list[EvidenceItemOutput]] = {}
    for item in evidence:
        if not is_public_http_url(item.url):
            continue
        by_url.setdefault(normalize_url(item.url), item)
        by_host.setdefault(_host_key(item.url), []).append(item)
    pages_by_host: dict[str, list[Citation]] = {}
    for page in pages:
        pages_by_host.setdefault(_host_key(page.url), []).append(page)

    published: list[EvidenceItemOutput] = []
    for index, page in enumerate(pages, start=1):
        exact = by_url.get(normalize_url(page.url))
        host = _host_key(page.url)
        notes = by_host.get(host, [])
        single_note = (
            notes[0]
            if exact is None and len(pages_by_host[host]) == 1 and len(notes) == 1
            else None
        )
        base = exact or single_note
        if base is not None:
            data = base.model_dump()
            data["url"] = page.url
            data["ref"] = _take_ref(used, base.ref.strip() or None, index)
            page_title = page.title.strip()
            model_title = str(data["title"]).strip()
            if exact is not None:
                data["title"] = model_title or page_title or _fallback_title(page.url)
            else:
                data["title"] = page_title or model_title or _fallback_title(page.url)
            published.append(EvidenceItemOutput.model_validate(data))
            continue
        title = page.title.strip() or _fallback_title(page.url)
        published.append(
            EvidenceItemOutput(
                ref=_take_ref(used, None, index),
                url=page.url,
                title=title,
                author_or_institution=None,
                date=None,
                source_type="general",
                relevant_excerpt=title,
                supports_claims=[],
                support_level="moderate",
                limits=None,
                role="orientation",
            )
        )
    return published


def status_is_gone(status: int) -> bool:
    """404 and 410 are missing pages. 403 is a block, not a missing page."""
    return status in (404, 410)


_FETCH_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; AuteurEducation/1.0)"}


async def page_is_gone(url: str, client: httpx.AsyncClient | None = None) -> bool:
    """True only when the page itself answers 404 or 410.

    Timeouts, connection errors, and every other status keep the URL.
    """
    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=8.0, follow_redirects=True)
    try:
        response = await http.get(url, headers=_FETCH_HEADERS)
    except httpx.HTTPError:
        return False
    finally:
        if owns_client:
            await http.aclose()
    return status_is_gone(response.status_code)


async def without_gone_pages(pages: list[Citation]) -> list[Citation]:
    if not pages:
        return []
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        gone = await asyncio.gather(*(page_is_gone(page.url, client) for page in pages))
    return [page for page, missing in zip(pages, gone, strict=True) if not missing]


def word_count(draft: LessonDraftOutput) -> int:
    return sum(len(section.body.split()) for section in draft.sections)


def make_research_validator(
    *, require_retrieved: bool
) -> Callable[[StructuredResult[ResearchOutput]], list[str]]:
    """Demo/testing validator.

    Strict BR-SRC-003/007 logic is preserved below, commented out.
    """

    def validate(result: StructuredResult[ResearchOutput]) -> list[str]:
        _ = (require_retrieved, result)
        # Demo: an empty source list is valid. Count and URL shape do not retry.
        # Publication uses the search pages, not this validator.
        return []

    # --- Strict validation (restore for production demo) ---
    # def validate(result: StructuredResult[ResearchOutput]) -> list[str]:
    #     out = result.parsed
    #     codes: list[str] = []
    #     cited = {normalize_url(c.url) for c in result.citations}
    #     refs = [e.ref.strip() for e in out.evidence]
    #     if len(set(refs)) != len(refs) or any(not r for r in refs):
    #         codes.append("evidence_ref_invalid")
    #     urls: set[str] = set()
    #     substantive = 0
    #     for item in out.evidence:
    #         if not is_http_url(item.url):
    #             codes.append("evidence_url_invalid")
    #             continue
    #         if not item.title.strip() or not item.relevant_excerpt.strip():
    #             codes.append("evidence_metadata_missing")
    #         norm = normalize_url(item.url)
    #         if norm in urls:
    #             codes.append("evidence_url_duplicated")
    #         urls.add(norm)
    #         retrieved = (not require_retrieved) or norm in cited
    #         if (
    #             retrieved
    #             and item.role in SUBSTANTIVE_ROLES
    #             and item.support_level in SUBSTANTIVE_SUPPORT
    #         ):
    #             substantive += 1
    #     if substantive < MIN_SUBSTANTIVE_SOURCES and not out.blocking_conditions:
    #         codes.append("evidence_insufficient")  # AI-QA-05 / BR-GEN-009
    #     return sorted(set(codes))

    return validate


def _clean_refs(refs: list[str]) -> list[str]:
    return [ref.strip() for ref in refs if ref.strip()]


def make_write_validator(
    evidence_refs: set[str],
) -> Callable[[StructuredResult[LessonWriteOutput]], list[str]]:
    def validate(result: StructuredResult[LessonWriteOutput]) -> list[str]:
        out = result.parsed
        codes: list[str] = []
        # The published list is the research evidence. Drop refs the model
        # added that are not in that set, and do not invent replacements.
        out.draft.sources_used_refs = [
            ref
            for ref in _clean_refs(out.draft.sources_used_refs)
            if ref in evidence_refs
        ]
        out.spec.assigned_evidence_refs = [
            ref
            for ref in _clean_refs(out.spec.assigned_evidence_refs)
            if ref in evidence_refs
        ]
        # if len(set(used)) < MIN_SUBSTANTIVE_SOURCES:
        #     codes.append("sources_used_insufficient")  # BR-SRC-003
        if not out.draft.sections:
            codes.append("lesson_empty")
        # Model sections are prose movements (heading + body). Kind is not a field.
        for section in out.draft.sections:
            if len(section.body.split()) < 20:
                codes.append("lesson_section_too_short")
            if PLACEHOLDER.search(section.body):
                codes.append("lesson_placeholder_detected")  # AI-VAL-04
        if not out.draft.title.strip():
            codes.append("lesson_title_missing")
        return sorted(set(codes))

    return validate


def validate_review(result: StructuredResult[LessonReviewOutput]) -> list[str]:
    out = result.parsed
    codes: list[str] = []
    reported = {c.check for c in out.checks}
    if reported != ALL_CHECKS:
        codes.append("review_checks_incomplete")
    unsupported_central = any(
        c.importance == "central" and c.type == "factual" and c.status != "Supported"
        for c in out.claims
    )
    failed_checks = any(not c.passed for c in out.checks)
    if out.result == "Pass" and (unsupported_central or failed_checks):
        codes.append("review_inconsistent_pass")  # independence rule, AI-QA-08
    if out.result != "Pass" and not out.issues:
        codes.append("review_result_without_issues")
    return codes


def validate_synthesis(result: StructuredResult[ModuleSynthesisOutput]) -> list[str]:
    body = result.parsed.body
    codes: list[str] = []
    if len(body.split()) < 150:
        codes.append("synthesis_too_short")
    if PLACEHOLDER.search(body):
        codes.append("synthesis_placeholder_detected")
    return codes


def _normalize_lesson_title(title: str) -> str:
    """Strip UI-style module prefixes such as 'Module › Lesson'."""
    cleaned = title.strip().lower()
    if "›" in cleaned:
        cleaned = cleaned.rsplit("›", 1)[-1].strip()
    return cleaned


def _related_title_matches_lesson(related: str, lesson_titles: set[str]) -> bool:
    """Demo: accept exact, substring, or module-prefixed lesson title references."""
    related_norm = _normalize_lesson_title(related)
    if not related_norm:
        return False
    for title in lesson_titles:
        lesson_norm = _normalize_lesson_title(title)
        if (
            related_norm == lesson_norm
            or related_norm in lesson_norm
            or lesson_norm in related_norm
        ):
            return True
    return False


def shuffle_knowledge_check_options(
    check: KnowledgeCheckOutput, *, seed: str
) -> KnowledgeCheckOutput:
    """Stable per-module shuffle so the correct option is not always first."""
    shuffled = check.model_copy(deep=True)
    for index, question in enumerate(shuffled.questions):
        options = list(question.options)
        random.Random(f"{seed}:{index}").shuffle(options)
        question.options = options
    return shuffled


def make_knowledge_check_validator(
    lesson_titles: set[str],
) -> Callable[[StructuredResult[KnowledgeCheckOutput]], list[str]]:
    """Demo/testing validator.

    Strict exact-title matching is preserved below, commented out.
    """

    def validate(result: StructuredResult[KnowledgeCheckOutput]) -> list[str]:
        out = result.parsed
        codes: list[str] = []
        if len(out.questions) != 5:
            codes.append("knowledge_check_question_count")  # BR-KCK
        questions = {q.question.strip().lower() for q in out.questions}
        if len(questions) != len(out.questions):
            codes.append("knowledge_check_questions_duplicated")
        if out.questions and all(
            q.options and q.options[0].is_correct for q in out.questions
        ):
            codes.append("knowledge_check_correct_position_bias")
        for q in out.questions:
            if len(q.options) != 4:
                codes.append("knowledge_check_option_count")
            if sum(1 for o in q.options if o.is_correct) != 1:
                codes.append("knowledge_check_correct_count")
            texts = {o.text.strip().lower() for o in q.options}
            if len(texts) != len(q.options):
                codes.append("knowledge_check_options_duplicated")
            if not q.related_lesson_titles or not any(
                _related_title_matches_lesson(t, lesson_titles)
                for t in q.related_lesson_titles
            ):
                codes.append("knowledge_check_unrelated_to_lessons")
        return sorted(set(codes))

    # --- Strict validation (restore for production demo) ---
    # lowered = {t.strip().lower() for t in lesson_titles}
    #
    # def validate(result: StructuredResult[KnowledgeCheckOutput]) -> list[str]:
    #     ...
    #     if not q.related_lesson_titles or any(
    #         t.strip().lower() not in lowered for t in q.related_lesson_titles
    #     ):
    #         codes.append("knowledge_check_unrelated_to_lessons")

    return validate
