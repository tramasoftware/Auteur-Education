"""Product identity: anonymous rows move only after both sessions are verified."""

from datetime import date

import pytest
from pydantic import ValidationError
from tests.conftest import TEST_USER_ID
from tests.test_learning_requests import create

from auteur_api.core.auth import VerifiedUser
from auteur_api.core.store import ProfileRecord, store
from auteur_api.modules.auth.service import attach_anonymous_owner

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
