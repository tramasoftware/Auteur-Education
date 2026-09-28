"""Phases 3-4: intention analysis, precision and objective (UF-01..03)."""

from __future__ import annotations

from tests.fixtures import REQUEST_BODY, analysis, objective

from auteur_api.modules.onboarding.schemas import (
    LearningObjectiveOutput,
    RequestAnalysisOutput,
)


def create(client, fake_ai, **kwargs):
    fake_ai.enqueue(RequestAnalysisOutput, analysis(**kwargs))
    if not kwargs.get("needs_precision") and kwargs.get("classification") != (
        "Incompatible"
    ):
        fake_ai.enqueue(LearningObjectiveOutput, objective())
    response = client.post("/api/v1/learning-requests", json=REQUEST_BODY)
    return response


def test_specific_intent_skips_precision_and_formulates_objective(
    client, fake_ai
) -> None:
    # BR-OBJ-007: precision omitted when the intention is specific.
    response = create(client, fake_ai)
    assert response.status_code == 201
    body = response.json()
    assert body["state"] == "objective_confirmation"
    assert body["precision"]["needs_precision"] is False
    assert body["objective"]["version"] == 1
    assert body["objective"]["confirmed"] is False
    assert body["compatibility"]["classification"] == "Allowed"


def test_invalid_level_is_rejected(client) -> None:
    # BR-ONB-004
    response = client.post(
        "/api/v1/learning-requests", json={**REQUEST_BODY, "experience_level": "Pro"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_non_english_input_is_rejected_and_not_persisted(client, fake_ai) -> None:
    # BR-ONB-001/002
    fake_ai.enqueue(RequestAnalysisOutput, analysis(english=False))
    response = client.post("/api/v1/learning-requests", json=REQUEST_BODY)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "non_english_input"
    from auteur_api.core.store import store

    assert store.learning_requests == {}


def test_incompatible_request_cannot_continue(client, fake_ai) -> None:
    # BR-OBJ-004
    response = create(client, fake_ai, classification="Incompatible")
    assert response.status_code == 201
    body = response.json()
    assert body["state"] == "incompatible"
    assert body["objective"] is None
    precision = client.post(
        f"/api/v1/learning-requests/{body['id']}/precision",
        json={"option_id": "x"},
    )
    assert precision.status_code == 409


def test_ambiguous_intent_requires_precision_then_objective(client, fake_ai) -> None:
    # BR-OBJ-006: 2-5 options narrowing the object.
    response = create(client, fake_ai, needs_precision=True, options=3)
    body = response.json()
    assert body["state"] == "precision_required"
    assert len(body["precision"]["options"]) == 3
    assert body["objective"] is None

    option_id = body["precision"]["options"][1]["id"]
    fake_ai.enqueue(LearningObjectiveOutput, objective())
    chosen = client.post(
        f"/api/v1/learning-requests/{body['id']}/precision",
        json={"option_id": option_id},
    )
    assert chosen.status_code == 200
    chosen_body = chosen.json()
    assert chosen_body["state"] == "objective_confirmation"
    assert chosen_body["selected_precision"]["option_id"] == option_id
    assert "selected_learning_object" in fake_ai.calls[-1]["input"]


def test_precision_option_count_is_validated_and_retried(client, fake_ai) -> None:
    fake_ai.enqueue(RequestAnalysisOutput, analysis(needs_precision=True, options=1))
    fake_ai.enqueue(RequestAnalysisOutput, analysis(needs_precision=True, options=6))
    fake_ai.enqueue(RequestAnalysisOutput, analysis(needs_precision=True, options=4))
    response = client.post("/api/v1/learning-requests", json=REQUEST_BODY)
    assert response.status_code == 201
    assert len(response.json()["precision"]["options"]) == 4
    assert len(fake_ai.calls) == 3
    assert "precision_options_count" in fake_ai.calls[1]["input"]


def test_objective_without_capability_verb_is_retried(client, fake_ai) -> None:
    # BR-OBJ-008
    fake_ai.enqueue(RequestAnalysisOutput, analysis())
    bad = objective("Write an essay about the French Revolution.")
    bad["observable_capability"] = "Produce an essay."
    fake_ai.enqueue(LearningObjectiveOutput, bad)
    fake_ai.enqueue(LearningObjectiveOutput, objective())
    response = client.post("/api/v1/learning-requests", json=REQUEST_BODY)
    assert response.status_code == 201
    assert "objective_invents_deliverable" in fake_ai.calls[2]["input"]


def test_confirm_requires_exact_version_and_is_idempotent(client, fake_ai) -> None:
    # BR-OBJ-010
    body = create(client, fake_ai).json()
    url = f"/api/v1/learning-requests/{body['id']}/objective/confirm"
    stale = client.post(url, json={"version": 2})
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_version"

    confirmed = client.post(url, json={"version": 1})
    assert confirmed.status_code == 200
    assert confirmed.json()["state"] == "objective_confirmed"
    assert confirmed.json()["objective"]["confirmed"] is True

    again = client.post(url, json={"version": 1})
    assert again.status_code == 200
    assert again.json()["state"] == "objective_confirmed"


def test_revision_creates_new_version_and_invalidates(client, fake_ai) -> None:
    # BR-OBJ-011
    body = create(client, fake_ai).json()
    request_id = body["id"]
    client.post(
        f"/api/v1/learning-requests/{request_id}/objective/confirm",
        json={"version": 1},
    )
    fake_ai.enqueue(LearningObjectiveOutput, objective("Compare the causes."))
    revised = client.post(
        f"/api/v1/learning-requests/{request_id}/objective/revisions",
        json={"feedback": "Focus on comparison, not narration."},
    )
    assert revised.status_code == 200
    revised_body = revised.json()
    assert revised_body["objective"]["version"] == 2
    assert revised_body["objective"]["confirmed"] is False
    assert revised_body["state"] == "objective_confirmation"
    assert "learner_revision_feedback" in fake_ai.calls[-1]["input"]

    old = client.post(
        f"/api/v1/learning-requests/{request_id}/objective/confirm",
        json={"version": 1},
    )
    assert old.status_code == 409


def test_get_returns_persisted_state(client, fake_ai) -> None:
    # UF-05 resume
    body = create(client, fake_ai).json()
    fetched = client.get(f"/api/v1/learning-requests/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == body


def test_provider_failure_is_safe(client, fake_ai) -> None:
    from auteur_api.ai.client import GenerationError

    fake_ai.enqueue(RequestAnalysisOutput, GenerationError("provider", "timeout"))
    response = client.post("/api/v1/learning-requests", json=REQUEST_BODY)
    assert response.status_code == 503
    body = response.json()["error"]
    assert body["code"] == "provider_unavailable"
    assert "timeout" not in body["message"]
