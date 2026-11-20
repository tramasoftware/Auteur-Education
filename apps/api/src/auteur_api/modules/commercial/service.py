"""Checkout, portal, account and webhook application. No DemoStore."""

from __future__ import annotations

import logging

from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError, not_found
from auteur_api.modules.commercial.events import normalize
from auteur_api.modules.commercial.models import (
    AccountRecord,
    CommercialLedger,
    OfferRecord,
)
from auteur_api.modules.commercial.stripe_gateway import StripeGateway

logger = logging.getLogger("auteur_api.commercial")


def list_offers(ledger: CommercialLedger) -> list[OfferRecord]:
    return ledger.list_offers()


def account_for(ledger: CommercialLedger, user_id: str) -> AccountRecord:
    return ledger.account(user_id)


def start_checkout(
    ledger: CommercialLedger,
    gateway: StripeGateway,
    *,
    user_id: str,
    offer_version_id: str,
) -> str:
    offer = ledger.get_offer_version(offer_version_id)
    if offer is None:
        raise not_found("Offer")
    if not offer.active or not offer.stripe_price_id:
        raise ApiError(
            "commercial_not_configured",
            "This offer is not linked to a Stripe price yet.",
        )
    customer_id = ledger.customer_id(user_id)
    if customer_id is None:
        customer_id = ledger.save_customer(user_id, gateway.create_customer(user_id))
    mode = "subscription" if offer.kind == "subscription" else "payment"
    site = settings.public_site_url
    session_id, url = gateway.create_checkout(
        customer_id=customer_id,
        price_id=offer.stripe_price_id,
        mode=mode,
        success_url=f"{site}/account?checkout=return",
        cancel_url=f"{site}/plans?checkout=cancel",
        user_id=user_id,
        offer_version_id=offer.version_id,
    )
    ledger.save_checkout(
        user_id=user_id,
        offer_version_id=offer.version_id,
        checkout_session_id=session_id,
        mode=mode,
        amount_cents=offer.amount_cents,
        currency=offer.currency,
    )
    return url


def start_portal(
    ledger: CommercialLedger, gateway: StripeGateway, *, user_id: str
) -> str:
    customer_id = ledger.customer_id(user_id)
    if customer_id is None:
        raise ApiError(
            "invalid_state",
            "There is no billing profile for this account yet.",
        )
    return gateway.create_portal(
        customer_id=customer_id,
        return_url=f"{settings.public_site_url}/account",
    )


def accept_webhook(
    ledger: CommercialLedger,
    gateway: StripeGateway,
    *,
    payload: bytes,
    signature: str | None,
) -> str:
    event = gateway.construct_event(payload, signature)
    normalized = normalize(event)
    status = ledger.apply_event(normalized)
    if status == "failed":
        logger.info("stripe_event_failed id=%s", normalized.get("event_id"))
        raise ApiError(
            "internal_error",
            "The billing event could not be recorded. It can be retried.",
        )
    return status
