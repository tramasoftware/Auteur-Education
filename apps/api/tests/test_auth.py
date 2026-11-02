"""Product identity: anonymous rows move only after both sessions are verified."""

from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError
from tests.conftest import TEST_USER_ID
from tests.test_learning_requests import create

from auteur_api.core.auth import VerifiedUser
from auteur_api.core.store import ProfileRecord, new_id, store
from auteur_api.modules.auth.service import attach_anonymous_owner
from auteur_api.modules.generation.schemas import CourseRecord, CourseState

ANONYMOUS_USER_ID = "20000000-0000-4000-8000-000000000002"
OTHER_USER_ID = "30000000-0000-4000-8000-000000000003"


def test_attach_moves_only_the_anonymous_owner(client, fake_ai) -> None:
    owned = create(client, fake_ai).json()["id"]
    other = create(client, fake_ai).json()["id"]
    owned_record = store.get_learning_request(owned)
    other_record = store.get_learning_request(other)
    owned_record.user_id = ANONYMOUS_USER_ID
    other_record.user_id = OTHER_USER_ID
    store.save_learning_request(owned_record)
    store.save_learning_request(other_record)

    attached = attach_anonymous_owner(
        store,
        anonymous_user_id=ANONYMOUS_USER_ID,
        permanent_user_id=TEST_USER_ID,
    )

    assert attached is True
    assert store.get_learning_request(owned).user_id == TEST_USER_ID
    assert store.get_learning_request(other).user_id == OTHER_USER_ID


def test_attach_same_user_changes_nothing(client, fake_ai) -> None:
    request_id = create(client, fake_ai).json()["id"]
    attached = attach_anonymous_owner(
        store,
        anonymous_user_id=TEST_USER_ID,
        permanent_user_id=TEST_USER_ID,
    )
    assert attached is False
    assert store.get_learning_request(request_id).user_id == TEST_USER_ID


def test_claim_rejects_a_source_that_is_not_anonymous(open_client, monkeypatch) -> None:
    request_id = "40000000-0000-4000-8000-000000000004"

    def fake_user(token: str) -> VerifiedUser:
        if token == "anon-token":
            return VerifiedUser(id=ANONYMOUS_USER_ID, is_anonymous=False)
        return VerifiedUser(id=TEST_USER_ID, is_anonymous=False)

    monkeypatch.setattr(
        "auteur_api.api.v1.routes.auth.user_from_access_token", fake_user
    )
    monkeypatch.setattr(
        "auteur_api.api.v1.routes.auth.discard_anonymous_user", lambda _user_id: None
    )
    response = open_client.post(
        "/api/v1/auth/claim",
        headers={
            "Authorization": "Bearer permanent-token",
            "X-Anonymous-Authorization": "Bearer anon-token",
        },
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    assert request_id not in store.learning_requests


def test_claim_moves_rows_for_a_verified_anonymous_source(
    client, fake_ai, monkeypatch
) -> None:
    request_id = create(client, fake_ai).json()["id"]
    record = store.get_learning_request(request_id)
    record.user_id = ANONYMOUS_USER_ID
    store.save_learning_request(record)

    def fake_user(token: str) -> VerifiedUser:
        if token == "anon-token":
            return VerifiedUser(id=ANONYMOUS_USER_ID, is_anonymous=True)
        return VerifiedUser(id=TEST_USER_ID, is_anonymous=False)

    discarded: list[str] = []
    monkeypatch.setattr(
        "auteur_api.api.v1.routes.auth.user_from_access_token", fake_user
    )
    monkeypatch.setattr(
        "auteur_api.api.v1.routes.auth.discard_anonymous_user",
        lambda user_id: discarded.append(user_id),
    )
    # The authenticated client fixture replaces get_current_user_id, not this route.
    response = client.post(
        "/api/v1/auth/claim",
        headers={
            "Authorization": "Bearer permanent-token",
            "X-Anonymous-Authorization": "Bearer anon-token",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"attached": True}
    assert store.get_learning_request(request_id).user_id == TEST_USER_ID
    assert discarded == [ANONYMOUS_USER_ID]


def test_cors_rejects_a_wildcard_origin() -> None:
    from auteur_api.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(cors_origins=["*"])


def test_claim_without_tokens_is_unauthorized(open_client) -> None:
    response = open_client.post("/api/v1/auth/claim")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    assert response.headers["cache-control"] == "private, no-store"


def _profile_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "first_name": "Ada",
        "last_name": "Lovelace",
        "birth_date": "1990-12-10",
        "gender": "female",
    }
    body.update(overrides)
    return body


def test_account_profile_is_not_publicly_cacheable(client) -> None:
    store.profiles[TEST_USER_ID] = ProfileRecord(
        first_name="Ada",
        last_name="Lovelace",
        birth_date=date(1990, 12, 10),
        gender="female",
    )

    response = client.get("/api/v1/auth/profile")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "first_name": "Ada",
        "last_name": "Lovelace",
        "birth_date": "1990-12-10",
        "gender": "female",
        "avatar_url": None,
        "image_url": None,
        "text_size": "standard",
        "generated_course_count": 0,
    }


