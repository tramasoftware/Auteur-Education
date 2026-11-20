"""In-memory commercial ledger for tests. Production uses the SQL functions."""

from __future__ import annotations

from datetime import UTC, datetime
from threading import Lock

from auteur_api.modules.commercial.models import (
    AccountRecord,
    LedgerEntry,
    MovementRecord,
    OfferRecord,
    PaymentRow,
    PaymentView,
    RateRecord,
    Reservation,
    StoredEvent,
    SubscriptionRow,
    SubscriptionView,
)

ONE_TIME_VERSION_ID = "11111111-1111-4111-8111-111111111112"
SUBSCRIPTION_VERSION_ID = "22222222-2222-4222-8222-222222222222"


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _seed_offers() -> list[OfferRecord]:
    return [
        OfferRecord(
            version_id=ONE_TIME_VERSION_ID,
            code="sandbox_one_time",
            display_name="One course (sandbox)",
            kind="one_time",
            version=1,
            credits=1,
            currency="usd",
            amount_cents=1100,
            stripe_price_id=None,
            provisional=True,
            active=True,
        ),
        OfferRecord(
            version_id=SUBSCRIPTION_VERSION_ID,
            code="sandbox_subscription",
            display_name="Monthly (sandbox)",
            kind="subscription",
            version=1,
            credits=1,
            currency="usd",
            amount_cents=2200,
            stripe_price_id=None,
            provisional=True,
            active=True,
        ),
    ]


