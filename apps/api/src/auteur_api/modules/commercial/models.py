"""Commercial records shared by the in-memory ledger and Postgres."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class OfferRecord:
    version_id: str
    code: str
    display_name: str
    kind: str
    version: int
    credits: int
    currency: str
    amount_cents: int
    stripe_price_id: str | None
    provisional: bool
    active: bool


@dataclass(frozen=True)
class RateRecord:
    rate_key: str
    version: int
    credits: int
    active: bool


@dataclass
class MovementRecord:
    entry_type: str
    credits: int
    delta: int
    created_at: str


@dataclass
class PaymentView:
    status: str
    amount_cents: int
    currency: str
    created_at: str


@dataclass
class SubscriptionView:
    status: str
    cancel_at_period_end: bool
    current_period_end: str | None


@dataclass
class AccountRecord:
    balance: int
    has_customer: bool
    subscription: SubscriptionView | None
    payments: list[PaymentView]
    movements: list[MovementRecord]


@dataclass
class Reservation:
    user_id: str
    subject_type: str
    subject_id: str
    rate_key: str
    rate_version: int
    credits: int
    status: str
    course_id: str | None = None


@dataclass
class PaymentRow:
    user_id: str
    status: str
    amount_cents: int
    currency: str
    offer_version_id: str | None = None
    stripe_checkout_session_id: str | None = None
    stripe_payment_intent_id: str | None = None
    stripe_invoice_id: str | None = None
    stripe_charge_id: str | None = None
    created_at: str = ""


@dataclass
class SubscriptionRow:
    user_id: str
    stripe_subscription_id: str
    stripe_customer_id: str
    offer_version_id: str | None
    status: str
    current_period_start: int | None
    current_period_end: int | None
    cancel_at_period_end: bool
    last_event_created: int
    updated_at: str = ""


@dataclass
class LedgerEntry:
    user_id: str
    entry_type: str
    credits: int
    delta: int
    balance_after: int
    source_type: str | None
    source_id: str | None
    created_at: str


@dataclass
class StoredEvent:
    status: str
    attempts: int = 0
    error: str | None = None
    payload: dict = field(default_factory=dict)


class CommercialLedger(Protocol):
    def list_offers(self) -> list[OfferRecord]: ...

    def get_offer_version(self, version_id: str) -> OfferRecord | None: ...

    def active_rate(self, rate_key: str) -> RateRecord | None: ...

    def account(self, user_id: str) -> AccountRecord: ...

    def customer_id(self, user_id: str) -> str | None: ...

    def save_customer(self, user_id: str, customer_id: str) -> str: ...

    def save_checkout(
        self,
        *,
        user_id: str,
        offer_version_id: str,
        checkout_session_id: str,
        mode: str,
        amount_cents: int,
        currency: str,
    ) -> None: ...

    def apply_event(self, event: dict) -> str: ...

    def reserve_credits(
        self,
        *,
        user_id: str,
        subject_type: str,
        subject_id: str,
        rate_key: str,
        rate_version: int,
        credits: int,
    ) -> str: ...

    def confirm_reservation(
        self, *, subject_type: str, subject_id: str, course_id: str
    ) -> str: ...

    def release_reservation(self, *, subject_type: str, subject_id: str) -> str: ...

    def refund_for_course(self, course_id: str) -> str: ...
