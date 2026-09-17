"""Phases 7-9: research, writing, review, synthesis, Knowledge Check, publication."""

from __future__ import annotations

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

from auteur_api.ai.client import Citation
from auteur_api.core.config import settings
from auteur_api.modules.blueprints.schemas import BlueprintOutput
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
    # BR-SRC-008: only sources actually used are shown, and they are verified.
    assert {s["ref"] for s in module["sources"]} == {"S1", "S2"}
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
    assert "kept" in course["failure"].lower()
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
    assert len(kc_calls) == 3
    assert "knowledge_check_question_count" in kc_calls[1]["input"]
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
    assert "audit" in course["failure"].lower()


def test_unknown_source_ref_in_lesson_is_rejected(client, fake_ai) -> None:
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(
        BlueprintOutput, blueprint(modules=2, lessons=2, deviation_reason="demo")
    )
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)
    fake_ai.enqueue(LessonWriteOutput, lesson_write(refs=["S1", "S9"]))
    client.post(f"/api/v1/blueprints/{bid}/approve", json={"version": 1})
    writes = [c for c in fake_ai.calls if c["schema"] == "LessonWriteOutput"]
    assert "sources_used_unknown_ref" in writes[1]["input"]


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
