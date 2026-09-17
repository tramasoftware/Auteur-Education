"""Programmatic validators for build outputs. They return stable codes.

They never trust model-reported verification (BR-SRC-007): a URL only counts as
retrieved when it appears among the search citations of the same call.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import get_args
from urllib.parse import urlsplit, urlunsplit

from auteur_api.ai.client import StructuredResult
from auteur_api.modules.generation.schemas import (
    KnowledgeCheckOutput,
    LessonDraftOutput,
    LessonReviewOutput,
    LessonWriteOutput,
    ModuleSynthesisOutput,
    QaCheckName,
    ResearchOutput,
)

MIN_SUBSTANTIVE_SOURCES = 2  # BR-SRC-003
SUBSTANTIVE_ROLES = {"primary_support", "corroboration", "counterpoint"}
SUBSTANTIVE_SUPPORT = {"strong", "moderate"}

PLACEHOLDER = re.compile(
    r"(\bTODO\b|\bTBD\b|lorem ipsum|\[insert|\[citation needed\]|\[placeholder|"
    r"\bas an ai\b|\.\.\.\s*$)",
    re.IGNORECASE | re.MULTILINE,
)

ALL_CHECKS: set[str] = set(get_args(QaCheckName))


def normalize_url(url: str) -> str:
    parts = urlsplit(url.strip())
    host = parts.netloc.lower().removeprefix("www.")
    path = parts.path.rstrip("/")
    return urlunsplit((parts.scheme.lower(), host, path, parts.query, ""))


def is_http_url(url: str) -> bool:
    parts = urlsplit(url.strip())
    return parts.scheme in ("http", "https") and bool(parts.netloc)


def word_count(draft: LessonDraftOutput) -> int:
    return sum(len(section.body.split()) for section in draft.sections)


def make_research_validator(
    *, require_retrieved: bool
) -> Callable[[StructuredResult[ResearchOutput]], list[str]]:
    def validate(result: StructuredResult[ResearchOutput]) -> list[str]:
        out = result.parsed
        codes: list[str] = []
        cited = {normalize_url(c.url) for c in result.citations}
        refs = [e.ref.strip() for e in out.evidence]
        if len(set(refs)) != len(refs) or any(not r for r in refs):
            codes.append("evidence_ref_invalid")
        urls: set[str] = set()
        substantive = 0
        for item in out.evidence:
            if not is_http_url(item.url):
                codes.append("evidence_url_invalid")
                continue
            if not item.title.strip() or not item.relevant_excerpt.strip():
                codes.append("evidence_metadata_missing")
            norm = normalize_url(item.url)
            if norm in urls:
                codes.append("evidence_url_duplicated")
            urls.add(norm)
            retrieved = (not require_retrieved) or norm in cited
            if (
                retrieved
                and item.role in SUBSTANTIVE_ROLES
                and item.support_level in SUBSTANTIVE_SUPPORT
            ):
                substantive += 1
        if substantive < MIN_SUBSTANTIVE_SOURCES and not out.blocking_conditions:
            codes.append("evidence_insufficient")  # AI-QA-05 / BR-GEN-009
        return sorted(set(codes))

    return validate


def make_write_validator(
    evidence_refs: set[str],
) -> Callable[[StructuredResult[LessonWriteOutput]], list[str]]:
    def validate(result: StructuredResult[LessonWriteOutput]) -> list[str]:
        out = result.parsed
        codes: list[str] = []
        used = [r.strip() for r in out.draft.sources_used_refs]
        if any(r not in evidence_refs for r in used):
            codes.append("sources_used_unknown_ref")  # BR-SRC-008
        if len(set(used)) < MIN_SUBSTANTIVE_SOURCES:
            codes.append("sources_used_insufficient")  # BR-SRC-003
        if any(r not in evidence_refs for r in out.spec.assigned_evidence_refs):
            codes.append("spec_assigned_refs_unknown")
        if out.spec.main_claims and not out.spec.assigned_evidence_refs:
            codes.append("spec_claims_without_evidence")  # AI-QA-06
        if not out.draft.sections:
            codes.append("lesson_empty")
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


def make_knowledge_check_validator(
    lesson_titles: set[str],
) -> Callable[[StructuredResult[KnowledgeCheckOutput]], list[str]]:
    lowered = {t.strip().lower() for t in lesson_titles}

    def validate(result: StructuredResult[KnowledgeCheckOutput]) -> list[str]:
        out = result.parsed
        codes: list[str] = []
        if len(out.questions) != 5:
            codes.append("knowledge_check_question_count")  # BR-KCK
        questions = {q.question.strip().lower() for q in out.questions}
        if len(questions) != len(out.questions):
            codes.append("knowledge_check_questions_duplicated")
        for q in out.questions:
            if len(q.options) != 4:
                codes.append("knowledge_check_option_count")
            if sum(1 for o in q.options if o.is_correct) != 1:
                codes.append("knowledge_check_correct_count")
            texts = {o.text.strip().lower() for o in q.options}
            if len(texts) != len(q.options):
                codes.append("knowledge_check_options_duplicated")
            if not q.related_lesson_titles or any(
                t.strip().lower() not in lowered for t in q.related_lesson_titles
            ):
                codes.append("knowledge_check_unrelated_to_lessons")
        return sorted(set(codes))

    return validate
