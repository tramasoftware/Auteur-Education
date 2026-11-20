"""Commercial ledger, Stripe webhook and the disabled generation gate (DEC-024)."""

from __future__ import annotations

import json
from pathlib import Path

import stripe
from tests.conftest import TEST_USER_ID
from tests.fixtures import blueprint
from tests.test_blueprints import script_full_build, selected_request

from auteur_api.core.auth import VerifiedUser
from auteur_api.core.config import settings
from auteur_api.main import app
from auteur_api.modules.blueprints.schemas import BlueprintOutput
from auteur_api.modules.commercial.access import (
    get_commercial_ledger,
    get_stripe_gateway,
)
from auteur_api.modules.commercial.events import normalize
from auteur_api.modules.commercial.memory import (
    ONE_TIME_VERSION_ID,
    SUBSCRIPTION_VERSION_ID,
    MemoryCommercialLedger,
)
from auteur_api.modules.commercial.stripe_gateway import StripeSdkGateway

SECRET = "whsec_test_secret"
ROOT = Path(__file__).resolve().parents[3]


def _book() -> MemoryCommercialLedger:
    book = MemoryCommercialLedger()
    app.dependency_overrides[get_commercial_ledger] = lambda: book
    app.dependency_overrides[get_stripe_gateway] = lambda: StripeSdkGateway(
        "sk_test_x", SECRET
    )
    return book


def _clear() -> None:
    app.dependency_overrides.pop(get_commercial_ledger, None)
    app.dependency_overrides.pop(get_stripe_gateway, None)


def _signed(event: dict) -> tuple[bytes, dict[str, str]]:
    body = json.dumps(event)
    header = stripe.WebhookSignature.generate_signature_header(body, SECRET)
    return body.encode(), {"stripe-signature": header}


def _checkout_event(
    event_id: str = "evt_pay_1", *, user_id: str | None = TEST_USER_ID
) -> dict:
    metadata = {"offer_version_id": ONE_TIME_VERSION_ID}
    if user_id:
        metadata["user_id"] = user_id
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "created": 1_700_000_000,
        "data": {
            "object": {
                "id": "cs_test_1",
                "mode": "payment",
                "payment_status": "paid",
                "amount_total": 1100,
                "currency": "usd",
                "customer": "cus_test_1",
                "payment_intent": "pi_test_1",
                "metadata": metadata,
            }
        },
    }


def test_reserve_confirm_release_and_refund() -> None:
    book = MemoryCommercialLedger()
    user = TEST_USER_ID
    book.apply_event(normalize(_checkout_event()))
    assert book.account(user).balance == 1

    first = book.reserve_credits(
        user_id=user,
        subject_type="blueprint_version",
        subject_id="bp:1",
        rate_key="course_build",
        rate_version=1,
        credits=1,
    )
    assert first == "reserved"
    assert book.account(user).balance == 0
    assert (
        book.reserve_credits(
            user_id=user,
            subject_type="blueprint_version",
            subject_id="bp:1",
            rate_key="course_build",
            rate_version=1,
            credits=1,
        )
        == "already_held"
    )
    assert book.confirm_reservation(
        subject_type="blueprint_version", subject_id="bp:1", course_id="course-1"
    ) == "consumed"
    assert book.confirm_reservation(
        subject_type="blueprint_version", subject_id="bp:1", course_id="course-1"
    ) == "already_consumed"
    assert book.account(user).balance == 0
    assert book.refund_for_course("course-1") == "refunded"
    assert book.refund_for_course("course-1") == "already_refunded"
    assert book.account(user).balance == 1

    book.reserve_credits(
        user_id=user,
        subject_type="blueprint_version",
        subject_id="bp:2",
        rate_key="course_build",
        rate_version=1,
        credits=1,
    )
    released = book.release_reservation(
        subject_type="blueprint_version", subject_id="bp:2"
    )
    assert released == "released"
    assert book.account(user).balance == 1
    assert (
        book.reserve_credits(
            user_id="other",
            subject_type="blueprint_version",
            subject_id="bp:3",
            rate_key="course_build",
            rate_version=1,
            credits=1,
        )
        == "insufficient"
    )


def test_duplicate_payment_does_not_grant_twice() -> None:
    book = MemoryCommercialLedger()
    event = normalize(_checkout_event())
    assert book.apply_event(event) == "processed"
    assert book.apply_event(event) == "already_processed"
    assert book.account(TEST_USER_ID).balance == 1


def test_failed_event_can_be_retried() -> None:
    book = MemoryCommercialLedger()
    event = normalize(_checkout_event(user_id=None))
    assert book.apply_event(event) == "failed"
    assert book.account(TEST_USER_ID).balance == 0
    book.save_customer(TEST_USER_ID, "cus_test_1")
    assert book.apply_event(event) == "processed"
    assert book.account(TEST_USER_ID).balance == 1


def test_stripe_refund_does_not_restitute_credits() -> None:
    book = MemoryCommercialLedger()
    book.apply_event(normalize(_checkout_event()))
    refunded = normalize(
        {
            "id": "evt_refund_1",
            "type": "charge.refunded",
            "created": 1_700_000_100,
            "data": {
                "object": {
                    "id": "ch_1",
                    "amount": 1100,
                    "currency": "usd",
                    "customer": "cus_test_1",
                    "payment_intent": "pi_test_1",
                    "metadata": {"user_id": TEST_USER_ID},
                }
            },
        }
    )
    assert book.apply_event(refunded) == "processed"
    assert book.account(TEST_USER_ID).balance == 1
    assert book.payments[-1].status == "refunded"


