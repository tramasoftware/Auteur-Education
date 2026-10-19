"""Phases 3-4: intention analysis, precision and objective (UF-01..03)."""

from __future__ import annotations

from tests.fixtures import REQUEST_BODY, analysis, objective, recovery_alternatives

from auteur_api.modules.onboarding.prompts import ANALYZE_REQUEST_INSTRUCTIONS
from auteur_api.modules.onboarding.schemas import (
    CompatibilityAssessment,
    Interpretation,
    LearningObjectiveOutput,
    RecoveryAlternative,
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
    assert body["learning_orientation"] == "theoretical"


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
    # BR-OBJ-004 / DEC-016: the rejected request does not continue, and offers
    # three new intentions instead.
    response = create(client, fake_ai, classification="Incompatible")
    assert response.status_code == 201
    body = response.json()
    assert body["state"] == "incompatible"
    assert body["objective"] is None
    alternatives = body["compatibility"]["recovery_alternatives"]
    assert len(alternatives) == 3
    assert alternatives[0]["title"]
    assert alternatives[0]["explanation"]
    assert alternatives[0]["suggested_intent"]
    assert alternatives[0]["suggested_outcome"]
    precision = client.post(
        f"/api/v1/learning-requests/{body['id']}/precision",
        json={"option_id": "x"},
    )
    assert precision.status_code == 409


def test_recovery_alternative_count_is_retried(client, fake_ai) -> None:
    fake_ai.enqueue(
        RequestAnalysisOutput,
        analysis(classification="Incompatible", alternatives=recovery_alternatives(2)),
    )
    fake_ai.enqueue(RequestAnalysisOutput, analysis(classification="Incompatible"))
    response = client.post("/api/v1/learning-requests", json=REQUEST_BODY)
    assert response.status_code == 201
    assert len(response.json()["compatibility"]["recovery_alternatives"]) == 3
    assert "recovery_alternatives_count" in fake_ai.calls[1]["input"]


def test_allowed_request_with_recovery_alternatives_is_retried(client, fake_ai) -> None:
    fake_ai.enqueue(
        RequestAnalysisOutput,
        analysis(alternatives=recovery_alternatives(1)),
    )
    fake_ai.enqueue(RequestAnalysisOutput, analysis())
    fake_ai.enqueue(LearningObjectiveOutput, objective())
    response = client.post("/api/v1/learning-requests", json=REQUEST_BODY)
    assert response.status_code == 201
    assert response.json()["compatibility"]["recovery_alternatives"] == []
    assert "recovery_alternatives_not_allowed" in fake_ai.calls[1]["input"]


def test_weapons_incompatible_has_no_recovery_alternatives(client, fake_ai) -> None:
    # BR-OBJ-005: weapons and security stay a hard rejection.
    fake_ai.enqueue(
        RequestAnalysisOutput,
        analysis(
            classification="Incompatible",
            risk="weapons",
            alternatives=recovery_alternatives(),
        ),
    )
    fake_ai.enqueue(
        RequestAnalysisOutput,
        analysis(classification="Incompatible", risk="weapons"),
    )
    response = client.post("/api/v1/learning-requests", json=REQUEST_BODY)
    assert response.status_code == 201
    body = response.json()
    assert body["state"] == "incompatible"
    assert body["objective"] is None
    assert body["compatibility"]["risk_category"] == "weapons"
    assert body["compatibility"]["recovery_alternatives"] == []
    assert "recovery_alternatives_not_allowed" in fake_ai.calls[1]["input"]


def test_recovery_alternative_without_outcome_is_retried(client, fake_ai) -> None:
    incomplete = recovery_alternatives()
    incomplete[0]["suggested_outcome"] = "  "
    fake_ai.enqueue(
        RequestAnalysisOutput,
        analysis(classification="Incompatible", alternatives=incomplete),
    )
    fake_ai.enqueue(RequestAnalysisOutput, analysis(classification="Incompatible"))
    response = client.post("/api/v1/learning-requests", json=REQUEST_BODY)
    assert response.status_code == 201
    outcome = response.json()["compatibility"]["recovery_alternatives"][0][
        "suggested_outcome"
    ]
    assert outcome.strip()
    assert "recovery_alternatives_incomplete" in fake_ai.calls[1]["input"]


def test_saved_recovery_alternative_without_outcome_stays_readable() -> None:
    loaded = RecoveryAlternative.model_validate(
        {
            "title": "Direction",
            "explanation": "A related intention.",
            "suggested_intent": "I want to understand the criteria.",
        }
    )
    assert loaded.suggested_outcome == ""


def test_saved_compatibility_without_recovery_alternatives_defaults_empty() -> None:
    loaded = CompatibilityAssessment.model_validate(
        {
            "classification": "Incompatible",
            "explanation": "The result needs a demonstration.",
            "compatible_aspects": [],
            "unreachable_aspects": ["performing the skill"],
            "safe_reframing": None,
            "risk_category": None,
        }
    )
    assert loaded.recovery_alternatives == []


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


def test_applied_orientation_is_stored_and_returned(client, fake_ai) -> None:
    response = create(client, fake_ai, orientation="applied")
    assert response.status_code == 201
    assert response.json()["learning_orientation"] == "applied"


def test_saved_interpretation_without_orientation_stays_theoretical() -> None:
    loaded = Interpretation.model_validate(
        {
            "interpreted_intention": "Understand a field.",
            "learning_domain": "History",
            "explicitly_stated": [],
            "reasonably_inferred": [],
            "ambiguities": [],
        }
    )
    assert loaded.learning_orientation == "theoretical"


def test_compatibility_prompt_treats_applied_foundations_as_allowed() -> None:
    text = ANALYZE_REQUEST_INSTRUCTIONS
    assert "personal branding" in text
    assert "Photoshop" in text
    assert "learning_orientation" in text
    assert "recovery_alternatives" in text
    assert "suggested_outcome" in text
    assert "What do you want to be able to do or understand?" in text
    assert "Do not rescue an applied request as the history" in text
    assert "Do not choose the class that lets a practical request continue" not in text


def test_provider_failure_is_safe(client, fake_ai) -> None:
    from auteur_api.ai.client import GenerationError

    fake_ai.enqueue(RequestAnalysisOutput, GenerationError("provider", "timeout"))
    response = client.post("/api/v1/learning-requests", json=REQUEST_BODY)
    assert response.status_code == 503
    body = response.json()["error"]
    assert body["code"] == "provider_unavailable"
    assert "timeout" not in body["message"]
