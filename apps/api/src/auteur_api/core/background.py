"""In-process background execution for long generation (DEC-004).

Not a job system. Tasks run inside the API process with asyncio. Durable
course state lives in Postgres when configured; incomplete builds are
resumed on API startup (DEC-013). Tests replace the runner with an immediate one.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Coroutine
from typing import Any, Protocol

logger = logging.getLogger("auteur_api.background")


class TaskRunner(Protocol):
    async def schedule(self, coro: Coroutine[Any, Any, None]) -> None: ...


class AsyncioTaskRunner:
    def __init__(self) -> None:
        self._tasks: set[asyncio.Task[None]] = set()

    async def schedule(self, coro: Coroutine[Any, Any, None]) -> None:
        task = asyncio.create_task(self._guard(coro))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    @staticmethod
    async def _guard(coro: Awaitable[None]) -> None:
        try:
            await coro
        except Exception:
            # Generation code records its own failure state; this only prevents
            # silent task loss.
            logger.exception("background_task_crashed")


class ImmediateTaskRunner:
    """Runs the task before returning. Used in tests."""

    async def schedule(self, coro: Coroutine[Any, Any, None]) -> None:
        await coro


_runner = AsyncioTaskRunner()


def get_task_runner() -> TaskRunner:
    return _runner
