"""Resolve the owning user for a request (DEC-011).

Product login is still out of scope. In non-production, missing JWTs map to the
seeded demo profile. FastAPI remains the only data plane (no PostgREST from the
browser).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header

from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError


def get_current_user_id(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> str:
    token = _bearer_token(authorization)
    if token:
        user_id = _user_id_from_access_token(token)
        if user_id:
            return user_id
        raise ApiError(
            "unauthorized",
            "The session is invalid. Please sign in again.",
        )
    if settings.demo_user_bypass_enabled:
        return settings.demo_user_id
    raise ApiError(
        "unauthorized",
        "Sign in is required to continue.",
    )


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


def _user_id_from_access_token(token: str) -> str | None:
    if not settings.supabase_configured:
        return None
    try:
        from auteur_api.core.postgres_store import get_postgres_store

        response = get_postgres_store()._client.auth.get_user(token)
    except Exception:
        return None
    user = getattr(response, "user", None)
    return getattr(user, "id", None)


CurrentUserId = Annotated[str, Depends(get_current_user_id)]
