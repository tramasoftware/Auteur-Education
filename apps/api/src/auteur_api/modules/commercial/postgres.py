"""Postgres commercial store. Balance changes go through SQL functions."""

from __future__ import annotations

import logging
from typing import Any

from supabase import Client

from auteur_api.core.errors import ApiError
from auteur_api.modules.commercial.models import (
    AccountRecord,
    MovementRecord,
    OfferRecord,
    PaymentView,
    RateRecord,
    SubscriptionView,
)

logger = logging.getLogger("auteur_api.commercial")

_OFFER_COLUMNS = (
    "id, version, credits, currency, amount_cents, stripe_price_id, "
    "provisional, active, "
    "commercial_offers(code, display_name, kind, active)"
)


class PostgresCommercialLedger:
    def __init__(self, client: Client) -> None:
        self._client = client

    def list_offers(self) -> list[OfferRecord]:
        rows = self._rows(
            self._client.table("commercial_offer_versions")
            .select(_OFFER_COLUMNS)
            .eq("active", True)
            .execute()
            .data
        )
        offers: list[OfferRecord] = []
        for row in rows:
            parent = row.get("commercial_offers") or {}
            if not parent.get("active"):
                continue
            offers.append(_offer(row, parent))
        return offers

    def get_offer_version(self, version_id: str) -> OfferRecord | None:
        data = (
            self._client.table("commercial_offer_versions")
            .select(_OFFER_COLUMNS)
            .eq("id", version_id)
            .limit(1)
            .execute()
            .data
        )
        rows = self._rows(data)
        if not rows:
            return None
        parent = rows[0].get("commercial_offers") or {}
        return _offer(rows[0], parent)

    def active_rate(self, rate_key: str) -> RateRecord | None:
        data = (
            self._client.table("consumption_rates")
            .select("rate_key, version, credits, active")
            .eq("rate_key", rate_key)
            .eq("active", True)
            .limit(1)
            .execute()
            .data
        )
        rows = self._rows(data)
        if not rows:
            return None
        row = rows[0]
        return RateRecord(
            rate_key=row["rate_key"],
            version=row["version"],
            credits=row["credits"],
            active=bool(row["active"]),
        )

    def account(self, user_id: str) -> AccountRecord:
        balance_rows = self._rows(
            self._client.table("credit_accounts")
            .select("balance")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
        )
        balance = int(balance_rows[0]["balance"]) if balance_rows else 0
        customer = self.customer_id(user_id)
        payments = [
            PaymentView(
                status=row["status"],
                amount_cents=row["amount_cents"],
                currency=row["currency"],
                created_at=str(row["created_at"]),
            )
            for row in self._rows(
                self._client.table("payments")
                .select("status, amount_cents, currency, created_at")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(20)
                .execute()
                .data
            )
        ]
        movements = [
            MovementRecord(
                entry_type=row["entry_type"],
                credits=row["credits"],
                delta=row["delta"],
                created_at=str(row["created_at"]),
            )
            for row in self._rows(
                self._client.table("credit_ledger")
                .select("entry_type, credits, delta, created_at")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(20)
                .execute()
                .data
            )
        ]
        subscription_rows = self._rows(
            self._client.table("subscriptions")
            .select("status, cancel_at_period_end, current_period_end, updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        subscription = None
        if subscription_rows:
            row = subscription_rows[0]
            subscription = SubscriptionView(
                status=row["status"],
                cancel_at_period_end=bool(row["cancel_at_period_end"]),
                current_period_end=(
                    None
                    if row.get("current_period_end") is None
                    else str(row["current_period_end"])
                ),
            )
        return AccountRecord(
            balance=balance,
            has_customer=customer is not None,
            subscription=subscription,
            payments=payments,
            movements=movements,
        )

    def customer_id(self, user_id: str) -> str | None:
        rows = self._rows(
            self._client.table("stripe_customers")
            .select("stripe_customer_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            return None
        return rows[0]["stripe_customer_id"]

    def save_customer(self, user_id: str, customer_id: str) -> str:
        existing = self.customer_id(user_id)
        if existing:
            return existing
        self._client.table("stripe_customers").insert(
            {"user_id": user_id, "stripe_customer_id": customer_id}
        ).execute()
        return customer_id

    def save_checkout(
        self,
        *,
        user_id: str,
        offer_version_id: str,
        checkout_session_id: str,
        mode: str,
        amount_cents: int,
        currency: str,
    ) -> None:
        self._client.table("checkout_sessions").insert(
            {
                "user_id": user_id,
                "offer_version_id": offer_version_id,
                "stripe_checkout_session_id": checkout_session_id,
                "status": "pending",
                "mode": mode,
            }
        ).execute()
        self._client.table("payments").insert(
            {
                "user_id": user_id,
                "offer_version_id": offer_version_id,
                "stripe_checkout_session_id": checkout_session_id,
                "amount_cents": amount_cents,
                "currency": currency,
                "status": "pending",
            }
        ).execute()

    def apply_event(self, event: dict) -> str:
        data = self._rpc("apply_commercial_event", {"p_event": event})
        if isinstance(data, dict):
            return str(data.get("status") or "failed")
        return "failed"

    def reserve_credits(
        self,
        *,
        user_id: str,
        subject_type: str,
        subject_id: str,
        rate_key: str,
        rate_version: int,
        credits: int,
    ) -> str:
        return str(
            self._rpc(
                "reserve_credits",
                {
                    "p_user_id": user_id,
                    "p_subject_type": subject_type,
                    "p_subject_id": subject_id,
                    "p_rate_key": rate_key,
                    "p_rate_version": rate_version,
                    "p_credits": credits,
                },
            )
        )

    def confirm_reservation(
        self, *, subject_type: str, subject_id: str, course_id: str
    ) -> str:
        return str(
            self._rpc(
                "confirm_reservation",
                {
                    "p_subject_type": subject_type,
                    "p_subject_id": subject_id,
                    "p_course_id": course_id,
                },
            )
        )

    def release_reservation(self, *, subject_type: str, subject_id: str) -> str:
        return str(
            self._rpc(
                "release_reservation",
                {"p_subject_type": subject_type, "p_subject_id": subject_id},
            )
        )

    def refund_for_course(self, course_id: str) -> str:
        return str(
            self._rpc("refund_reservation_for_course", {"p_course_id": course_id})
        )

    def _rpc(self, name: str, params: dict[str, Any]) -> Any:
        try:
            result = self._client.rpc(name, params).execute()
        except Exception:
            logger.info("commercial_rpc_failed name=%s", name)
            raise ApiError(
                "provider_unavailable",
                "Billing is not available right now.",
            ) from None
        data = result.data
        if isinstance(data, list):
            return data[0] if data else None
        return data

    def _rows(self, data: Any) -> list[dict[str, Any]]:
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]


def _offer(row: dict[str, Any], parent: dict[str, Any]) -> OfferRecord:
    price = row.get("stripe_price_id")
    return OfferRecord(
        version_id=str(row["id"]),
        code=parent.get("code") or "",
        display_name=parent.get("display_name") or "",
        kind=parent.get("kind") or "",
        version=row["version"],
        credits=row["credits"],
        currency=row["currency"],
        amount_cents=row["amount_cents"],
        stripe_price_id=price or None,
        provisional=bool(row["provisional"]),
        active=bool(row["active"]) and bool(parent.get("active")),
    )

