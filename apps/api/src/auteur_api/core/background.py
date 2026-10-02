"""In-process background execution for long generation (DEC-004).

Not a job system. On a long-lived process, tasks run with asyncio. On Vercel
the invocation freezes after the response unless the work is a FastAPI
BackgroundTask, so those requests register the same coroutine there. Durable
course state lives in Postgres when configured; incomplete builds are resumed
on API startup only for a long-lived process (DEC-013). Tests replace the
runner with an immediate one.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator, Awaitable, Coroutine
from contextvars import ContextVar
from typing import Any, Protocol

from fastapi import BackgroundTasks

logger = logging.getLogger("auteur_api.background")

_request_tasks: ContextVar[BackgroundTasks | None] = ContextVar(
    "auteur_request_background_tasks",
    default=None,
)


class TaskRunner(Protocol):
    async def schedule(self, coro: Coroutine[Any, Any, None]) -> None: ...


async def bind_request_tasks(
    background_tasks: BackgroundTasks,
) -> AsyncIterator[None]:
    """Expose this request's BackgroundTasks to schedule()."""
    token = _request_tasks.set(background_tasks)
    try:
        yield
    finally:
        _request_tasks.reset(token)


class AsyncioTaskRunner:
    def __init__(self) -> None:
        self._tasks: set[asyncio.Task[None]] = set()

    async def schedule(self, coro: Coroutine[Any, Any, None]) -> None:
        tasks = _request_tasks.get()
        if os.environ.get("VERCEL"):
            if tasks is None:
                logger.error(
                    "vercel_schedule_without_background_tasks; the invocation "
                    "can freeze before generation finishes"
                )
            else:
                # Fluid Compute keeps the invocation alive for FastAPI
                # background tasks after the 202 is sent. create_task does not.
                tasks.add_task(self._guard, coro)
                return
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
