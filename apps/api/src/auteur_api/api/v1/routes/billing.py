"""Billing routes. The webhook is authenticated by the Stripe signature."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from auteur_api.core.auth import CurrentUserId, PermanentUserId
from auteur_api.core.errors import new_support_reference
from auteur_api.modules.commercial.access import (
    get_commercial_ledger,
    get_stripe_gateway,
)
from auteur_api.modules.commercial.models import CommercialLedger
from auteur_api.modules.commercial.schemas import (
    AccountResponse,
    CheckoutRequest,
    CheckoutResponse,
    OfferListResponse,
    WebhookResponse,
    account_response,
    offer_response,
)
from auteur_api.modules.commercial.service import (
    accept_webhook,
    account_for,
    list_offers,
    start_checkout,
    start_portal,
)
from auteur_api.modules.commercial.stripe_gateway import InvalidSignature, StripeGateway

router = APIRouter(prefix="/billing", tags=["billing"])

Ledger = Annotated[CommercialLedger, Depends(get_commercial_ledger)]
Gateway = Annotated[StripeGateway, Depends(get_stripe_gateway)]


@router.get("/offers", response_model=OfferListResponse)
def offers(ledger: Ledger, user_id: CurrentUserId) -> OfferListResponse:
    del user_id
    offers = [offer_response(offer) for offer in list_offers(ledger)]
    return OfferListResponse(offers=offers)


@router.get("/account", response_model=AccountResponse)
def account(ledger: Ledger, user_id: PermanentUserId) -> AccountResponse:
    return account_response(account_for(ledger, user_id))


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(
    body: CheckoutRequest,
    ledger: Ledger,
    gateway: Gateway,
    user_id: PermanentUserId,
) -> CheckoutResponse:
    return CheckoutResponse(
        url=start_checkout(
            ledger,
            gateway,
            user_id=user_id,
            offer_version_id=body.offer_version_id,
        )
    )


@router.post("/portal", response_model=CheckoutResponse)
def portal(
    ledger: Ledger, gateway: Gateway, user_id: PermanentUserId
) -> CheckoutResponse:
    return CheckoutResponse(url=start_portal(ledger, gateway, user_id=user_id))


@router.post("/webhook", response_model=WebhookResponse)
async def webhook(
    request: Request, ledger: Ledger, gateway: Gateway
) -> WebhookResponse:
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    try:
        status = accept_webhook(
            ledger, gateway, payload=payload, signature=signature
        )
    except InvalidSignature:
        return _signature_rejected()  # type: ignore[return-value]
    return WebhookResponse(status=status)


def _signature_rejected() -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "validation_error",
                "message": "The Stripe signature is invalid.",
                "support_reference": new_support_reference(),
                "details": [],
            }
        },
    )
