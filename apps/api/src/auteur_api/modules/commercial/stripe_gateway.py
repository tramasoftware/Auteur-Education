"""Stripe calls stay on the server. The browser only receives HTTPS URLs."""

from __future__ import annotations

from typing import Protocol
from urllib.parse import urlparse

import stripe
from stripe import StripeClient

from auteur_api.core.errors import ApiError

CHECKOUT_HOST = "checkout.stripe.com"
PORTAL_HOST = "billing.stripe.com"


class InvalidSignature(Exception):
    """The webhook body did not match the Stripe signature."""


class StripeGateway(Protocol):
    def create_customer(self, user_id: str) -> str: ...

    def create_checkout(
        self,
        *,
        customer_id: str,
        price_id: str,
        mode: str,
        success_url: str,
        cancel_url: str,
        user_id: str,
        offer_version_id: str,
    ) -> tuple[str, str]: ...

    def create_portal(self, *, customer_id: str, return_url: str) -> str: ...

    def construct_event(self, payload: bytes, signature: str | None) -> dict: ...


class StripeSdkGateway:
    def __init__(self, api_key: str, webhook_secret: str) -> None:
        self._client = StripeClient(api_key)
        self._webhook_secret = webhook_secret

    def create_customer(self, user_id: str) -> str:
        try:
            customer = self._client.v1.customers.create(
                params={"metadata": {"user_id": user_id}}
            )
        except stripe.StripeError:
            raise ApiError(
                "provider_unavailable",
                "Billing is not available right now.",
            ) from None
        return str(customer.id)

    def create_checkout(
        self,
        *,
        customer_id: str,
        price_id: str,
        mode: str,
        success_url: str,
        cancel_url: str,
        user_id: str,
        offer_version_id: str,
    ) -> tuple[str, str]:
        metadata = {"user_id": user_id, "offer_version_id": offer_version_id}
        params: dict = {
            "customer": customer_id,
            "mode": mode,
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": user_id,
            "metadata": metadata,
        }
        if mode == "subscription":
            params["subscription_data"] = {"metadata": metadata}
        try:
            session = self._client.v1.checkout.sessions.create(params=params)
        except stripe.StripeError:
            raise ApiError(
                "provider_unavailable",
                "Billing is not available right now.",
            ) from None
        url = require_stripe_url(session.url, CHECKOUT_HOST)
        return str(session.id), url

    def create_portal(self, *, customer_id: str, return_url: str) -> str:
        try:
            session = self._client.v1.billing_portal.sessions.create(
                params={"customer": customer_id, "return_url": return_url}
            )
        except stripe.StripeError:
            raise ApiError(
                "provider_unavailable",
                "The billing portal is not available right now.",
            ) from None
        return require_stripe_url(session.url, PORTAL_HOST)

    def construct_event(self, payload: bytes, signature: str | None) -> dict:
        try:
            event = self._client.construct_event(
                payload, signature, self._webhook_secret
            )
        except (stripe.SignatureVerificationError, ValueError):
            raise InvalidSignature from None
        if hasattr(event, "to_dict"):
            return event.to_dict()
        return dict(event)


def require_stripe_url(url: str | None, host: str) -> str:
    parsed = urlparse(url or "")
    if parsed.scheme != "https" or parsed.hostname != host:
        raise ApiError(
            "provider_unavailable",
            "Billing is not available right now.",
        )
    return url or ""