def test_failed_invoice_grants_nothing_and_old_event_does_not_overwrite() -> None:
    book = MemoryCommercialLedger()
    paid = {
        "id": "evt_invoice_2",
        "type": "invoice.paid",
        "created": 200,
        "data": {
            "object": {
                "id": "in_1",
                "amount_paid": 2200,
                "currency": "usd",
                "customer": "cus_sub",
                "subscription": "sub_1",
                "status": "paid",
                "metadata": {
                    "user_id": TEST_USER_ID,
                    "offer_version_id": SUBSCRIPTION_VERSION_ID,
                },
                "lines": {"data": [{"period": {"start": 10, "end": 20}}]},
            }
        },
    }
    failed = {
        "id": "evt_invoice_1",
        "type": "invoice.payment_failed",
        "created": 100,
        "data": {
            "object": {
                "id": "in_0",
                "amount_due": 2200,
                "currency": "usd",
                "customer": "cus_sub",
                "subscription": "sub_1",
                "metadata": {"user_id": TEST_USER_ID},
            }
        },
    }
    assert book.apply_event(normalize(paid)) == "processed"
    assert book.apply_event(normalize(failed)) == "processed"
    assert book.account(TEST_USER_ID).balance == 1
    assert book.subscriptions["sub_1"].status == "active"


def test_webhook_rejects_a_bad_signature(client) -> None:
    _book()
    try:
        response = client.post(
            "/api/v1/billing/webhook",
            content=b"{}",
            headers={"stripe-signature": "t=1,v1=bad"},
        )
        assert response.status_code == 400
    finally:
        _clear()


def test_webhook_duplicate_does_not_grant_twice(client) -> None:
    book = _book()
    try:
        body, headers = _signed(_checkout_event())
        first = client.post("/api/v1/billing/webhook", content=body, headers=headers)
        second = client.post("/api/v1/billing/webhook", content=body, headers=headers)
        assert first.status_code == 200
        assert first.json()["status"] == "processed"
        assert second.status_code == 200
        assert second.json()["status"] == "already_processed"
        assert book.account(TEST_USER_ID).balance == 1
    finally:
        _clear()


def test_checkout_requires_a_permanent_user(open_client, monkeypatch) -> None:
    _book()
    monkeypatch.setattr(
        "auteur_api.core.auth.user_from_access_token",
        lambda token: VerifiedUser(id=TEST_USER_ID, is_anonymous=True),
    )
    try:
        response = open_client.post(
            "/api/v1/billing/checkout",
            json={"offer_version_id": ONE_TIME_VERSION_ID},
            headers={"Authorization": "Bearer anon"},
        )
        assert response.status_code == 401
    finally:
        _clear()


def test_checkout_without_a_price_is_not_configured(client) -> None:
    _book()
    try:
        response = client.post(
            "/api/v1/billing/checkout",
            json={"offer_version_id": ONE_TIME_VERSION_ID},
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "commercial_not_configured"
    finally:
        _clear()


def test_gate_off_does_not_call_the_ledger(client, fake_ai, monkeypatch) -> None:
    monkeypatch.setattr(settings, "commercial_gate_enabled", False)

    def forbidden():
        raise AssertionError("ledger called")

    monkeypatch.setattr(
        "auteur_api.modules.commercial.gate.get_commercial_ledger", forbidden
    )
    rid = selected_request(client, fake_ai)
    script_full_build(fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    started = client.post(f"/api/v1/learning-requests/{rid}/blueprint")
    assert started.status_code == 202
    assert started.json()["state"] == "approved"
    assert started.json()["course_id"]


def test_gate_on_with_no_credits_does_not_create_a_course(
    client, fake_ai, monkeypatch
) -> None:
    book = MemoryCommercialLedger()
    monkeypatch.setattr(settings, "commercial_gate_enabled", True)
    monkeypatch.setattr(
        "auteur_api.modules.commercial.gate.get_commercial_ledger", lambda: book
    )
    rid = selected_request(client, fake_ai)
    fake_ai.enqueue(BlueprintOutput, blueprint())
    started = client.post(f"/api/v1/learning-requests/{rid}/blueprint")
    assert started.status_code == 202
    assert started.json()["state"] == "failed"
    assert started.json()["course_id"] is None
    assert book.account(TEST_USER_ID).balance == 0
    assert book.reservations == {}


def test_sql_functions_are_not_executable_by_browser_roles() -> None:
    sql = (
        ROOT / "supabase" / "migrations" / "20261116230000_commercial_ledger.sql"
    ).read_text(encoding="utf-8")
    assert "revoke all on function public.grant_credits" in sql
    assert "revoke all on function public.apply_commercial_event(jsonb)" in sql
    assert "from public, anon, authenticated" in sql
    granted = (
        "grant execute on function public.apply_commercial_event(jsonb) "
        "to service_role"
    )
    assert granted in sql
    assert "grant execute on function public.grant_credits" not in sql
