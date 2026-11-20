"""Billing HTTP contracts. Stripe identifiers stay off these responses."""

from __future__ import annotations

from pydantic import BaseModel

from auteur_api.modules.commercial.models import AccountRecord, OfferRecord


class OfferResponse(BaseModel):
    version_id: str
    code: str
    display_name: str
    kind: str
    credits: int
    currency: str
    amount_cents: int
    provisional: bool
    checkout_ready: bool


class OfferListResponse(BaseModel):
    offers: list[OfferResponse]
    provisional: bool = True


class CheckoutRequest(BaseModel):
    offer_version_id: str


class CheckoutResponse(BaseModel):
    url: str


class MovementResponse(BaseModel):
    entry_type: str
    credits: int
    delta: int
    created_at: str


class PaymentResponse(BaseModel):
    status: str
    amount_cents: int
    currency: str
    created_at: str


class SubscriptionResponse(BaseModel):
    status: str
    cancel_at_period_end: bool
    current_period_end: str | None


class AccountResponse(BaseModel):
    balance: int
    has_customer: bool
    subscription: SubscriptionResponse | None
    payments: list[PaymentResponse]
    movements: list[MovementResponse]
    provisional: bool = True


class WebhookResponse(BaseModel):
    status: str


def offer_response(offer: OfferRecord) -> OfferResponse:
    return OfferResponse(
        version_id=offer.version_id,
        code=offer.code,
        display_name=offer.display_name,
        kind=offer.kind,
        credits=offer.credits,
        currency=offer.currency,
        amount_cents=offer.amount_cents,
        provisional=offer.provisional,
        checkout_ready=bool(offer.stripe_price_id),
    )


def account_response(record: AccountRecord) -> AccountResponse:
    subscription = record.subscription
    return AccountResponse(
        balance=record.balance,
        has_customer=record.has_customer,
        subscription=(
            None
            if subscription is None
            else SubscriptionResponse(
                status=subscription.status,
                cancel_at_period_end=subscription.cancel_at_period_end,
                current_period_end=subscription.current_period_end,
            )
        ),
        payments=[
            PaymentResponse(
                status=payment.status,
                amount_cents=payment.amount_cents,
                currency=payment.currency,
                created_at=payment.created_at,
            )
            for payment in record.payments
        ],
        movements=[
            MovementResponse(
                entry_type=movement.entry_type,
                credits=movement.credits,
                delta=movement.delta,
                created_at=movement.created_at,
            )
            for movement in record.movements
        ],
    )
