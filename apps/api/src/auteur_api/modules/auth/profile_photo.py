"""Validate a profile photo before it is stored.

The browser may label a file however it likes. The bytes decide the type.
The object path is built only from the verified user id.
"""

from __future__ import annotations

import re

from auteur_api.core.errors import ApiError, ErrorDetail

MAX_BYTES = 5 * 1024 * 1024
BUCKET = "profile-photos"

_USER_ID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def profile_photo_object_path(user_id: str) -> str:
    if _USER_ID.fullmatch(user_id) is None:
        raise ApiError("unauthorized", "Sign in is required to continue.")
    return f"{user_id}/photo"


def validated_profile_photo(content: bytes) -> str:
    if not content:
        raise _invalid("Choose a photo.")
    if len(content) > MAX_BYTES:
        raise _invalid("Choose a photo smaller than 5 MB.")
    kind = _sniff(content)
    if kind is None:
        raise _invalid("Choose a JPEG, PNG, or WebP photo.")
    return kind


def _invalid(message: str) -> ApiError:
    return ApiError(
        "validation_error",
        message,
        details=[ErrorDetail(field="file", issue=message)],
    )


def _sniff(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None