class MemoryCommercialLedger:
    """Same outcomes as the SQL functions, without a database."""

    def __init__(self) -> None:
        self._lock = Lock()
        self.offers = _seed_offers()
        self.rate = RateRecord(
            rate_key="course_build", version=1, credits=1, active=True
        )
        self.customers: dict[str, str] = {}
        self.users_by_customer: dict[str, str] = {}
        self.balances: dict[str, int] = {}
        self.grants: set[tuple[str, str]] = set()
        self.reservations: dict[tuple[str, str], Reservation] = {}
        self.entries: list[LedgerEntry] = []
        self.payments: list[PaymentRow] = []
        self.subscriptions: dict[str, SubscriptionRow] = {}
        self.events: dict[str, StoredEvent] = {}
        self.checkouts: dict[str, str] = {}

    def list_offers(self) -> list[OfferRecord]:
        return [offer for offer in self.offers if offer.active]

    def get_offer_version(self, version_id: str) -> OfferRecord | None:
        return next(
            (offer for offer in self.offers if offer.version_id == version_id), None
        )

    def active_rate(self, rate_key: str) -> RateRecord | None:
        if self.rate.active and self.rate.rate_key == rate_key:
            return self.rate
        return None

    def account(self, user_id: str) -> AccountRecord:
        with self._lock:
            subscription = self._latest_subscription(user_id)
            payments = [
                PaymentView(
                    status=row.status,
                    amount_cents=row.amount_cents,
                    currency=row.currency,
                    created_at=row.created_at,
                )
                for row in reversed(self.payments)
                if row.user_id == user_id
            ][:20]
            movements = [
                MovementRecord(
                    entry_type=entry.entry_type,
                    credits=entry.credits,
                    delta=entry.delta,
                    created_at=entry.created_at,
                )
                for entry in reversed(self.entries)
                if entry.user_id == user_id
            ][:20]
            period_end = None
            if subscription and subscription.current_period_end is not None:
                period_end = datetime.fromtimestamp(
                    subscription.current_period_end, UTC
                ).isoformat()
            return AccountRecord(
                balance=self.balances.get(user_id, 0),
                has_customer=user_id in self.customers,
                subscription=(
                    None
                    if subscription is None
                    else SubscriptionView(
                        status=subscription.status,
                        cancel_at_period_end=subscription.cancel_at_period_end,
                        current_period_end=period_end,
                    )
                ),
                payments=payments,
                movements=movements,
            )

    def customer_id(self, user_id: str) -> str | None:
        return self.customers.get(user_id)

    def save_customer(self, user_id: str, customer_id: str) -> str:
        with self._lock:
            current = self.customers.get(user_id)
            if current:
                return current
            self.customers[user_id] = customer_id
            self.users_by_customer[customer_id] = user_id
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
        del mode
        with self._lock:
            self.checkouts[checkout_session_id] = "pending"
            self.payments.append(
                PaymentRow(
                    user_id=user_id,
                    status="pending",
                    amount_cents=amount_cents,
                    currency=currency,
                    offer_version_id=offer_version_id,
                    stripe_checkout_session_id=checkout_session_id,
                    created_at=_now(),
                )
            )

    def apply_event(self, event: dict) -> str:
        with self._lock:
            event_id = event.get("event_id")
            if not event_id:
                raise ValueError("missing event_id")
            current = self.events.get(event_id)
            if current and current.status == "processed":
                return "already_processed"
            if current is None:
                current = StoredEvent(status="processing", payload=event)
                self.events[event_id] = current
            try:
                self._effect(event)
            except Exception as exc:
                current.status = "failed"
                current.error = str(exc)[:500]
                current.attempts += 1
                return "failed"
            current.status = "processed"
            current.error = None
            current.attempts += 1
            return "processed"

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
        with self._lock:
            self.balances.setdefault(user_id, 0)
            key = (subject_type, subject_id)
            existing = self.reservations.get(key)
            if existing and existing.status == "held":
                return "already_held"
            if existing and existing.status == "consumed":
                return "already_consumed"
            if existing and existing.status == "refunded":
                return "already_refunded"
            if self.balances[user_id] < credits:
                return "insufficient"
            if existing and existing.status == "released":
                existing.status = "held"
                existing.credits = credits
                existing.rate_key = rate_key
                existing.rate_version = rate_version
                existing.course_id = None
            else:
                self.reservations[key] = Reservation(
                    user_id=user_id,
                    subject_type=subject_type,
                    subject_id=subject_id,
                    rate_key=rate_key,
                    rate_version=rate_version,
                    credits=credits,
                    status="held",
                )
            self.balances[user_id] -= credits
            self._entry(
                user_id, "reserve", credits, -credits, subject_type, subject_id
            )
            return "reserved"

    def confirm_reservation(
        self, *, subject_type: str, subject_id: str, course_id: str
    ) -> str:
        with self._lock:
            row = self.reservations.get((subject_type, subject_id))
            if row is None:
                return "missing"
            if row.status == "consumed":
                if row.course_id is None:
                    row.course_id = course_id
                return "already_consumed"
            if row.status != "held":
                return row.status
            row.status = "consumed"
            row.course_id = course_id
            self._entry(
                row.user_id, "consume", row.credits, 0, subject_type, subject_id
            )
            return "consumed"

    def release_reservation(self, *, subject_type: str, subject_id: str) -> str:
        with self._lock:
            row = self.reservations.get((subject_type, subject_id))
            if row is None:
                return "missing"
            if row.status == "released":
                return "already_released"
            if row.status != "held":
                return row.status
            row.status = "released"
            self.balances[row.user_id] = self.balances.get(row.user_id, 0) + row.credits
            self._entry(
                row.user_id,
                "release",
                row.credits,
                row.credits,
                subject_type,
                subject_id,
            )
            return "released"

    def refund_for_course(self, course_id: str) -> str:
        with self._lock:
            matches = [
                row for row in self.reservations.values() if row.course_id == course_id
            ]
            if not matches:
                return "missing"
            row = matches[-1]
            if row.status == "refunded":
                return "already_refunded"
            if row.status != "consumed":
                return row.status
            row.status = "refunded"
            self.balances[row.user_id] = self.balances.get(row.user_id, 0) + row.credits
            self._entry(
                row.user_id, "refund", row.credits, row.credits, "course", course_id
            )
            return "refunded"

    def _effect(self, event: dict) -> None:
        effect = event.get("effect") or {}
        kind = effect.get("kind")
        if kind in (None, "ignore"):
            return
        if kind == "unresolved":
            raise RuntimeError("unresolved commercial event")
        user_id = self._resolve_user(effect)
        offer_id = effect.get("offer_version_id") or self._offer_for_subscription(
            effect.get("stripe_subscription_id")
        )
        if kind == "charge_refunded":
            if user_id is None and not self._find_payment(effect):
                raise RuntimeError("unresolved customer")
            self._upsert_payment(user_id or "", effect, "refunded", offer_id)
            return
        if user_id is None:
            raise RuntimeError("unresolved customer")
        if kind in {
            "subscription_started",
            "subscription_updated",
            "subscription_deleted",
            "invoice_failed",
        }:
            status = effect.get("status")
            if kind == "subscription_deleted":
                status = "canceled"
            elif kind == "invoice_failed":
                status = "past_due"
            self._upsert_subscription(user_id, effect, offer_id, status, event)
        if kind == "invoice_failed":
            self._upsert_payment(user_id, effect, "failed", offer_id)
            return
        if kind in {
            "subscription_deleted",
            "subscription_updated",
            "subscription_started",
        }:
            session_id = effect.get("stripe_checkout_session_id")
            if kind == "subscription_started" and session_id:
                self.checkouts[session_id] = "completed"
            return
        if kind not in {"one_time_paid", "invoice_paid"}:
            raise RuntimeError("unknown commercial effect")
        offer = self.get_offer_version(offer_id) if offer_id else None
        if offer is None:
            raise RuntimeError("offer version missing")
        if kind == "invoice_paid":
            self._upsert_subscription(
                user_id,
                effect,
                offer.version_id,
                effect.get("status") or "active",
                event,
            )
        session_id = effect.get("stripe_checkout_session_id")
        if kind == "one_time_paid" and session_id:
            self.checkouts[session_id] = "completed"
        self._upsert_payment(user_id, effect, "succeeded", offer.version_id)
        amount = int(effect.get("amount_cents") or 0)
        if amount <= 0 or self._payment_was_refunded(effect):
            return
        source_type = "subscription_invoice" if kind == "invoice_paid" else "payment"
        source_id = (
            effect.get("stripe_invoice_id")
            if kind == "invoice_paid"
            else effect.get("stripe_payment_intent_id")
            or effect.get("stripe_checkout_session_id")
        )
        self._grant(user_id, source_type, source_id, offer.credits, offer.version_id)

    def _grant(
        self,
        user_id: str,
        source_type: str,
        source_id: str | None,
        credits: int,
        offer_version_id: str,
    ) -> None:
        del offer_version_id
        if not source_id:
            raise RuntimeError("missing grant source")
        key = (source_type, source_id)
        if key in self.grants:
            return
        self.grants.add(key)
        self.balances[user_id] = self.balances.get(user_id, 0) + credits
        self._entry(user_id, "grant", credits, credits, source_type, source_id)

    def _resolve_user(self, effect: dict) -> str | None:
        user_id = effect.get("user_id")
        if user_id:
            return user_id
        customer_id = effect.get("stripe_customer_id")
        if customer_id and customer_id in self.users_by_customer:
            return self.users_by_customer[customer_id]
        subscription_id = effect.get("stripe_subscription_id")
        row = self.subscriptions.get(subscription_id) if subscription_id else None
        return row.user_id if row else None

    def _offer_for_subscription(self, subscription_id: str | None) -> str | None:
        if not subscription_id:
            return None
        row = self.subscriptions.get(subscription_id)
        return row.offer_version_id if row else None

    def _upsert_subscription(
        self,
        user_id: str,
        effect: dict,
        offer_id: str | None,
        status: str | None,
        event: dict,
    ) -> None:
        subscription_id = effect.get("stripe_subscription_id")
        if not subscription_id:
            return
        created = int(event.get("created") or 0)
        current = self.subscriptions.get(subscription_id)
        if current is None:
            self.subscriptions[subscription_id] = SubscriptionRow(
                user_id=user_id,
                stripe_subscription_id=subscription_id,
                stripe_customer_id=effect.get("stripe_customer_id") or "",
                offer_version_id=offer_id,
                status=status or "incomplete",
                current_period_start=effect.get("period_start"),
                current_period_end=effect.get("period_end"),
                cancel_at_period_end=bool(effect.get("cancel_at_period_end") or False),
                last_event_created=created,
                updated_at=_now(),
            )
            return
        if created < current.last_event_created:
            if current.offer_version_id is None:
                current.offer_version_id = offer_id
            return
        if status:
            current.status = status
        if effect.get("stripe_customer_id"):
            current.stripe_customer_id = effect["stripe_customer_id"]
        if offer_id:
            current.offer_version_id = offer_id
        if effect.get("period_start") is not None:
            current.current_period_start = effect["period_start"]
        if effect.get("period_end") is not None:
            current.current_period_end = effect["period_end"]
        if "cancel_at_period_end" in effect:
            current.cancel_at_period_end = bool(effect["cancel_at_period_end"])
        current.last_event_created = created
        current.updated_at = _now()

    def _find_payment(self, effect: dict) -> PaymentRow | None:
        for row in self.payments:
            if (
                effect.get("stripe_invoice_id")
                and row.stripe_invoice_id == effect.get("stripe_invoice_id")
            ):
                return row
            intent = effect.get("stripe_payment_intent_id")
            if intent and row.stripe_payment_intent_id == intent:
                return row
            if (
                effect.get("stripe_charge_id")
                and row.stripe_charge_id == effect.get("stripe_charge_id")
            ):
                return row
            if (
                effect.get("stripe_checkout_session_id")
                and row.stripe_checkout_session_id
                == effect.get("stripe_checkout_session_id")
            ):
                return row
        return None

    def _upsert_payment(
        self, user_id: str, effect: dict, status: str, offer_id: str | None
    ) -> None:
        row = self._find_payment(effect)
        if row is None:
            if not user_id:
                raise RuntimeError("unresolved customer")
            self.payments.append(
                PaymentRow(
                    user_id=user_id,
                    status=status,
                    amount_cents=int(effect.get("amount_cents") or 0),
                    currency=effect.get("currency") or "usd",
                    offer_version_id=offer_id,
                    stripe_checkout_session_id=effect.get("stripe_checkout_session_id"),
                    stripe_payment_intent_id=effect.get("stripe_payment_intent_id"),
                    stripe_invoice_id=effect.get("stripe_invoice_id"),
                    stripe_charge_id=effect.get("stripe_charge_id"),
                    created_at=_now(),
                )
            )
            return
        if row.status != "refunded":
            row.status = status
        if offer_id:
            row.offer_version_id = offer_id
        for attr in (
            "stripe_checkout_session_id",
            "stripe_payment_intent_id",
            "stripe_invoice_id",
            "stripe_charge_id",
        ):
            if effect.get(attr):
                setattr(row, attr, effect[attr])
        if effect.get("amount_cents") is not None:
            row.amount_cents = int(effect["amount_cents"])

    def _payment_was_refunded(self, effect: dict) -> bool:
        row = self._find_payment(effect)
        return row is not None and row.status == "refunded"

    def _entry(
        self,
        user_id: str,
        entry_type: str,
        credits: int,
        delta: int,
        source_type: str | None,
        source_id: str | None,
    ) -> None:
        self.entries.append(
            LedgerEntry(
                user_id=user_id,
                entry_type=entry_type,
                credits=credits,
                delta=delta,
                balance_after=self.balances.get(user_id, 0),
                source_type=source_type,
                source_id=source_id,
                created_at=_now(),
            )
        )

    def _latest_subscription(self, user_id: str) -> SubscriptionRow | None:
        rows = [row for row in self.subscriptions.values() if row.user_id == user_id]
        if not rows:
            return None
        return max(rows, key=lambda row: row.updated_at)
