"""Lesson narration: mock TTS, durable jobs, authorization (DEC-025, BR-AUD-*)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
from fastapi.testclient import TestClient
from tests.conftest import TEST_USER_ID
from tests.test_build import approved_course

from auteur_api.core.auth import get_current_user_id, require_permanent_user_id
from auteur_api.core.background import ImmediateTaskRunner, get_task_runner
from auteur_api.core.config import settings
from auteur_api.main import app
from auteur_api.modules.audio.access import get_audio_store, get_tts_provider
from auteur_api.modules.audio.memory import MemoryAudioStore
from auteur_api.modules.audio.providers.elevenlabs import ElevenLabsProvider
from auteur_api.modules.audio.providers.factory import create_tts_provider
from auteur_api.modules.audio.providers.mock import (
    MOCK_DURATION_MS,
    SILENT_MP3,
    MockTTSProvider,
)
from auteur_api.modules.commercial.access import get_commercial_ledger
from auteur_api.modules.commercial.memory import MemoryCommercialLedger

OTHER_USER = "20000000-0000-4000-8000-000000000002"


class HoldingRunner:
    def __init__(self) -> None:
        self.held: list = []

    async def schedule(self, coro) -> None:
        self.held.append(coro)

    async def release(self) -> None:
        jobs = list(self.held)
        self.held.clear()
        for job in jobs:
            await job


def _bind(audio: MemoryAudioStore, provider: MockTTSProvider, runner=None) -> None:
    app.dependency_overrides[get_audio_store] = lambda: audio
    app.dependency_overrides[get_tts_provider] = lambda: provider
    app.dependency_overrides[get_task_runner] = lambda: runner or ImmediateTaskRunner()


def _clear() -> None:
    app.dependency_overrides.pop(get_audio_store, None)
    app.dependency_overrides.pop(get_tts_provider, None)
    app.dependency_overrides.pop(get_task_runner, None)
    app.dependency_overrides.pop(get_commercial_ledger, None)
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID
    app.dependency_overrides[require_permanent_user_id] = lambda: TEST_USER_ID
    app.dependency_overrides[get_task_runner] = lambda: ImmediateTaskRunner()


def _ids(client: TestClient, fake_ai) -> tuple[str, str, str, str]:
    course_id = approved_course(client, fake_ai)
    course = client.get(f"/api/v1/courses/{course_id}").json()
    module_id = course["modules"][0]["id"]
    module = client.get(f"/api/v1/courses/{course_id}/modules/{module_id}").json()
    first = module["lessons"][0]["id"]
    second = module["lessons"][1]["id"]
    return course_id, module_id, first, second


def _path(course_id: str, module_id: str, lesson_id: str, suffix: str = "") -> str:
    base = f"/api/v1/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}/audio"
    return base + suffix


def test_first_request_reuses_and_get_does_not_synthesize(client, fake_ai) -> None:
    audio = MemoryAudioStore()
    provider = MockTTSProvider()
    _bind(audio, provider)
    course_id, module_id, lesson_id, _ = _ids(client, fake_ai)
    path = _path(course_id, module_id, lesson_id)
    first = client.post(path)
    assert first.status_code == 202
    body = first.json()
    assert body["status"] == "ready"
    assert body["ready_chunks"] >= 1
    calls = list(provider.calls)
    assert calls
    stored = next(iter(audio.objects.values()))
    assert stored.content[:2] == SILENT_MP3[:2]
    second = client.post(path)
    assert second.status_code == 202
    assert second.json()["narration_id"] == body["narration_id"]
    assert provider.calls == calls
    listed = client.get(path)
    assert listed.status_code == 200
    assert listed.json()["status"] == "ready"
    assert provider.calls == calls
    play = client.get(_path(course_id, module_id, lesson_id, "/playback"))
    assert play.status_code == 200
    payload = play.json()
    assert payload["chunks"]
    assert payload["chunks"][0]["url"].startswith("https://")
    assert "lesson-audio" in payload["chunks"][0]["url"]
    assert payload["duration_ms"] == MOCK_DURATION_MS * payload["chunks"].__len__()
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["state"] in {"partially_available", "complete"}
    _clear()


def test_get_without_post_does_not_create_work(client, fake_ai) -> None:
    audio = MemoryAudioStore()
    provider = MockTTSProvider()
    _bind(audio, provider)
    course_id, module_id, lesson_id, _ = _ids(client, fake_ai)
    missing = client.get(_path(course_id, module_id, lesson_id))
    assert missing.status_code == 404
    assert provider.calls == []
    assert audio.narrations == {}
    _clear()


def test_holding_runner_recovers_expired_lease(client, fake_ai) -> None:
    course_id, module_id, lesson_id, _ = _ids(client, fake_ai)
    audio = MemoryAudioStore()
    provider = MockTTSProvider()
    holder = HoldingRunner()
    _bind(audio, provider, holder)
    path = _path(course_id, module_id, lesson_id)
    posted = client.post(path)
    assert posted.status_code == 202
    assert posted.json()["status"] == "queued"
    assert provider.calls == []
    assert client.get(path).json()["status"] == "queued"
    narration_id = posted.json()["narration_id"]
    claimed = audio.claim_chunk(narration_id, 1)
    assert claimed is not None
    claimed.lease_expires_at = (datetime.now(UTC) - timedelta(seconds=5)).isoformat()
    app.dependency_overrides[get_task_runner] = lambda: ImmediateTaskRunner()
    tick = client.get(
        "/api/v1/internal/audio/tick",
        headers={"Authorization": "Bearer cron-test"},
    )
    # CRON_SECRET unset -> not anonymous 200
    assert tick.status_code in {401, 503}
    again = audio.claim_chunk(narration_id, 30)
    assert again is not None
    assert again.id == claimed.id
    assert again.attempts == 2
    _clear()


def test_tick_requires_secret(client, fake_ai, monkeypatch) -> None:
    audio = MemoryAudioStore()
    provider = MockTTSProvider()
    _bind(audio, provider)
    monkeypatch.setattr(settings, "cron_secret", None)
    denied = client.get("/api/v1/internal/audio/tick")
    assert denied.status_code in {401, 503}
    from pydantic import SecretStr

    monkeypatch.setattr(settings, "cron_secret", SecretStr("cron-test"))
    ok = client.get(
        "/api/v1/internal/audio/tick",
        headers={"Authorization": "Bearer cron-test"},
    )
    assert ok.status_code == 200
    assert ok.json()["resumed"] == 0
    bad = client.get(
        "/api/v1/internal/audio/tick",
        headers={"Authorization": "Bearer other"},
    )
    assert bad.status_code == 401
    _clear()


def test_retry_after_provider_error(client, fake_ai) -> None:
    audio = MemoryAudioStore()
    provider = MockTTSProvider()
    provider.fail_times = 8
    provider.fail_retryable = False
    _bind(audio, provider)
    course_id, module_id, lesson_id, _ = _ids(client, fake_ai)
    path = _path(course_id, module_id, lesson_id)
    failed = client.post(path)
    assert failed.status_code == 202
    assert failed.json()["status"] == "failed"
    assert "eleven" not in (failed.json().get("error_message") or "").lower()
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["state"] in {"partially_available", "complete"}
    provider.fail_times = 0
    retried = client.post(_path(course_id, module_id, lesson_id, "/retry"))
    assert retried.status_code == 202
    assert retried.json()["status"] == "ready"
    playback = client.get(_path(course_id, module_id, lesson_id, "/playback"))
    assert playback.status_code == 200
    _clear()


def test_storage_error_does_not_fail_course(client, fake_ai) -> None:
    audio = MemoryAudioStore()
    provider = MockTTSProvider()
    audio.put_failures = 8
    _bind(audio, provider)
    course_id, module_id, lesson_id, _ = _ids(client, fake_ai)
    posted = client.post(_path(course_id, module_id, lesson_id))
    assert posted.json()["status"] == "failed"
    course = client.get(f"/api/v1/courses/{course_id}").json()
    assert course["modules"][0]["state"] == "published"
    _clear()


def test_monthly_cap_and_concurrency(client, fake_ai, monkeypatch) -> None:
    course_id, module_id, first, second = _ids(client, fake_ai)
    audio = MemoryAudioStore()
    provider = MockTTSProvider()
    holder = HoldingRunner()
    _bind(audio, provider, holder)
    first_post = client.post(_path(course_id, module_id, first))
    assert first_post.json()["status"] == "queued"
    blocked = client.post(_path(course_id, module_id, second))
    assert blocked.status_code == 409
    monkeypatch.setattr(settings, "tts_monthly_unit_cap", 1)
    audio2 = MemoryAudioStore()
    _bind(audio2, MockTTSProvider())
    capped = client.post(_path(course_id, module_id, first))
    assert capped.status_code == 409
    _clear()


def test_audio_progress_is_not_reading_progress(client, fake_ai) -> None:
    audio = MemoryAudioStore()
    _bind(audio, MockTTSProvider())
    course_id, module_id, lesson_id, _ = _ids(client, fake_ai)
    client.post(_path(course_id, module_id, lesson_id))
    saved = client.put(
        _path(course_id, module_id, lesson_id, "/progress"),
        json={"position_ms": 400, "playback_rate": 1.25},
    )
    assert saved.status_code == 200
    assert saved.json() == {"position_ms": 400, "playback_rate": 1.25}
    progress = client.get(f"/api/v1/courses/{course_id}/progress").json()
    assert progress["lessons_read"] == 0
    play = client.get(_path(course_id, module_id, lesson_id, "/playback")).json()
    assert play["position_ms"] == 400
    assert play["playback_rate"] == 1.25
    _clear()


def test_authorization_and_unpublished(client, fake_ai) -> None:
    audio = MemoryAudioStore()
    _bind(audio, MockTTSProvider())
    course_id, module_id, lesson_id, _ = _ids(client, fake_ai)
    client.post(_path(course_id, module_id, lesson_id))
    app.dependency_overrides[get_current_user_id] = lambda: OTHER_USER
    denied = client.get(_path(course_id, module_id, lesson_id, "/playback"))
    assert denied.status_code == 404
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID
    course = client.get(f"/api/v1/courses/{course_id}").json()
    unpublished = course["modules"][1]["id"]
    blocked = client.post(_path(course_id, unpublished, lesson_id))
    assert blocked.status_code in {404, 409}
    _clear()


def test_audio_does_not_touch_credit_ledger(client, fake_ai) -> None:
    audio = MemoryAudioStore()
    book = MemoryCommercialLedger()
    _bind(audio, MockTTSProvider())
    app.dependency_overrides[get_commercial_ledger] = lambda: book
    course_id, module_id, lesson_id, _ = _ids(client, fake_ai)
    client.post(_path(course_id, module_id, lesson_id))
    assert book.entries == []
    assert book.reservations == {}
    _clear()


def test_mock_rejected_in_production(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "tts_provider", "mock")
    monkeypatch.setattr(settings, "tts_allow_mock", True)
    try:
        create_tts_provider()
        raise AssertionError("mock must not run in production")
    except Exception as exc:
        assert getattr(exc, "code", None) == "audio_unavailable"


def test_elevenlabs_without_credentials_does_not_call_network(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "tts_provider", "elevenlabs")
    monkeypatch.setattr(settings, "tts_allow_mock", False)
    monkeypatch.setattr(settings, "elevenlabs_api_key", None)
    try:
        create_tts_provider()
        raise AssertionError("missing key must not silently mock")
    except Exception as exc:
        assert getattr(exc, "code", None) == "audio_unavailable"


def test_elevenlabs_adapter_sends_key_and_records_characters(monkeypatch) -> None:
    seen: dict = {}

    def fake_post(url, **kwargs):
        seen["url"] = url
        seen["headers"] = kwargs["headers"]
        seen["json"] = kwargs["json"]
        seen["params"] = kwargs["params"]
        return httpx.Response(200, content=SILENT_MP3)

    monkeypatch.setattr(
        "auteur_api.modules.audio.providers.elevenlabs.httpx.post", fake_post
    )
    provider = ElevenLabsProvider("secret-key", base_url="https://api.elevenlabs.io")
    result = provider.synthesize(
        "Hello there",
        attempt_id="att-1",
        voice_id="voice-1",
        model="eleven_multilingual_v2",
        output_format="mp3_44100_128",
    )
    assert result.billed_units == len("Hello there")
    assert result.audio[:2] == SILENT_MP3[:2]
    assert seen["headers"]["xi-api-key"] == "secret-key"
    assert "secret-key" not in seen["url"]
    assert seen["json"]["text"] == "Hello there"


def test_fragment_order_with_small_limit(client, fake_ai, monkeypatch) -> None:
    audio = MemoryAudioStore()
    provider = MockTTSProvider()
    monkeypatch.setattr(settings, "tts_max_input", 80)
    _bind(audio, provider)
    course_id, module_id, lesson_id, _ = _ids(client, fake_ai)
    client.post(_path(course_id, module_id, lesson_id))
    row = next(iter(audio.narrations.values()))
    chunks = audio.list_chunks(row.id)
    assert [chunk.index for chunk in chunks] == list(range(len(chunks)))
    assert len(chunks) >= 2
    assert "".join(provider.calls) == "".join(chunk.text for chunk in chunks)
    _clear()


def test_audio_requires_auth(open_client: TestClient) -> None:
    app.dependency_overrides[get_audio_store] = lambda: MemoryAudioStore()
    app.dependency_overrides[get_tts_provider] = lambda: MockTTSProvider()
    response = open_client.post(
        "/api/v1/courses/x/modules/y/lessons/z/audio"
    )
    app.dependency_overrides.pop(get_audio_store, None)
    app.dependency_overrides.pop(get_tts_provider, None)
    assert response.status_code == 401


def test_two_posts_do_not_duplicate_ready_chunks(client, fake_ai) -> None:
    audio = MemoryAudioStore()
    provider = MockTTSProvider()
    _bind(audio, provider)
    course_id, module_id, lesson_id, _ = _ids(client, fake_ai)
    path = _path(course_id, module_id, lesson_id)
    client.post(path)
    first_calls = len(provider.calls)
    client.post(path)
    client.post(path)
    assert len(provider.calls) == first_calls
    assert len(audio.narrations) == 1
    _clear()
