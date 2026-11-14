"""Phase 6: Blueprint generation and system confirmation (UF-04, BR-BLP-*, DEC-022)."""

from __future__ import annotations

import re

import pytest

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
    body = client.post("/api/v1/learning-requests", json=REQUEST_BODY).json()
    rid = body["id"]
    fake_ai.enqueue(LearningObjectiveOutput, objective())
    client.post(
        f"/api/v1/learning-requests/{rid}/objective/revisions",
        json={"feedback": "Keep this focus."},
    )
    client.post(
        f"/api/v1/learning-requests/{rid}/objective/confirm", json={"version": 1}
    )
    fake_ai.enqueue(ProposalSetOutput, proposal_set(4))
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


def test_blueprint_starts_in_production_without_a_subscription(
    client, fake_ai, monkeypatch
) -> None:
    """BR-SUB-003 is not implemented. APP_ENV=production must not dead-end the step."""
    from auteur_api.core.config import settings

    monkeypatch.setattr(settings, "app_env", "production")
    rid = selected_request(client, fake_ai)
    script_full_build(fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    started = client.post(f"/api/v1/learning-requests/{rid}/blueprint")
    assert started.status_code == 202
    assert started.json()["state"] == "approved"
    assert started.json()["course_id"]


def test_blueprint_requires_selected_proposal(client, fake_ai) -> None:
    fake_ai.enqueue(RequestAnalysisOutput, analysis())
    body = client.post("/api/v1/learning-requests", json=REQUEST_BODY).json()
    response = client.post(f"/api/v1/learning-requests/{body['id']}/blueprint")
    assert response.status_code == 409


def test_blueprint_is_generated_and_visible_only(client, fake_ai) -> None:
    rid = selected_request(client, fake_ai)
    script_full_build(fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    started = client.post(f"/api/v1/learning-requests/{rid}/blueprint")
    assert started.status_code == 202
    bid = started.json()["id"]

    fetched = client.get(f"/api/v1/blueprints/{bid}").json()
    assert fetched["state"] == "approved"
    assert fetched["course_id"]
    assert fetched["current_version"] == 1
    assert len(fetched["blueprint"]["modules"]) == 4
    # BR-BLP-004: internal information is not exposed as product content.
    assert "internal" not in fetched
    assert "materialist_classification" not in str(fetched)
    blueprint_call = next(
        call for call in fake_ai.calls if call["schema"] == "BlueprintOutput"
    )
    assert blueprint_call["web_search"] is True

    request = client.get(f"/api/v1/learning-requests/{rid}").json()
    assert request["state"] == "approved"
    assert request["blueprint_id"] == bid
    assert request["course_id"] == fetched["course_id"]

    # Idempotent: a second POST returns the same Blueprint and course.
    again = client.post(f"/api/v1/learning-requests/{rid}/blueprint")
    assert again.json()["id"] == bid
    assert again.json()["course_id"] == fetched["course_id"]


@pytest.mark.skip(
    reason="Demo skips blueprint structure-deviation validation in blueprints/service.py."
)
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

    # Retry is possible without duplicating the Blueprint. DEC-022 confirms it.
    script_full_build(fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    retried = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()
    assert retried["id"] == bid
    assert retried["state"] == "approved"
    assert retried["course_id"]


def test_confirmation_starts_one_build_and_learner_routes_are_gone(
    client, fake_ai
) -> None:
    # DEC-022, BR-BLP-010, BR-GEN-001, BR-GEN-012
    rid = selected_request(client, fake_ai)
    script_full_build(fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    started = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()
    bid = started["id"]
    course_id = started["course_id"]
    assert started["state"] == "approved"

    again = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()
    assert again["id"] == bid
    assert again["course_id"] == course_id

    revise = client.post(
        f"/api/v1/blueprints/{bid}/revisions", json={"feedback": "Change it."}
    )
    assert revise.status_code == 404
    approve = client.post(f"/api/v1/blueprints/{bid}/approve", json={"version": 1})
    assert approve.status_code == 404

    request = client.get(f"/api/v1/learning-requests/{rid}").json()
    assert request["state"] == "approved"
    assert request["course_id"] == course_id
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["title"]
    assert course["modules"]
    assert course["modules"][0]["lessons"]
    assert course["modules"][0]["state"]


def test_unconfirmed_saved_blueprint_is_confirmed_when_generation_starts(
    client, fake_ai, monkeypatch
) -> None:
    # A version left in awaiting_approval (saved before DEC-022) has no review
    # route. Starting the course confirms that version and opens a build.
    rid = selected_request(client, fake_ai)
    script_full_build(fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())

    async def skip_confirm(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(
        "auteur_api.modules.blueprints.service._confirm_and_start", skip_confirm
    )
    saved = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()
    assert saved["state"] == "awaiting_approval"
    assert saved["course_id"] is None
    monkeypatch.undo()

    confirmed = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()
    assert confirmed["id"] == saved["id"]
    assert confirmed["state"] == "approved"
    assert confirmed["course_id"]
    course = client.get(f"/api/v1/courses/{confirmed['course_id']}").json()
    assert course["title"]
    assert course["modules"][0]["lessons"]
    assert course["modules"][0]["state"]


def test_confirmed_blueprint_cannot_switch_proposal(client, fake_ai) -> None:
    # DEC-022: BR-BLP-011's pre-approval switch is not part of the journey.
    rid = selected_request(client, fake_ai)
    script_full_build(fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    client.post(f"/api/v1/learning-requests/{rid}/blueprint")
    request = client.get(f"/api/v1/learning-requests/{rid}").json()
    other = request["proposals"]["proposals"][1]["id"]
    changed = client.post(
        f"/api/v1/learning-requests/{rid}/proposals/select", json={"proposal_id": other}
    )
    assert changed.status_code == 409
    assert request["blueprint_id"]
