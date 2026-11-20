"""How to reach the ledger and Stripe. Tests replace these callables."""

from __future__ import annotations

from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError
from auteur_api.modules.commercial.models import CommercialLedger
from auteur_api.modules.commercial.stripe_gateway import StripeGateway, StripeSdkGateway

_UNAVAILABLE = "Billing is not available in this environment."


def get_commercial_ledger() -> CommercialLedger:
    if not settings.supabase_configured:
        raise ApiError("provider_unavailable", _UNAVAILABLE)
    from auteur_api.core.postgres_store import get_postgres_store
    from auteur_api.modules.commercial.postgres import PostgresCommercialLedger

    return PostgresCommercialLedger(get_postgres_store()._client)


def get_stripe_gateway() -> StripeGateway:
    secret = settings.stripe_secret_key
    webhook = settings.stripe_webhook_secret
    if secret is None or webhook is None:
        raise ApiError("provider_unavailable", _UNAVAILABLE)
    return StripeSdkGateway(
        secret.get_secret_value(),
        webhook.get_secret_value(),
    )
