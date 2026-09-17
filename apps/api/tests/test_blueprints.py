"""Phase 6: Blueprint generation, revision and approval (UF-04, BR-BLP-*)."""

from __future__ import annotations

import re

from tests.fixtures import (
    REQUEST_BODY,
    analysis,
    audit,
    blueprint,
    course_synthesis,
    knowledge_check,
    lesson_write,
    objective,
    proposal_set,
    research,
    review,
    synthesis,
)

from auteur_api.ai.client import Citation
from auteur_api.modules.blueprints.schemas import BlueprintOutput
from auteur_api.modules.generation.schemas import (
    CourseAuditOutput,
    CourseSynthesisOutput,
    KnowledgeCheckOutput,
    LessonReviewOutput,
    LessonWriteOutput,
    ModuleAuditOutput,
    ModuleSynthesisOutput,
    ResearchOutput,
)
from auteur_api.modules.onboarding.schemas import (
    LearningObjectiveOutput,
    RequestAnalysisOutput,
)
from auteur_api.modules.proposals.schemas import ProposalSetOutput


def selected_request(client, fake_ai) -> str:
    fake_ai.enqueue(RequestAnalysisOutput, analysis())
    fake_ai.enqueue(LearningObjectiveOutput, objective())
    body = client.post("/api/v1/learning-requests", json=REQUEST_BODY).json()
    rid = body["id"]
    client.post(
        f"/api/v1/learning-requests/{rid}/objective/confirm", json={"version": 1}
    )
    fake_ai.enqueue(ProposalSetOutput, proposal_set(2))
    body = client.post(f"/api/v1/learning-requests/{rid}/proposals").json()
    pid = body["proposals"]["proposals"][0]["id"]
    client.post(
        f"/api/v1/learning-requests/{rid}/proposals/select", json={"proposal_id": pid}
    )
    return rid


def knowledge_check_for_module(prompt_input: str) -> dict:
    """Relate questions to a lesson that exists in the module being built."""
    match = re.search(r"^MODULE (\d+):", prompt_input, re.MULTILINE)
    index = match.group(1) if match else "1"
    return knowledge_check(lesson_title=f"Lesson {index}.1")


def script_full_build(fake_ai) -> None:
    """Default happy-path outputs so a module can be built end to end."""
    fake_ai.citations = [
        Citation(url="https://example.org/a", title="A"),
        Citation(url="https://example.org/b", title="B"),
        Citation(url="https://example.org/c", title="C"),
    ]
    fake_ai.default(ResearchOutput, research())
    fake_ai.default(LessonWriteOutput, lesson_write())
    fake_ai.default(LessonReviewOutput, review("Pass"))
    fake_ai.default(ModuleSynthesisOutput, synthesis())
    fake_ai.default(KnowledgeCheckOutput, knowledge_check_for_module)
    fake_ai.default(ModuleAuditOutput, audit("Pass"))
    fake_ai.default(CourseSynthesisOutput, course_synthesis())
    fake_ai.default(CourseAuditOutput, audit("Pass"))


def test_blueprint_requires_selected_proposal(client, fake_ai) -> None:
    fake_ai.enqueue(RequestAnalysisOutput, analysis())
    fake_ai.enqueue(LearningObjectiveOutput, objective())
    body = client.post("/api/v1/learning-requests", json=REQUEST_BODY).json()
    response = client.post(f"/api/v1/learning-requests/{body['id']}/blueprint")
    assert response.status_code == 409


def test_blueprint_is_generated_and_visible_only(client, fake_ai) -> None:
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    started = client.post(f"/api/v1/learning-requests/{rid}/blueprint")
    assert started.status_code == 202
    bid = started.json()["id"]

    fetched = client.get(f"/api/v1/blueprints/{bid}").json()
    assert fetched["state"] == "awaiting_approval"
    assert fetched["current_version"] == 1
    assert len(fetched["blueprint"]["modules"]) == 4
    # BR-BLP-004: internal information is not exposed as product content.
    assert "internal" not in fetched
    assert "materialist_classification" not in str(fetched)
    assert fake_ai.calls[-1]["web_search"] is True

    request = client.get(f"/api/v1/learning-requests/{rid}").json()
    assert request["state"] == "awaiting_approval"
    assert request["blueprint_id"] == bid

    # Idempotent: a second POST returns the same Blueprint.
    again = client.post(f"/api/v1/learning-requests/{rid}/blueprint")
    assert again.json()["id"] == bid


