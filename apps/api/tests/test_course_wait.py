"""A held status read returns when the build saves a lesson (DEC-004, DEC-023)."""

from __future__ import annotations

import asyncio

from httpx import ASGITransport, AsyncClient
from tests.test_learning_progress import make_course, save

from auteur_api.main import app
from auteur_api.modules.generation.schemas import CourseState, LessonState, ModuleState


def test_status_wait_returns_when_the_lesson_is_saved(client) -> None:
    course = save(make_course((ModuleState.WRITING, 1), state=CourseState.WRITING))
    course.current_activity = "Module 1: writing lesson 1"
    save(course)
    lesson = course.modules[0].lessons[0]
    seen = client.get(f"/api/v1/courses/{course.id}/status").json()["seen"]

    async def scenario() -> None:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as http:

            async def approve() -> None:
                await asyncio.sleep(0.05)
                lesson.state = LessonState.APPROVED
                save(course)

            pending = asyncio.create_task(approve())
            response = await http.get(
                f"/api/v1/courses/{course.id}/status",
                params={"wait": "true", "seen": seen},
            )
            await pending
            body = response.json()
            assert response.status_code == 200
            assert body["modules"][0]["lessons"][0]["state"] == "approved"
            assert body["seen"] != seen

    asyncio.run(scenario())
