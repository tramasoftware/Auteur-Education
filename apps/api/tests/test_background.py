"""DEC-004 on Vercel: generation stays on the request that accepted it.

A long-lived process keeps using asyncio. A Vercel invocation only stays
alive for FastAPI background tasks after the response is sent.
"""

from __future__ import annotations

import asyncio
import os

from fastapi import BackgroundTasks

import auteur_api.main as main_module
from auteur_api.core.background import AsyncioTaskRunner, bind_request_tasks
from auteur_api.main import resume_on_startup


def test_local_schedule_runs_in_process(monkeypatch) -> None:
    monkeypatch.delenv("VERCEL", raising=False)

    async def scenario() -> None:
        ran = False

        async def work() -> None:
            nonlocal ran
            ran = True

        await AsyncioTaskRunner().schedule(work())
        await asyncio.sleep(0)
        assert ran is True

    asyncio.run(scenario())


def test_vercel_schedule_runs_only_when_background_tasks_run(monkeypatch) -> None:
    monkeypatch.setenv("VERCEL", "1")

    async def scenario() -> None:
        ran = False

        async def work() -> None:
            nonlocal ran
            ran = True

        background = BackgroundTasks()
        bound = bind_request_tasks(background)
        await bound.__anext__()
        try:
            await AsyncioTaskRunner().schedule(work())
            assert ran is False
        finally:
            await bound.aclose()

        await background()
        assert ran is True

    asyncio.run(scenario())


def test_resume_on_startup_is_off_when_vercel_is_set(monkeypatch) -> None:
    monkeypatch.setattr(main_module, "startup_resume_enabled", True)
    monkeypatch.setenv("VERCEL", "1")
    assert resume_on_startup() is False
    monkeypatch.delenv("VERCEL")
    assert os.environ.get("VERCEL") is None
    assert resume_on_startup() is True