def test_structure_deviation_requires_justification(client, fake_ai) -> None:
    # BR-BLP-006/007: out-of-reference structure needs a reason, not rejection.
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint(modules=2))
    fake_ai.enqueue(BlueprintOutput, blueprint(modules=2, deviation_reason="Narrow"))
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    fetched = client.get(f"/api/v1/blueprints/{bid}").json()
    assert fetched["state"] == "awaiting_approval"
    assert "blueprint_structure_deviation_unjustified" in fake_ai.calls[-1]["input"]


def test_too_few_modules_is_rejected(client, fake_ai) -> None:
    rid = selected_request(client, fake_ai)
    fake_ai.default(BlueprintOutput, blueprint(modules=1, deviation_reason="x"))
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    fetched = client.get(f"/api/v1/blueprints/{bid}").json()
    assert fetched["state"] == "failed"
    assert fetched["failure_message"]
    request = client.get(f"/api/v1/learning-requests/{rid}").json()
    assert request["state"] == "proposal_selected"

    # Retry is possible without duplicating the Blueprint.
    fake_ai.enqueue(BlueprintOutput, blueprint())
    retried = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()
    assert retried["id"] == bid
    assert client.get(f"/api/v1/blueprints/{bid}").json()["state"] == (
        "awaiting_approval"
    )


def test_revision_creates_new_version_and_keeps_previous(client, fake_ai) -> None:
    # BR-BLP-009
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    fake_ai.enqueue(BlueprintOutput, blueprint(modules=5))
    revised = client.post(
        f"/api/v1/blueprints/{bid}/revisions", json={"feedback": "Add a module."}
    )
    assert revised.status_code == 202
    fetched = client.get(f"/api/v1/blueprints/{bid}").json()
    assert fetched["current_version"] == 2
    assert fetched["previous_versions"] == [1]
    assert len(fetched["blueprint"]["modules"]) == 5
    assert "learner_revision_feedback" in fake_ai.calls[-1]["input"]
    assert "PREVIOUS BLUEPRINT VERSION" in fake_ai.calls[-1]["input"]


def test_failed_revision_keeps_previous_version(client, fake_ai) -> None:
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    fake_ai.default(BlueprintOutput, blueprint(modules=1, deviation_reason="x"))
    client.post(f"/api/v1/blueprints/{bid}/revisions", json={"feedback": "Shorter."})
    fetched = client.get(f"/api/v1/blueprints/{bid}").json()
    assert fetched["state"] == "awaiting_approval"
    assert fetched["current_version"] == 1
    assert fetched["failure_message"]


def test_approve_requires_exact_version_and_is_idempotent(client, fake_ai) -> None:
    # BR-BLP-010, BR-GEN-001, BR-GEN-012
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    script_full_build(fake_ai)

    stale = client.post(f"/api/v1/blueprints/{bid}/approve", json={"version": 3})
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_version"

    approved = client.post(f"/api/v1/blueprints/{bid}/approve", json={"version": 1})
    assert approved.status_code == 202
    course_id = approved.json()["course_id"]

    again = client.post(f"/api/v1/blueprints/{bid}/approve", json={"version": 1})
    assert again.json()["course_id"] == course_id

    revise = client.post(
        f"/api/v1/blueprints/{bid}/revisions", json={"feedback": "Change it."}
    )
    assert revise.status_code == 409

    request = client.get(f"/api/v1/learning-requests/{rid}").json()
    assert request["state"] == "approved"
    assert request["course_id"] == course_id


def test_choosing_another_proposal_discards_unapproved_blueprint(
    client, fake_ai
) -> None:
    # BR-BLP-011
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    request = client.get(f"/api/v1/learning-requests/{rid}").json()
    other = request["proposals"]["proposals"][1]["id"]
    changed = client.post(
        f"/api/v1/learning-requests/{rid}/proposals/select", json={"proposal_id": other}
    ).json()
    assert changed["state"] == "proposal_selected"
    assert changed["blueprint_id"] is None
    fake_ai.enqueue(BlueprintOutput, blueprint())
    new_bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    assert new_bid != bid