def test_profile_update_changes_only_the_signed_in_member(client) -> None:
    store.profiles[TEST_USER_ID] = ProfileRecord(
        avatar_url="https://example.com/ada.png",
    )
    store.profiles[OTHER_USER_ID] = ProfileRecord(
        first_name="Grace",
        last_name="Hopper",
        birth_date=date(1906, 12, 9),
        gender="female",
    )

    response = client.patch(
        "/api/v1/auth/profile",
        json={**_profile_body(), "email": "ada@example.com", "first_name": "  Ada  "},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "first_name": "Ada",
        "last_name": "Lovelace",
        "birth_date": "1990-12-10",
        "gender": "female",
        "avatar_url": "https://example.com/ada.png",
        "image_url": None,
        "text_size": "standard",
        "generated_course_count": 0,
    }
    assert "email" not in response.json()
    other = store.get_profile(OTHER_USER_ID)
    assert other.first_name == "Grace"
    assert other.last_name == "Hopper"


def test_profile_update_rejects_invalid_fields(client) -> None:
    unknown_gender = client.patch(
        "/api/v1/auth/profile",
        json=_profile_body(gender="other"),
    )
    blank_name = client.patch(
        "/api/v1/auth/profile",
        json=_profile_body(first_name="   "),
    )
    too_young = client.patch(
        "/api/v1/auth/profile",
        json=_profile_body(birth_date=date.today().isoformat()),
    )

    assert unknown_gender.status_code == 422
    assert blank_name.status_code == 422
    assert too_young.status_code == 422
    assert store.get_profile(TEST_USER_ID) == ProfileRecord()


