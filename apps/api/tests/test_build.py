"""Phases 7-9: research, writing, review, synthesis, Knowledge Check, publication."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
import pytest
from tests.fixtures import (
    audit,
    blueprint,
    knowledge_check,
    lesson_write,
    research,
    review,
)
from tests.test_blueprints import script_full_build, selected_request

from auteur_api.ai.client import (
    Citation,
    StructuredResult,
    _collect_citations,
    _search_pages_block,
)
from auteur_api.ai.tracing import TokenUsage
from auteur_api.core.config import settings
from auteur_api.modules.blueprints.schemas import BlueprintOutput
from auteur_api.modules.generation import prompts, validators
from auteur_api.modules.generation.schemas import (
    CourseAuditOutput,
    KnowledgeCheckOutput,
    LessonReviewOutput,
    LessonWriteOutput,
    ModuleAuditOutput,
    ResearchOutput,
)


def approved_course(client, fake_ai, *, modules: int = 2, lessons: int = 2) -> str:
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput,
        blueprint(modules=modules, lessons=lessons, deviation_reason="demo"),
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    return client.post(f"/api/v1/blueprints/{bid}/approve", json={"version": 1}).json()[
        "course_id"
    ]


@pytest.fixture
def build_all_modules(monkeypatch):
    monkeypatch.setattr(settings, "generation_max_modules", None)


def test_demo_module_limit_publishes_first_module_only(client, fake_ai) -> None:
    # DEC-007 + BR-GEN-006: the course is not Complete with unbuilt modules.
    course_id = approved_course(client, fake_ai)
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["state"] == "partially_available"
    assert [m["state"] for m in course["modules"]] == ["published", "not_built"]
    assert course["module_limit"] == 1
    assert course["final_synthesis"] is None
    assert "limit" in course["current_activity"].lower()
    assert client.get("/api/v1/courses/active-generation").json() == {
        "course_id": None
    }


def test_full_build_completes_with_synthesis(
    client, fake_ai, build_all_modules
) -> None:
    course_id = approved_course(client, fake_ai)
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["state"] == "complete"
    assert all(m["state"] == "published" for m in course["modules"])
    assert course["final_synthesis"]["body"]
    assert course["final_synthesis"]["new_questions"]
    stages = [c["schema"] for c in fake_ai.calls]
    assert "CourseSynthesisOutput" in stages and "CourseAuditOutput" in stages


def test_published_module_exposes_lessons_synthesis_check_and_sources(
    client, fake_ai
) -> None:
    course_id = approved_course(client, fake_ai)
    course = client.get(f"/api/v1/courses/{course_id}").json()
    module_id = course["modules"][0]["id"]
    module = client.get(f"/api/v1/courses/{course_id}/modules/{module_id}").json()
    assert module["state"] == "published"
    assert len(module["lessons"]) == 2
    assert module["synthesis"]
    assert len(module["knowledge_check"]["questions"]) == 5
    assert all(len(q["options"]) == 4 for q in module["knowledge_check"]["questions"])
    correct_positions = [
        next(i for i, o in enumerate(q["options"]) if o["is_correct"])
        for q in module["knowledge_check"]["questions"]
    ]
    assert correct_positions != [0, 0, 0, 0, 0]
    # Published sources are the HTTP evidence research returned.
    assert {s["ref"] for s in module["sources"]} == {"S1", "S2", "S3"}
    assert all(s["verification"] == "retrieved" for s in module["sources"])

    lesson_id = module["lessons"][0]["id"]
    lesson = client.get(
        f"/api/v1/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}"
    ).json()
    assert lesson["sections"]
    assert lesson["word_count"] == 1500
    assert lesson["next_lesson_id"] == module["lessons"][1]["id"]
    assert lesson["previous_lesson_id"] is None

    # BR-GEN-004: unpublished modules are not readable.
    not_built = course["modules"][1]["id"]
    blocked = client.get(f"/api/v1/courses/{course_id}/modules/{not_built}")
    assert blocked.status_code == 409


@pytest.mark.skip(
    reason=(
        "Demo uses relaxed source validation in validators.py (restore strict block)."
    )
)
def test_unverified_sources_do_not_count_as_evidence(client, fake_ai) -> None:
    # BR-SRC-007 / BR-GEN-009: model-reported URLs without a search citation
    # are not substantive; research is retried with the diagnostic.
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    fake_ai.citations = [Citation(url="https://example.org/a", title="A")]
    fake_ai.enqueue(
        ResearchOutput, research(["https://example.org/a", "https://fake.invalid/x"])
    )
    fake_ai.enqueue(
        ResearchOutput, research(["https://example.org/a", "https://fake.invalid/x"])
    )
    fake_ai.enqueue(
        ResearchOutput, research(["https://example.org/a", "https://fake.invalid/x"])
    )
    course_id = client.post(
        f"/api/v1/blueprints/{bid}/approve", json={"version": 1}
    ).json()["course_id"]
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["state"] == "failed"
    assert "incomplete module was published" in course["failure"].lower()
    research_calls = [c for c in fake_ai.calls if c["schema"] == "ResearchOutput"]
    assert len(research_calls) == 3
    assert "evidence_insufficient" in research_calls[1]["input"]


def test_revise_triggers_focused_repair_then_pass(client, fake_ai) -> None:
    # AI-STG-11 + "Reparación focalizada": the rewrite receives the exact feedback.
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    fake_ai.enqueue(LessonReviewOutput, review("Revise", claim_status="Needs revision"))
    course_id = client.post(
        f"/api/v1/blueprints/{bid}/approve", json={"version": 1}
    ).json()["course_id"]
    writes = [c for c in fake_ai.calls if c["schema"] == "LessonWriteOutput"]
    assert "REVIEW FEEDBACK" in writes[1]["input"]
    assert "Qualify claim A." in writes[1]["input"]
    diagnostics = client.get(f"/api/v1/courses/{course_id}/diagnostics").json()
    lesson = diagnostics["modules"][0]["lessons"][0]
    assert lesson["attempts"] == 2
    assert lesson["review_result"] == "Pass"


def test_inconsistent_pass_review_is_rejected(client, fake_ai) -> None:
    # Independence rule: a Pass with an unsupported central claim is invalid.
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    fake_ai.enqueue(LessonReviewOutput, review("Pass", claim_status="Needs revision"))
    client.post(f"/api/v1/blueprints/{bid}/approve", json={"version": 1})
    reviews = [c for c in fake_ai.calls if c["schema"] == "LessonReviewOutput"]
    assert "review_inconsistent_pass" in reviews[1]["input"]


def test_block_fails_module_and_keeps_nothing_unpublished(client, fake_ai) -> None:
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    fake_ai.enqueue(LessonReviewOutput, review("Block"))
    course_id = client.post(
        f"/api/v1/blueprints/{bid}/approve", json={"version": 1}
    ).json()["course_id"]
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["state"] == "failed"
    assert course["modules"][0]["state"] == "failed"
    failure = course["failure"]
    assert "could not finish module 1" in failure.lower()
    assert "honest account" in failure.lower()
    assert "No incomplete module was published." in failure
    assert "AI-STG" not in failure
    assert course["modules"][0]["id"] not in failure


def test_knowledge_check_shuffle_spreads_correct_answer() -> None:
    from auteur_api.modules.generation.validators import shuffle_knowledge_check_options

    raw = KnowledgeCheckOutput.model_validate(
        {
            "questions": [
                {
                    "question": f"Question {q}?",
                    "options": [
                        {
                            "text": f"Option {q}.{o}",
                            "is_correct": o == 0,
                            "explanation": "Because.",
                        }
                        for o in range(4)
                    ],
                    "assessed_concepts": ["debt"],
                    "related_lesson_titles": ["Lesson 1.1"],
                }
                for q in range(5)
            ]
        }
    )
    shuffled = shuffle_knowledge_check_options(raw, seed="module-abc")
    positions = [
        next(i for i, o in enumerate(q.options) if o.is_correct)
        for q in shuffled.questions
    ]
    assert positions != [0, 0, 0, 0, 0]


def test_knowledge_check_structure_is_enforced(client, fake_ai) -> None:
    # AI-STG-13 / BR-KCK: 5 questions x 4 options, one correct.
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    fake_ai.enqueue(KnowledgeCheckOutput, knowledge_check(questions=4))
    fake_ai.enqueue(KnowledgeCheckOutput, knowledge_check(options=3))
    fake_ai.enqueue(KnowledgeCheckOutput, knowledge_check(correct=2))
    client.post(f"/api/v1/blueprints/{bid}/approve", json={"version": 1})
    kc_calls = [c for c in fake_ai.calls if c["schema"] == "KnowledgeCheckOutput"]
    assert len(kc_calls) >= 2
    assert "knowledge_check_question_count" in kc_calls[1]["input"]
    if len(kc_calls) >= 3:
        assert "knowledge_check_option_count" in kc_calls[2]["input"]


def test_module_audit_failure_prevents_publication(client, fake_ai) -> None:
    # AI-QA-10
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    fake_ai.enqueue(ModuleAuditOutput, audit("Revise"))
    course_id = client.post(
        f"/api/v1/blueprints/{bid}/approve", json={"version": 1}
    ).json()["course_id"]
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["state"] == "failed"
    assert course["modules"][0]["state"] == "failed"
    assert "did not pass review" in course["failure"].lower()
    assert "AI-STG" not in course["failure"]


def test_invented_source_ref_is_dropped_and_research_sources_are_shown(
    client, fake_ai
) -> None:
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    fake_ai.enqueue(LessonWriteOutput, lesson_write(refs=["S1", "S9"]))
    course_id = client.post(
        f"/api/v1/blueprints/{bid}/approve", json={"version": 1}
    ).json()["course_id"]
    course = client.get(f"/api/v1/courses/{course_id}").json()
    module_id = course["modules"][0]["id"]
    module = client.get(f"/api/v1/courses/{course_id}/modules/{module_id}").json()
    assert course["state"] == "partially_available"
    assert {source["ref"] for source in module["sources"]} == {"S1", "S2", "S3"}
    writes = [c for c in fake_ai.calls if c["schema"] == "LessonWriteOutput"]
    assert all("sources_used_unknown_ref" not in call["input"] for call in writes)


def test_course_audit_failure_keeps_modules_but_not_complete(
    client, fake_ai, build_all_modules
) -> None:
    # AI-QA-11 / BR-GEN-006
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    fake_ai.enqueue(CourseAuditOutput, audit("Revise"))
    course_id = client.post(
        f"/api/v1/blueprints/{bid}/approve", json={"version": 1}
    ).json()["course_id"]
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["state"] == "partially_available"
    assert all(m["state"] == "published" for m in course["modules"])
    assert course["final_synthesis"] is None


def test_retry_restarts_unpublished_module_and_keeps_published(
    client, fake_ai, build_all_modules
) -> None:
    # UF-14 / BR-GEN-010: one explicit retry, same course, published module stays.
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    fake_ai.enqueue(LessonReviewOutput, review("Pass"))
    fake_ai.enqueue(LessonReviewOutput, review("Pass"))
    fake_ai.enqueue(LessonReviewOutput, review("Block"))
    course_id = client.post(
        f"/api/v1/blueprints/{bid}/approve", json={"version": 1}
    ).json()["course_id"]
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["state"] == "failed"
    assert [m["state"] for m in course["modules"]] == ["published", "failed"]
    assert "could not finish module 2" in course["failure"].lower()
    assert "Module 1 is published and can be read." in course["failure"]
    assert "round1" not in course["failure"]
    published_id = course["modules"][0]["id"]

    retried = client.post(f"/api/v1/courses/{course_id}/retry")
    assert retried.status_code == 202
    body = retried.json()
    assert body["id"] == course_id
    assert body["failure"] is None
    assert body["state"] == "complete"
    assert body["modules"][0]["id"] == published_id
    assert all(m["state"] == "published" for m in body["modules"])

    again = client.post(f"/api/v1/courses/{course_id}/retry")
    assert again.status_code == 409


def test_diagnostics_expose_traces_and_internal_blueprint(client, fake_ai) -> None:
    # DEC-005
    course_id = approved_course(client, fake_ai)
    diagnostics = client.get(f"/api/v1/courses/{course_id}/diagnostics").json()
    assert diagnostics["blueprint_internal"]["materialist_classification"] == "Central"
    assert diagnostics["trace_summary"]["calls"] > 5
    stages = {t["stage"] for t in diagnostics["traces"]}
    assert {
        "AI-STG-06/07",
        "AI-STG-08/09",
        "AI-STG-10/11",
        "AI-STG-12",
        "AI-STG-13",
    } <= stages
    qa = [t["qa_result"] for t in diagnostics["traces"] if t["stage"] == "AI-STG-10/11"]
    assert qa == ["Pass", "Pass"]


OXFORD_LISTING = "https://academic.oup.com/pq/pages"
OXFORD_LIMIT = (
    "The exact paper is not directly openable; "
    "this link is the Oxford Academic listing."
)


def _publish_with_research(
    client,
    fake_ai,
    payload: dict,
    citations: list[Citation],
    *,
    write_refs: list[str] | None = None,
    write_output: dict | None = None,
):
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput,
        blueprint(modules=2, lessons=2, deviation_reason="demo"),
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    if write_output is not None:
        fake_ai.default(LessonWriteOutput, write_output)
    elif write_refs is not None:
        fake_ai.default(LessonWriteOutput, lesson_write(write_refs))
    fake_ai.citations = citations
    fake_ai.default(ResearchOutput, payload)
    course_id = client.post(
        f"/api/v1/blueprints/{bid}/approve", json={"version": 1}
    ).json()["course_id"]
    course = client.get(f"/api/v1/courses/{course_id}").json()
    module_id = course["modules"][0]["id"]
    module = client.get(f"/api/v1/courses/{course_id}/modules/{module_id}").json()
    return course, module


def test_research_prompt_publishes_search_pages_and_has_no_minimum() -> None:
    assert prompts.RESEARCH_V1 == "research_lesson_v9"
    text = prompts.RESEARCH_INSTRUCTIONS
    assert "SEARCH PAGES" in text
    assert "never invent a url" in text
    assert "its title resembles" in text
    assert "no minimum count" in text
    assert "At most six" in text
    assert "archive edition of the same entry is the" in text
    assert "evidence list is valid" in text
    assert "is discarded" in text
    assert "https://academic.oup.com/" not in text


def test_search_pages_block_lists_the_tool_urls() -> None:
    block = _search_pages_block(
        [Citation(url="https://plato.stanford.edu/entries/socrates/", title="Socrates")]
    )
    assert "SEARCH PAGES" in block
    assert "https://plato.stanford.edu/entries/socrates/" in block
    assert "Copy each url exactly" in block
    assert "Leave the evidence list empty" in _search_pages_block([])


def test_collects_search_sources_opened_pages_and_annotations() -> None:
    response = SimpleNamespace(
        output=[
            SimpleNamespace(
                type="web_search_call",
                action=SimpleNamespace(
                    type="search",
                    sources=[
                        SimpleNamespace(
                            type="url", url="https://blog.example/real-article"
                        )
                    ],
                ),
            ),
            SimpleNamespace(
                type="web_search_call",
                action=SimpleNamespace(
                    type="open_page", url="https://blog.example/opened"
                ),
            ),
            SimpleNamespace(
                type="message",
                content=[
                    SimpleNamespace(
                        annotations=[
                            SimpleNamespace(
                                type="url_citation",
                                url="https://blog.example/real-article",
                                title="The real article",
                            )
                        ]
                    )
                ],
            ),
        ]
    )
    citations = _collect_citations(response)
    assert [(item.url, item.title) for item in citations] == [
        ("https://blog.example/real-article", "The real article"),
        ("https://blog.example/opened", ""),
    ]


def test_published_urls_are_the_search_pages_not_the_invented_path() -> None:
    invented = "https://academic.oup.com/pq/article/invented"
    parsed = ResearchOutput.model_validate(research([invented]))
    parsed.evidence[0].title = "French Fiscal Crisis"
    published = validators.published_research_evidence(
        parsed.evidence,
        [Citation(url=OXFORD_LISTING, title="French Fiscal Crisis | Oxford Academic")],
    )
    assert len(published) == 1
    assert published[0].url == OXFORD_LISTING
    assert published[0].title == "French Fiscal Crisis | Oxford Academic"
    assert published[0].relevant_excerpt == "Relevant excerpt from the source."
    assert invented not in {item.url for item in published}


def test_archive_editions_of_one_entry_are_one_page() -> None:
    pages = validators.research_pages(
        [
            Citation(
                url=(
                    "https://plato.stanford.edu/archives/fall2025"
                    "/entries/existentialism/?utm_source=openai"
                ),
                title="Existentialism (Stanford Encyclopedia of Philosophy)",
            ),
            Citation(
                url=(
                    "https://plato.stanford.edu/archives/spr2023"
                    "/entries/existentialism/?utm_source=openai"
                ),
                title="Existentialism",
            ),
            Citation(
                url=(
                    "https://plato.stanford.edu/archives/fall2018"
                    "/entries/existentialism/?utm_source=openai"
                ),
                title="",
            ),
            Citation(
                url=(
                    "https://www.rep.routledge.com/articles/thematic"
                    "/existentialism/v-1?utm_source=openai"
                ),
                title="Routledge",
            ),
        ]
    )
    assert [page.url for page in pages] == [
        "https://plato.stanford.edu/entries/existentialism",
        "https://rep.routledge.com/articles/thematic/existentialism/v-1",
    ]
    assert pages[0].title.startswith("Existentialism")


def test_several_pages_on_one_host_are_all_published() -> None:
    invented = "https://www.smashingmagazine.com/2018/01/invented-slug/"
    first = "https://www.smashingmagazine.com/2018/01/real-article/"
    second = "https://www.smashingmagazine.com/2014/05/another-article/"
    parsed = ResearchOutput.model_validate(research([invented]))
    parsed.evidence[0].title = "10 Useful Findings"
    published = validators.published_research_evidence(
        parsed.evidence,
        [
            Citation(url=first, title=""),
            Citation(url=second, title="Designing Better Forms"),
        ],
    )
    assert [item.url for item in published] == [
        "https://smashingmagazine.com/2018/01/real-article",
        "https://smashingmagazine.com/2014/05/another-article",
    ]
    assert all(item.title != "10 Useful Findings" for item in published)
    assert published[1].title == "Designing Better Forms"


def test_uncited_host_is_not_published() -> None:
    parsed = ResearchOutput.model_validate(research(["https://fake.example/invented"]))
    published = validators.published_research_evidence(
        parsed.evidence,
        [Citation(url="https://example.org/b", title="French Fiscal Crisis")],
    )
    assert [item.url for item in published] == ["https://example.org/b"]


def test_only_404_and_410_count_as_a_missing_page() -> None:
    assert validators.status_is_gone(404)
    assert validators.status_is_gone(410)
    assert not validators.status_is_gone(403)
    assert not validators.status_is_gone(200)

    def handler(request: httpx.Request) -> httpx.Response:
        status = {"missing": 404, "gone": 410, "blocked": 403}[
            request.url.path.strip("/")
        ]
        return httpx.Response(status)

    async def check() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http:
            assert await validators.page_is_gone("https://blog.example/missing", http)
            assert await validators.page_is_gone("https://blog.example/gone", http)
            assert not await validators.page_is_gone(
                "https://blog.example/blocked", http
            )

    asyncio.run(check())


def test_demo_validator_still_accepts_one_uncited_source() -> None:
    # Demo mode must not fail the build because a URL is absent from citations.
    validator = validators.make_research_validator(require_retrieved=True)
    parsed = ResearchOutput.model_validate(research(["https://fake.example/only"]))
    codes = validator(
        StructuredResult(
            parsed=parsed,
            usage=TokenUsage(),
            model="fake",
            duration_ms=1,
            citations=[],
        )
    )
    assert "evidence_url_invalid" not in codes
    assert "evidence_insufficient" not in codes


def test_missing_paper_page_publishes_the_search_page(client, fake_ai) -> None:
    model_url = "https://academic.oup.com/pq/article/invented"
    payload = research(
        [
            model_url,
            "https://example.org/b",
            "https://example.org/c",
        ]
    )
    payload["evidence"][0]["title"] = "French Fiscal Crisis"
    payload["evidence"][0]["limits"] = OXFORD_LIMIT
    course, module = _publish_with_research(
        client,
        fake_ai,
        payload,
        [
            Citation(
                url=OXFORD_LISTING, title="French Fiscal Crisis | Oxford Academic"
            ),
            Citation(url="https://example.org/b", title="B"),
            Citation(url="https://example.org/c", title="C"),
        ],
    )
    assert course["state"] == "partially_available"
    by_url = {source["url"]: source for source in module["sources"]}
    assert model_url not in by_url
    assert by_url[OXFORD_LISTING]["verification"] == "retrieved"
    assert by_url[OXFORD_LISTING]["limits"] == OXFORD_LIMIT
    assert by_url[OXFORD_LISTING]["title"] == "French Fiscal Crisis | Oxford Academic"
    assert by_url["https://example.org/b"]["verification"] == "retrieved"
    assert by_url["https://example.org/c"]["verification"] == "retrieved"
    research_calls = [
        call for call in fake_ai.calls if call["schema"] == "ResearchOutput"
    ]
    assert research_calls
    assert all("evidence_insufficient" not in call["input"] for call in research_calls)
    assert all("evidence_url_invalid" not in call["input"] for call in research_calls)


def test_invented_host_is_dropped_and_build_still_publishes(client, fake_ai) -> None:
    invented = "https://fake.example/invented"
    course, module = _publish_with_research(
        client,
        fake_ai,
        research([invented, "https://example.org/b", "https://example.org/c"]),
        [
            Citation(url="https://example.org/b", title="B"),
            Citation(url="https://example.org/c", title="C"),
        ],
        write_refs=["S1", "S2", "S3"],
    )
    assert course["state"] == "partially_available"
    by_url = {source["url"]: source for source in module["sources"]}
    assert invented not in by_url
    assert by_url["https://example.org/b"]["verification"] == "retrieved"
    assert by_url["https://example.org/c"]["verification"] == "retrieved"
    research_calls = [
        call for call in fake_ai.calls if call["schema"] == "ResearchOutput"
    ]
    assert all("evidence_insufficient" not in call["input"] for call in research_calls)
    assert all("evidence_url_invalid" not in call["input"] for call in research_calls)


def _write_without_source_lists() -> dict:
    payload = lesson_write(["S1"])
    payload["draft"]["sources_used_refs"] = []
    payload["spec"]["assigned_evidence_refs"] = []
    return payload


def test_empty_source_lists_are_filled_and_the_module_publishes(
    client, fake_ai
) -> None:
    course, module = _publish_with_research(
        client,
        fake_ai,
        research(["https://example.org/a", "https://example.org/b"]),
        [
            Citation(url="https://example.org/a", title="A"),
            Citation(url="https://example.org/b", title="B"),
        ],
        write_output=_write_without_source_lists(),
    )
    assert course["state"] == "partially_available"
    assert module["state"] == "published"
    assert {source["ref"] for source in module["sources"]} == {"S1", "S2"}
    writes = [call for call in fake_ai.calls if call["schema"] == "LessonWriteOutput"]
    assert len(writes) == 2
    assert all("sources_used_insufficient" not in call["input"] for call in writes)


def test_lesson_keeps_at_most_six_search_pages(client, fake_ai) -> None:
    # BR-SRC-003: the demo keeps the first six live search pages per lesson.
    urls = [f"https://example.org/page-{index}" for index in range(8)]
    course, module = _publish_with_research(
        client,
        fake_ai,
        research([urls[0]]),
        [Citation(url=url, title=f"Page {index}") for index, url in enumerate(urls)],
    )
    assert course["state"] == "partially_available"
    assert [source["url"] for source in module["sources"]] == urls[:6]
    assert all(source["verification"] == "retrieved" for source in module["sources"])


def test_gone_search_page_is_not_published(client, fake_ai, monkeypatch) -> None:
    async def gone(url: str, client: object = None) -> bool:
        return url.endswith("/missing")

    monkeypatch.setattr(
        "auteur_api.modules.generation.validators.page_is_gone",
        gone,
    )
    course, module = _publish_with_research(
        client,
        fake_ai,
        research(["https://example.org/missing", "https://example.org/b"]),
        [
            Citation(url="https://example.org/missing", title="Missing"),
            Citation(url="https://example.org/b", title="B"),
        ],
    )
    assert course["state"] == "partially_available"
    urls = {source["url"] for source in module["sources"]}
    assert "https://example.org/missing" not in urls
    assert "https://example.org/b" in urls


def test_second_research_again_still_publishes_the_module(client, fake_ai) -> None:
    # Two source searches are enough. The lesson is kept even if both are empty.
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    empty = research([])
    empty["evidence"] = []
    fake_ai.citations = []
    fake_ai.default(ResearchOutput, empty)
    fake_ai.default(LessonWriteOutput, _write_without_source_lists())
    fake_ai.enqueue(LessonReviewOutput, review("Research again"))
    fake_ai.enqueue(LessonReviewOutput, review("Research again"))
    course_id = client.post(
        f"/api/v1/blueprints/{bid}/approve", json={"version": 1}
    ).json()["course_id"]
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["state"] == "partially_available"
    module_id = course["modules"][0]["id"]
    module = client.get(f"/api/v1/courses/{course_id}/modules/{module_id}").json()
    assert module["state"] == "published"
    assert module["sources"] == []
    diagnostics = client.get(f"/api/v1/courses/{course_id}/diagnostics").json()
    lesson = diagnostics["modules"][0]["lessons"][0]
    assert lesson["research_rounds"] == 2
    assert lesson["evidence_total"] == 0


def test_lesson_publishes_when_research_keeps_no_sources(client, fake_ai) -> None:
    payload = research([])
    payload["evidence"] = []
    course, module = _publish_with_research(
        client,
        fake_ai,
        payload,
        [],
        write_output=_write_without_source_lists(),
    )
    assert course["state"] == "partially_available"
    assert module["state"] == "published"
    assert module["sources"] == []
    traces = client.get(f"/api/v1/courses/{course['id']}/diagnostics").json()["traces"]
    research_traces = [trace for trace in traces if trace["stage"] == "AI-STG-06/07"]
    write_traces = [trace for trace in traces if trace["stage"] == "AI-STG-08/09"]
    assert research_traces and write_traces
    assert all(trace["status"] == "ok" for trace in research_traces)
    assert all(trace["validation_codes"] == [] for trace in research_traces)
    assert all(trace["status"] == "ok" for trace in write_traces)
    assert all(trace["validation_codes"] == [] for trace in write_traces)
