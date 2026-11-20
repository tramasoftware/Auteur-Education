"""Turn a verified Stripe event into the small command the ledger applies."""

from __future__ import annotations

import re
from typing import Any

_UUID = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def normalize(event: dict[str, Any]) -> dict[str, Any]:
    obj = _mapping(event.get("data", {}).get("object"))
    kind = event.get("type") or ""
    return {
        "event_id": event.get("id"),
        "event_type": kind,
        "created": int(event.get("created") or 0),
        "effect": _effect(kind, obj),
    }


def _effect(event_type: str, obj: dict[str, Any]) -> dict[str, Any]:
    meta = _metadata(obj)
    user_id = _uuid(meta.get("user_id"))
    offer_version_id = _uuid(meta.get("offer_version_id"))
    customer_id = _stripe_id(obj.get("customer"))
    if event_type == "checkout.session.completed":
        return _checkout(obj, user_id, offer_version_id, customer_id)
    if event_type == "invoice.paid":
        return _invoice(obj, user_id, offer_version_id, customer_id, paid=True)
    if event_type == "invoice.payment_failed":
        return _invoice(obj, user_id, offer_version_id, customer_id, paid=False)
    if event_type == "customer.subscription.updated":
        return _subscription(obj, user_id, offer_version_id, customer_id, deleted=False)
    if event_type == "customer.subscription.deleted":
        return _subscription(obj, user_id, offer_version_id, customer_id, deleted=True)
    if event_type == "charge.refunded":
        return {
            "kind": "charge_refunded",
            "user_id": user_id,
            "stripe_customer_id": customer_id,
            "stripe_charge_id": obj.get("id"),
            "stripe_payment_intent_id": _stripe_id(obj.get("payment_intent")),
            "stripe_invoice_id": _stripe_id(obj.get("invoice")),
            "amount_cents": obj.get("amount"),
            "currency": _currency(obj.get("currency")),
        }
    return {"kind": "ignore"}


def _checkout(
    obj: dict[str, Any],
    user_id: str | None,
    offer_version_id: str | None,
    customer_id: str | None,
) -> dict[str, Any]:
    mode = obj.get("mode")
    base = {
        "user_id": user_id,
        "offer_version_id": offer_version_id,
        "stripe_customer_id": customer_id,
        "stripe_checkout_session_id": obj.get("id"),
        "amount_cents": obj.get("amount_total"),
        "currency": _currency(obj.get("currency")),
    }
    if mode == "payment":
        if obj.get("payment_status") != "paid":
            return {"kind": "ignore"}
        return {
            "kind": "one_time_paid",
            "stripe_payment_intent_id": _stripe_id(obj.get("payment_intent")),
            **base,
        }
    if mode == "subscription":
        period_start, period_end = _period(obj)
        return {
            "kind": "subscription_started",
            "stripe_subscription_id": _stripe_id(obj.get("subscription")),
            "status": "active" if obj.get("payment_status") == "paid" else "incomplete",
            "period_start": period_start,
            "period_end": period_end,
            "cancel_at_period_end": False,
            **base,
        }
    return {"kind": "ignore"}


def _invoice(
    obj: dict[str, Any],
    user_id: str | None,
    offer_version_id: str | None,
    customer_id: str | None,
    *,
    paid: bool,
) -> dict[str, Any]:
    period_start, period_end = _line_period(obj)
    return {
        "kind": "invoice_paid" if paid else "invoice_failed",
        "user_id": user_id,
        "offer_version_id": offer_version_id,
        "stripe_customer_id": customer_id,
        "stripe_invoice_id": obj.get("id"),
        "stripe_payment_intent_id": _stripe_id(obj.get("payment_intent")),
        "stripe_subscription_id": _invoice_subscription(obj),
        "amount_cents": obj.get("amount_paid") if paid else obj.get("amount_due"),
        "currency": _currency(obj.get("currency")),
        "status": "active" if paid else "past_due",
        "period_start": period_start,
        "period_end": period_end,
        "cancel_at_period_end": False,
    }


def _subscription(
    obj: dict[str, Any],
    user_id: str | None,
    offer_version_id: str | None,
    customer_id: str | None,
    *,
    deleted: bool,
) -> dict[str, Any]:
    period_start, period_end = _period(obj)
    return {
        "kind": "subscription_deleted" if deleted else "subscription_updated",
        "user_id": user_id,
        "offer_version_id": offer_version_id,
        "stripe_customer_id": customer_id,
        "stripe_subscription_id": obj.get("id"),
        "status": "canceled" if deleted else obj.get("status"),
        "period_start": period_start,
        "period_end": period_end,
        "cancel_at_period_end": bool(obj.get("cancel_at_period_end")),
    }


def _invoice_subscription(obj: dict[str, Any]) -> str | None:
    direct = _stripe_id(obj.get("subscription"))
    if direct:
        return direct
    parent = _mapping(obj.get("parent"))
    details = _mapping(parent.get("subscription_details"))
    return _stripe_id(details.get("subscription"))


def _metadata(obj: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    parent = _mapping(obj.get("parent"))
    details = _mapping(parent.get("subscription_details"))
    merged.update(_mapping(details.get("metadata")))
    merged.update(_mapping(_mapping(obj.get("subscription_details")).get("metadata")))
    merged.update(_mapping(obj.get("metadata")))
    return merged


def _period(obj: dict[str, Any]) -> tuple[int | None, int | None]:
    start = obj.get("current_period_start")
    end = obj.get("current_period_end")
    if start is None or end is None:
        items = _mapping(obj.get("items")).get("data") or []
        if items:
            item = _mapping(items[0])
            start = start if start is not None else item.get("current_period_start")
            end = end if end is not None else item.get("current_period_end")
    return _int(start), _int(end)


def _line_period(obj: dict[str, Any]) -> tuple[int | None, int | None]:
    lines = _mapping(obj.get("lines")).get("data") or []
    if not lines:
        return None, None
    period = _mapping(_mapping(lines[0]).get("period"))
    return _int(period.get("start")), _int(period.get("end"))


def _mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _stripe_id(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        found = value.get("id")
        if isinstance(found, str) and found:
            return found
    return None


def _uuid(value: Any) -> str | None:
    if isinstance(value, str) and _UUID.match(value):
        return value
    return None


def _currency(value: Any) -> str:
    if isinstance(value, str) and value:
        return value.lower()
    return "usd"


def _int(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    return None