def test_text_size_update_changes_only_the_signed_in_member(client) -> None:
    store.profiles[TEST_USER_ID] = ProfileRecord(text_size="standard")
    store.profiles[OTHER_USER_ID] = ProfileRecord(
        first_name="Grace",
        text_size="small",
    )

    response = client.patch(
        "/api/v1/auth/profile/text-size",
        json={"text_size": "extra_large"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json()["text_size"] == "extra_large"
    assert store.get_profile(TEST_USER_ID).text_size == "extra_large"
    assert store.get_profile(OTHER_USER_ID).text_size == "small"
    assert store.get_profile(OTHER_USER_ID).first_name == "Grace"


def test_profile_update_keeps_the_saved_text_size(client) -> None:
    store.profiles[TEST_USER_ID] = ProfileRecord(text_size="large")

    response = client.patch("/api/v1/auth/profile", json=_profile_body())

    assert response.status_code == 200
    assert response.json()["text_size"] == "large"
    assert store.get_profile(TEST_USER_ID).text_size == "large"


def test_text_size_update_rejects_unknown_sizes(client) -> None:
    response = client.patch(
        "/api/v1/auth/profile/text-size",
        json={"text_size": "huge"},
    )

    assert response.status_code == 422
    assert store.get_profile(TEST_USER_ID).text_size == "standard"


def test_text_size_update_without_a_session_is_unauthorized(open_client) -> None:
    response = open_client.patch(
        "/api/v1/auth/profile/text-size",
        json={"text_size": "large"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_anonymous_cannot_update_text_size(open_client, monkeypatch) -> None:
    monkeypatch.setattr(
        "auteur_api.core.auth.user_from_access_token",
        lambda _token: VerifiedUser(id=ANONYMOUS_USER_ID, is_anonymous=True),
    )
    response = open_client.patch(
        "/api/v1/auth/profile/text-size",
        headers={"Authorization": "Bearer anon-token"},
        json={"text_size": "large"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    assert store.get_profile(ANONYMOUS_USER_ID).text_size == "standard"


def test_profile_update_without_a_session_is_unauthorized(open_client) -> None:
    response = open_client.patch("/api/v1/auth/profile", json=_profile_body())
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_profile_update_rejects_an_anonymous_session(open_client, monkeypatch) -> None:
    monkeypatch.setattr(
        "auteur_api.core.auth.user_from_access_token",
        lambda _token: VerifiedUser(id=ANONYMOUS_USER_ID, is_anonymous=True),
    )
    response = open_client.patch(
        "/api/v1/auth/profile",
        headers={"Authorization": "Bearer anon-token"},
        json=_profile_body(),
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    assert store.get_profile(ANONYMOUS_USER_ID) == ProfileRecord()


def test_anonymous_session_can_read_but_cannot_start_a_blueprint(
    open_client, monkeypatch
) -> None:
    monkeypatch.setattr(
        "auteur_api.core.auth.user_from_access_token",
        lambda _token: VerifiedUser(id=ANONYMOUS_USER_ID, is_anonymous=True),
    )
    headers = {"Authorization": "Bearer anon-token"}

    library = open_client.get("/api/v1/courses", headers=headers)
    blueprint = open_client.post(
        "/api/v1/learning-requests/missing/blueprint",
        headers=headers,
    )

    assert library.status_code == 200
    assert blueprint.status_code == 401


def test_profile_counts_only_the_signed_in_member_courses(client) -> None:
    empty = client.get("/api/v1/auth/profile")
    assert empty.json()["generated_course_count"] == 0

    now = datetime.now(UTC)
    store.save_course(
        CourseRecord(
            id=new_id(),
            user_id=TEST_USER_ID,
            request_id=new_id(),
            blueprint_id=new_id(),
            blueprint_version=1,
            title="Owned",
            subtitle="A learning trajectory",
            objective_statement="Understand owned.",
            state=CourseState.COMPLETE,
            created_at=now,
        )
    )
    store.save_course(
        CourseRecord(
            id=new_id(),
            user_id=OTHER_USER_ID,
            request_id=new_id(),
            blueprint_id=new_id(),
            blueprint_version=1,
            title="Other",
            subtitle="A learning trajectory",
            objective_statement="Understand other.",
            state=CourseState.COMPLETE,
            created_at=now,
        )
    )

    filled = client.get("/api/v1/auth/profile")
    assert filled.json()["generated_course_count"] == 1


_JPEG = b"\xff\xd8\xff" + b"\x00" * 16
_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def _photo(
    content: bytes, name: str = "photo.jpg"
) -> dict[str, tuple[str, bytes, str]]:
    return {"file": (name, content, "application/octet-stream")}


def test_profile_photo_create_replace_and_delete(client) -> None:
    store.profiles[OTHER_USER_ID] = ProfileRecord(
        image_url="https://example.com/other.png",
    )

    missing_update = client.put("/api/v1/auth/profile/photo", files=_photo(_JPEG))
    missing_delete = client.delete("/api/v1/auth/profile/photo")
    assert missing_update.status_code == 404
    assert missing_delete.status_code == 404

    created = client.post("/api/v1/auth/profile/photo", files=_photo(_JPEG))
    assert created.status_code == 200
    assert created.headers["cache-control"] == "private, no-store"
    created_url = created.json()["image_url"]
    assert created_url.startswith(
        f"https://example.test/profile-photos/{TEST_USER_ID}/photo?v="
    )
    assert store.profile_photos[TEST_USER_ID] == _JPEG
    assert store.get_profile(OTHER_USER_ID).image_url == "https://example.com/other.png"

    duplicate = client.post(
        "/api/v1/auth/profile/photo", files=_photo(_PNG, "photo.png")
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "invalid_state"
    assert store.profile_photos[TEST_USER_ID] == _JPEG

    updated = client.put(
        "/api/v1/auth/profile/photo", files=_photo(_PNG, "photo.png")
    )
    assert updated.status_code == 200
    assert updated.json()["image_url"] != created_url
    assert store.profile_photos[TEST_USER_ID] == _PNG

    kept = client.patch("/api/v1/auth/profile", json=_profile_body())
    assert kept.status_code == 200
    assert kept.json()["image_url"] == updated.json()["image_url"]

    deleted = client.delete("/api/v1/auth/profile/photo")
    assert deleted.status_code == 200
    assert deleted.json()["image_url"] is None
    assert TEST_USER_ID not in store.profile_photos
    assert store.get_profile(OTHER_USER_ID).image_url == "https://example.com/other.png"


def test_profile_photo_rejects_a_file_that_is_not_an_image(client) -> None:
    response = client.post(
        "/api/v1/auth/profile/photo",
        files=_photo(b"not a photo", "notes.txt"),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert store.get_profile(TEST_USER_ID).image_url is None


def test_profile_photo_rejects_a_file_over_the_size_limit(client, monkeypatch) -> None:
    monkeypatch.setattr(
        "auteur_api.modules.auth.profile_photo.MAX_BYTES",
        8,
    )
    response = client.post("/api/v1/auth/profile/photo", files=_photo(_JPEG))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert store.get_profile(TEST_USER_ID).image_url is None


def test_profile_photo_without_a_session_is_unauthorized(open_client) -> None:
    response = open_client.post("/api/v1/auth/profile/photo", files=_photo(_JPEG))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_profile_photo_rejects_an_anonymous_session(open_client, monkeypatch) -> None:
    monkeypatch.setattr(
        "auteur_api.core.auth.user_from_access_token",
        lambda _token: VerifiedUser(id=ANONYMOUS_USER_ID, is_anonymous=True),
    )
    response = open_client.post(
        "/api/v1/auth/profile/photo",
        headers={"Authorization": "Bearer anon-token"},
        files=_photo(_JPEG),
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    assert store.get_profile(ANONYMOUS_USER_ID).image_url is None
    assert ANONYMOUS_USER_ID not in store.profile_photos
