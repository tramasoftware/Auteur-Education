"""Claim an anonymous visitor's learning request after sign-in (UF-06)."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, field_validator

from auteur_api.core.auth import (
    CurrentUserId,
    PermanentUserId,
    bearer_token,
    discard_anonymous_user,
    user_from_access_token,
)
from auteur_api.core.errors import ApiError
from auteur_api.core.store import ProfileRecord, get_store
from auteur_api.core.store import Store as StoreBackend
from auteur_api.modules.auth.service import attach_anonymous_owner

router = APIRouter(prefix="/auth", tags=["auth"])

Store = Annotated[StoreBackend, Depends(get_store)]


class ClaimResponse(BaseModel):
    attached: bool


class ProfileResponse(BaseModel):
    first_name: str | None
    last_name: str | None
    birth_date: date | None
    gender: str | None
    avatar_url: str | None


class ProfileUpdate(BaseModel):
    first_name: str
    last_name: str
    birth_date: date
    gender: Literal["female", "male", "nonbinary", "undisclosed"]

    @field_validator("first_name", "last_name")
    @classmethod
    def trimmed_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or len(cleaned) > 80:
            raise ValueError("Enter a name between 1 and 80 characters.")
        return cleaned

    @field_validator("birth_date")
    @classmethod
    def age_window(cls, value: date) -> date:
        today = date.today()
        if value > _shift_years(today, -13) or value < _shift_years(today, -120):
            raise ValueError("Enter a date of birth between 13 and 120 years ago.")
        return value


def _shift_years(value: date, years: int) -> date:
    try:
        return value.replace(year=value.year + years)
    except ValueError:
        return value.replace(year=value.year + years, day=28)


def _profile_response(profile: ProfileRecord) -> ProfileResponse:
    return ProfileResponse(
        first_name=profile.first_name,
        last_name=profile.last_name,
        birth_date=profile.birth_date,
        gender=profile.gender,
        avatar_url=profile.avatar_url,
    )


@router.get("/profile", response_model=ProfileResponse)
def get_profile(store: Store, user_id: CurrentUserId) -> ProfileResponse:
    return _profile_response(store.get_profile(user_id))


@router.patch("/profile", response_model=ProfileResponse)
def update_profile(
    body: ProfileUpdate,
    store: Store,
    user_id: PermanentUserId,
) -> ProfileResponse:
    """Update the signed-in member's name, birth date, and gender."""
    saved = store.update_profile(
        user_id,
        ProfileRecord(
            first_name=body.first_name,
            last_name=body.last_name,
            birth_date=body.birth_date,
            gender=body.gender,
        ),
    )
    return _profile_response(saved)


@router.post("/claim", response_model=ClaimResponse)
def claim_anonymous_session(
    store: Store,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    anonymous_authorization: Annotated[
        str | None, Header(alias="X-Anonymous-Authorization")
    ] = None,
) -> ClaimResponse:
    permanent_token = bearer_token(authorization)
    anonymous_token = bearer_token(anonymous_authorization)
    if not permanent_token or not anonymous_token:
        raise ApiError("unauthorized", "Sign in is required to continue.")
    permanent = user_from_access_token(permanent_token)
    anonymous = user_from_access_token(anonymous_token)
    if permanent is None or anonymous is None or permanent.is_anonymous:
        raise ApiError(
            "unauthorized",
            "The session is invalid. Please sign in again.",
        )
    if not anonymous.is_anonymous:
        raise ApiError(
            "unauthorized",
            "The session is invalid. Please sign in again.",
        )
    attached = attach_anonymous_owner(
        store,
        anonymous_user_id=anonymous.id,
        permanent_user_id=permanent.id,
    )
    if attached:
        discard_anonymous_user(anonymous.id)
    return ClaimResponse(attached=attached)
