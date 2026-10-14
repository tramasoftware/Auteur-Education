"""Resolve the owning user from a Supabase access token (DEC-011).

FastAPI remains the only data plane (DEC-012). A missing or invalid token is
rejected. There is no shared fallback identity.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header

from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError

logger = logging.getLogger("auteur_api.auth")


@dataclass(frozen=True)
class VerifiedUser:
    id: str
    is_anonymous: bool


def get_current_user_id(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> str:
    return verified_user(authorization).id


def require_permanent_user_id(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> str:
    """BR-AUT-004: Blueprint and course build require a non-anonymous account."""
    user = verified_user(authorization)
    if user.is_anonymous:
        raise ApiError(
            "unauthorized",
            "Sign in is required to continue.",
        )
    return user.id


def verified_user(authorization: str | None) -> VerifiedUser:
    token = bearer_token(authorization)
    if not token:
        raise ApiError(
            "unauthorized",
            "Sign in is required to continue.",
        )
    user = user_from_access_token(token)
    if user is None:
        raise ApiError(
            "unauthorized",
            "The session is invalid. Please sign in again.",
        )
    return user


def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


def user_from_access_token(token: str) -> VerifiedUser | None:
    if not settings.supabase_configured:
        return None
    try:
        from auteur_api.core.postgres_store import get_postgres_store

        response = get_postgres_store()._client.auth.get_user(token)
    except Exception:
        logger.info("access_token_rejected")
        return None
    user = getattr(response, "user", None)
    user_id = getattr(user, "id", None)
    if not user_id:
        return None
    return VerifiedUser(
        id=str(user_id),
        is_anonymous=bool(getattr(user, "is_anonymous", False)),
    )


def discard_anonymous_user(user_id: str) -> None:
    """Drop an anonymous auth user after its rows have moved."""
    if not settings.supabase_configured:
        return
    try:
        from auteur_api.core.postgres_store import get_postgres_store

        get_postgres_store()._client.auth.admin.delete_user(user_id)
    except Exception:
        logger.info("anonymous_user_delete_skipped")


CurrentUserId = Annotated[str, Depends(get_current_user_id)]
PermanentUserId = Annotated[str, Depends(require_permanent_user_id)]
