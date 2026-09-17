"""Shared test fixtures.

`FakeAIClient` returns scripted structured outputs per schema type, so tests
verify contracts, business rules and validators without calling a provider
(30-testing §5: structure over exact wording).
"""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from auteur_api.ai.client import (
    Citation,
    GenerationError,
    StructuredResult,
    get_ai_client,
)
from auteur_api.ai.tracing import TokenUsage
from auteur_api.core.background import ImmediateTaskRunner, get_task_runner
from auteur_api.core.store import get_store, store
from auteur_api.main import app

Payload = dict[str, Any] | Callable[[str], dict[str, Any]] | Exception


class FakeAIClient:
    def __init__(self) -> None:
        self._scripts: dict[type[BaseModel], deque[Payload]] = defaultdict(deque)
        self._defaults: dict[type[BaseModel], Payload] = {}
        self.calls: list[dict[str, Any]] = []
        self.citations: list[Citation] = []

    def enqueue(self, schema: type[BaseModel], payload: Payload) -> None:
        self._scripts[schema].append(payload)

    def default(self, schema: type[BaseModel], payload: Payload) -> None:
        self._defaults[schema] = payload

    async def generate_structured(
        self,
        *,
        instructions: str,
        input: str,
        schema: type[BaseModel],
        web_search: bool = False,
        search_context_size: str = "medium",
    ) -> StructuredResult[BaseModel]:
        self.calls.append(
            {
                "schema": schema.__name__,
                "instructions": instructions,
                "input": input,
                "web_search": web_search,
            }
        )
        queue = self._scripts.get(schema)
        if queue:
            payload = queue.popleft()
        elif schema in self._defaults:
            payload = self._defaults[schema]
        else:
            raise AssertionError(f"No fake response scripted for {schema.__name__}")
        if isinstance(payload, Exception):
            raise payload
        if callable(payload):
            payload = payload(input)
        parsed = schema.model_validate(payload)
        return StructuredResult(
            parsed=parsed,
            usage=TokenUsage(input_tokens=10, output_tokens=20, total_tokens=30),
            model="fake-model",
            duration_ms=5,
            citations=list(self.citations),
        )


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def fake_ai() -> Iterator[FakeAIClient]:
    fake = FakeAIClient()
    app.dependency_overrides[get_ai_client] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_ai_client, None)


@pytest.fixture
def client(fake_ai: FakeAIClient) -> Iterator[TestClient]:
    store.reset()
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_task_runner] = lambda: ImmediateTaskRunner()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_store, None)
    app.dependency_overrides.pop(get_task_runner, None)
    store.reset()


def provider_error() -> GenerationError:
    return GenerationError("provider", "The AI provider timed out.")


def schema_error() -> GenerationError:
    return GenerationError("schema", "bad output")
