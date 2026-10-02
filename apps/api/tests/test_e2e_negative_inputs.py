"""E2E checklist: invalid user input must not advance or persist (DemoStore).

Runs against TestClient + FakeAI. It does not call OpenAI or write to Supabase,
so Library stays untouched.

Already covered elsewhere (do not duplicate):
- UF-01 empty body → 422: test_foundations.test_validation_error_is_structured
- BR-ONB-004 invalid level → 422: test_learning_requests.test_invalid_level_is_rejected
- BR-ONB-001/002 non-English → 422, nothing persisted:
  test_learning_requests.test_non_english_input_is_rejected_and_not_persisted
- BR-OBJ-004 incompatible cannot continue:
  test_learning_requests.test_incompatible_request_cannot_continue
- BR-OBJ-010 stale objective version → 409:
  test_learning_requests.test_confirm_requires_exact_version_and_is_idempotent
- BR-PRP proposals require confirmed objective / unknown proposal id:
  test_proposals
- BR-BLP Blueprint requires selection / stale approve / failed revision keeps prior:
  test_blueprints
"""

from __future__ import annotations

from tests.fixtures import REQUEST_BODY, analysis, blueprint, objective
from tests.test_blueprints import selected_request
from tests.test_learning_requests import create

from auteur_api.core.config import settings
from auteur_api.core.store import store
from auteur_api.modules.blueprints.schemas import BlueprintOutput
from auteur_api.modules.onboarding.schemas import (
    LearningObjectiveOutput,
    RequestAnalysisOutput,
)


def test_whitespace_intent_is_rejected_and_does_not_call_the_model(
    client, fake_ai
) -> None:
    # UF-01: empty/whitespace intent is not meaningful content.
    response = client.post(
        "/api/v1/learning-requests",
        json={**REQUEST_BODY, "initial_intent": "   "},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert store.learning_requests == {}
    assert fake_ai.calls == []


def test_whitespace_outcome_is_rejected_and_not_persisted(client, fake_ai) -> None:
    response = client.post(
        "/api/v1/learning-requests",
        json={**REQUEST_BODY, "expected_outcome": "\n\t  "},
    )
    assert response.status_code == 422
    assert store.learning_requests == {}
    assert fake_ai.calls == []


def test_intent_over_max_length_is_rejected(client, fake_ai) -> None:
    too_long = "a" * (settings.max_free_text_chars + 1)
    response = client.post(
        "/api/v1/learning-requests",
        json={**REQUEST_BODY, "initial_intent": too_long},
    )
    assert response.status_code == 422
    assert store.learning_requests == {}
    assert fake_ai.calls == []


def test_whitespace_prior_knowledge_is_stored_as_absent(client, fake_ai) -> None:
    # BR-ONB-005: blank optional context must not be treated as knowledge.
    fake_ai.enqueue(RequestAnalysisOutput, analysis())
    fake_ai.enqueue(LearningObjectiveOutput, objective())
    response = client.post(
        "/api/v1/learning-requests",
        json={**REQUEST_BODY, "prior_knowledge": "   "},
    )
    assert response.status_code == 201
    assert response.json()["inputs"]["prior_knowledge"] is None


def test_precision_rejects_both_option_and_free_text(client, fake_ai) -> None:
    body = create(client, fake_ai, needs_precision=True).json()
    option_id = body["precision"]["options"][0]["id"]
    response = client.post(
        f"/api/v1/learning-requests/{body['id']}/precision",
        json={"option_id": option_id, "free_text": "A custom focus"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    fetched = client.get(f"/api/v1/learning-requests/{body['id']}").json()
    assert fetched["state"] == "precision_required"
    assert fetched["objective"] is None


def test_precision_rejects_neither_option_nor_free_text(client, fake_ai) -> None:
    body = create(client, fake_ai, needs_precision=True).json()
    response = client.post(
        f"/api/v1/learning-requests/{body['id']}/precision",
        json={},
    )
    assert response.status_code == 422
    assert client.get(f"/api/v1/learning-requests/{body['id']}").json()["state"] == (
        "precision_required"
    )


def test_precision_rejects_unknown_option(client, fake_ai) -> None:
    body = create(client, fake_ai, needs_precision=True).json()
    response = client.post(
        f"/api/v1/learning-requests/{body['id']}/precision",
        json={"option_id": "not-an-option"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_precision_rejects_whitespace_free_text(client, fake_ai) -> None:
    body = create(client, fake_ai, needs_precision=True).json()
    response = client.post(
        f"/api/v1/learning-requests/{body['id']}/precision",
        json={"free_text": "   "},
    )
    assert response.status_code == 422


def test_precision_rejects_free_text_when_disallowed(client, fake_ai) -> None:
    payload = analysis(needs_precision=True, options=3)
    payload["precision"]["allows_free_text"] = False
    fake_ai.enqueue(RequestAnalysisOutput, payload)
    body = client.post("/api/v1/learning-requests", json=REQUEST_BODY).json()
    response = client.post(
        f"/api/v1/learning-requests/{body['id']}/precision",
        json={"free_text": "A custom focus on fiscal crisis."},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_state"


def test_whitespace_objective_revision_is_rejected(client, fake_ai) -> None:
    body = create(client, fake_ai).json()
    response = client.post(
        f"/api/v1/learning-requests/{body['id']}/objective/revisions",
        json={"feedback": "   "},
    )
    assert response.status_code == 422
    fetched = client.get(f"/api/v1/learning-requests/{body['id']}").json()
    assert fetched["objective"]["version"] == 1
    assert fetched["objective"]["confirmed"] is False


def test_whitespace_blueprint_revision_is_rejected(client, fake_ai) -> None:
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    bid = client.post(f"/api/v1/learning-requests/{rid}/blueprint").json()["id"]
    response = client.post(
        f"/api/v1/blueprints/{bid}/revisions", json={"feedback": "   "}
    )
    assert response.status_code == 422
    fetched = client.get(f"/api/v1/blueprints/{bid}").json()
    assert fetched["state"] == "awaiting_approval"
    assert fetched["current_version"] == 1
