"""Phase 5: differentiated proposals (BR-PRP-001..007, UF-03)."""

from __future__ import annotations

from tests.fixtures import REQUEST_BODY, analysis, objective, proposal_set

from auteur_api.modules.onboarding.schemas import (
    LearningObjectiveOutput,
    RequestAnalysisOutput,
)
from auteur_api.modules.proposals.schemas import ProposalSetOutput


def confirmed_request(client, fake_ai) -> str:
    fake_ai.enqueue(RequestAnalysisOutput, analysis())
    fake_ai.enqueue(LearningObjectiveOutput, objective())
    body = client.post("/api/v1/learning-requests", json=REQUEST_BODY).json()
    client.post(
        f"/api/v1/learning-requests/{body['id']}/objective/confirm",
        json={"version": 1},
    )
    return body["id"]


def test_proposals_require_confirmed_objective(client, fake_ai) -> None:
    fake_ai.enqueue(RequestAnalysisOutput, analysis())
    fake_ai.enqueue(LearningObjectiveOutput, objective())
    body = client.post("/api/v1/learning-requests", json=REQUEST_BODY).json()
    response = client.post(f"/api/v1/learning-requests/{body['id']}/proposals")
    assert response.status_code == 409


def test_generates_between_one_and_five_with_recommendation(client, fake_ai) -> None:
    request_id = confirmed_request(client, fake_ai)
    fake_ai.enqueue(ProposalSetOutput, proposal_set(3))
    response = client.post(f"/api/v1/learning-requests/{request_id}/proposals")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "proposals_ready"
    assert len(body["proposals"]["proposals"]) == 3
    assert (
        body["proposals"]["recommended_proposal_id"]
        == (body["proposals"]["proposals"][0]["id"])
    )
    assert body["proposals"]["recommendation_reason"]
    # BR-PRP-007: no structure leaks into proposals.
    assert "modules" not in body["proposals"]["proposals"][0]

    # Idempotent: a second call keeps the same set (BR-PRP-003).
    again = client.post(f"/api/v1/learning-requests/{request_id}/proposals")
    assert again.json()["proposals"]["id"] == body["proposals"]["id"]
    assert len(fake_ai.calls) == 3


def test_insufficient_differentiation_is_retried(client, fake_ai) -> None:
    # BR-PRP-002: at least three differing dimensions per pair.
    request_id = confirmed_request(client, fake_ai)
    fake_ai.enqueue(ProposalSetOutput, proposal_set(2, dims=2))
    fake_ai.enqueue(ProposalSetOutput, proposal_set(2, dims=3))
    response = client.post(f"/api/v1/learning-requests/{request_id}/proposals")
    assert response.status_code == 200
    assert "proposals_insufficiently_differentiated" in fake_ai.calls[-1]["input"]


def test_too_many_proposals_is_retried(client, fake_ai) -> None:
    request_id = confirmed_request(client, fake_ai)
    fake_ai.enqueue(ProposalSetOutput, proposal_set(6))
    fake_ai.enqueue(ProposalSetOutput, proposal_set(1))
    response = client.post(f"/api/v1/learning-requests/{request_id}/proposals")
    assert response.status_code == 200
    body = response.json()["proposals"]
    assert len(body["proposals"]) == 1
    assert body["recommended_proposal_id"] is None


def test_select_exactly_one_and_change_before_blueprint(client, fake_ai) -> None:
    request_id = confirmed_request(client, fake_ai)
    fake_ai.enqueue(ProposalSetOutput, proposal_set(2))
    body = client.post(f"/api/v1/learning-requests/{request_id}/proposals").json()
    first, second = (p["id"] for p in body["proposals"]["proposals"])

    missing = client.post(
        f"/api/v1/learning-requests/{request_id}/proposals/select",
        json={"proposal_id": "nope"},
    )
    assert missing.status_code == 404

    selected = client.post(
        f"/api/v1/learning-requests/{request_id}/proposals/select",
        json={"proposal_id": first},
    )
    assert selected.json()["state"] == "proposal_selected"
    assert selected.json()["selected_proposal_id"] == first

    changed = client.post(
        f"/api/v1/learning-requests/{request_id}/proposals/select",
        json={"proposal_id": second},
    )
    assert changed.json()["selected_proposal_id"] == second


def test_objective_revision_invalidates_proposals(client, fake_ai) -> None:
    # BR-OBJ-011
    request_id = confirmed_request(client, fake_ai)
    fake_ai.enqueue(ProposalSetOutput, proposal_set(2))
    client.post(f"/api/v1/learning-requests/{request_id}/proposals")
    fake_ai.enqueue(LearningObjectiveOutput, objective("Compare causes."))
    revised = client.post(
        f"/api/v1/learning-requests/{request_id}/objective/revisions",
        json={"feedback": "Compare instead of narrate."},
    ).json()
    assert revised["proposals"] is None
    assert revised["selected_proposal_id"] is None
