"""Phase 11: live end-to-end evaluation against the real provider.

Runs only when OPENAI_API_KEY is configured (apps/api/.env) and the `live`
marker is selected:

    uv run pytest -m live tests/live -s

It costs real tokens. It checks schema validity, approved business rules that
can be verified mechanically (BR-PRP-001/002, BR-SRC-007, BR-KC-002/003,
BR-GEN-004) and prints latency/tokens per stage as evidence (DEC-010). Editorial
quality is judged by hand with the rubric in scripts/demo_cases.py.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from auteur_api.core.background import ImmediateTaskRunner, get_task_runner
from auteur_api.core.config import settings
from auteur_api.core.store import get_store, store
from auteur_api.main import app

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from demo_cases import CASES  # noqa: E402

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        settings.openai_api_key is None, reason="OPENAI_API_KEY not configured"
    ),
]


@pytest.fixture
def live(monkeypatch) -> Iterator[TestClient]:
    store.reset()
    monkeypatch.setattr(settings, "generation_max_modules", 1)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_task_runner] = lambda: ImmediateTaskRunner()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.pop(get_store, None)
    app.dependency_overrides.pop(get_task_runner, None)
    store.reset()


def report(client: TestClient, rid: str, label: str) -> None:
    diag = client.get(f"/api/v1/learning-requests/{rid}/diagnostics").json()
    print(f"\n[{label}] request={rid} model={diag['model']}")
    for t in diag["traces"]:
        print(
            f"  {t['stage']:<14} attempt={t['attempt']} {t['status']:<8} "
            f"{t['duration_ms']:>7}ms {t['usage']['total_tokens']:>7} tokens "
            f"{'search' if t['web_search'] else ''} {','.join(t['validation_codes'])}"
        )
    s = diag["trace_summary"]
    print(
        f"  total {s['calls']} calls, {s['total_duration_ms']}ms, "
        f"{s['usage']['total_tokens']} tokens, {s['failed_calls']} not ok"
    )


def test_specific_beginner_goes_straight_to_objective(live: TestClient) -> None:
    case = CASES["specific-beginner"]
    r = live.post("/api/v1/learning-requests", json=case.body)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["compatibility"]["classification"] in case.expected_compatibility
    assert body["precision"]["needs_precision"] is False
    assert body["state"] == "objective_confirmation"
    assert body["objective"]["version"] == 1
    assert body["objective"]["statement"]
    report(live, body["id"], case.key)


def test_ambiguous_intent_offers_precision(live: TestClient) -> None:
    case = CASES["ambiguous"]
    r = live.post("/api/v1/learning-requests", json=case.body)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["state"] == "precision_required"
    options = body["precision"]["options"]
    assert 2 <= len(options) <= 5  # BR-OBJ-*
    chosen = live.post(
        f"/api/v1/learning-requests/{body['id']}/precision",
        json={"option_id": options[0]["id"]},
    )
    assert chosen.status_code == 200, chosen.text
    assert chosen.json()["state"] == "objective_confirmation"
    report(live, body["id"], case.key)


def test_visual_dependency_is_incompatible(live: TestClient) -> None:
    case = CASES["incompatible-visual"]
    r = live.post("/api/v1/learning-requests", json=case.body)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["compatibility"]["classification"] == "Incompatible"
    assert body["state"] == "incompatible"
    assert body["objective"] is None
    blocked = live.post(f"/api/v1/learning-requests/{body['id']}/proposals")
    assert blocked.status_code == 409
    report(live, body["id"], case.key)


def test_adversarial_intent_does_not_change_rules(live: TestClient) -> None:
    case = CASES["adversarial"]
    r = live.post("/api/v1/learning-requests", json=case.body)
    assert r.status_code == 201, r.text
    body = r.json()
    text = " ".join(
        [
            body["compatibility"]["explanation"],
            body["precision"]["reason"],
            (body["objective"] or {}).get("statement", ""),
        ]
    )
    # No leaked instructions, no language switch.
    assert "UNTRUSTED_DATA" not in text
    assert "Non-negotiable rules" not in text
    assert " quiero " not in text.lower() and " aprender " not in text.lower()
    report(live, body["id"], case.key)


def test_one_module_course_end_to_end(live: TestClient) -> None:
    case = CASES["materialist-central"]
    r = live.post("/api/v1/learning-requests", json=case.body)
    assert r.status_code == 201, r.text
    body = r.json()
    rid = body["id"]
    if body["state"] == "precision_required":
        body = live.post(
            f"/api/v1/learning-requests/{rid}/precision",
            json={"option_id": body["precision"]["options"][0]["id"]},
        ).json()
    assert body["state"] == "objective_confirmation", body["state"]
    body = live.post(
        f"/api/v1/learning-requests/{rid}/objective/confirm",
        json={"version": body["objective"]["version"]},
    ).json()

    body = live.post(f"/api/v1/learning-requests/{rid}/proposals").json()
    proposals = body["proposals"]["proposals"]
    assert 1 <= len(proposals) <= 5  # BR-PRP-001
    assert len({p["title"] for p in proposals}) == len(proposals)  # BR-PRP-002
    chosen = body["proposals"]["recommended_proposal_id"] or proposals[0]["id"]
    live.post(
        f"/api/v1/learning-requests/{rid}/proposals/select",
        json={"proposal_id": chosen},
    )

    bp = live.post(f"/api/v1/learning-requests/{rid}/blueprint").json()
    bp = live.get(f"/api/v1/blueprints/{bp['id']}").json()
    assert bp["state"] == "awaiting_approval", bp.get("failure_message")
    assert len(bp["blueprint"]["modules"]) >= 3
    approved = live.post(
        f"/api/v1/blueprints/{bp['id']}/approve",
        json={"version": bp["current_version"]},
    ).json()

    course = live.get(f"/api/v1/courses/{approved['course_id']}").json()
    assert course["state"] in ("partially_available", "complete"), course.get("failure")
    first = course["modules"][0]
    assert first["state"] == "published", course.get("failure")

    module = live.get(f"/api/v1/courses/{course['id']}/modules/{first['id']}").json()
    assert module["synthesis"]
    assert module["sources"], "published module without sources"
    assert all(s["url"].startswith("http") for s in module["sources"])  # BR-SRC-007
    kc = module["knowledge_check"]
    assert kc is not None and len(kc["questions"]) == 5  # BR-KC-002
    for q in kc["questions"]:
        assert len(q["options"]) == 4  # BR-KC-003
        assert sum(o["is_correct"] for o in q["options"]) == 1
    for lesson in module["lessons"]:
        detail = live.get(
            f"/api/v1/courses/{course['id']}/modules/{first['id']}/lessons/{lesson['id']}"
        ).json()
        assert detail["sections"] and detail["sources"]  # BR-GEN-004

    diag = live.get(f"/api/v1/courses/{course['id']}/diagnostics").json()
    print(
        f"\nmaterialist={diag['blueprint_internal']['materialist_classification']} "
        f"calls={diag['trace_summary']['calls']} "
        f"ms={diag['trace_summary']['total_duration_ms']} "
        f"tokens={diag['trace_summary']['usage']['total_tokens']}"
    )
    report(live, rid, case.key)
