"""In-process wake for one held course-status read (DEC-004).

The build notifies after it persists a change. A waiting GET returns on that
signal. This is not a queue, a worker, or a timer of database reads.
"""

from __future__ import annotations

import asyncio

_events: dict[str, asyncio.Event] = {}


def reset_waits() -> None:
    _events.clear()


def begin_wait(course_id: str) -> asyncio.Event:
    """Event the next notify will set. A spent event is replaced."""
    event = _events.get(course_id)
    if event is None or event.is_set():
        event = asyncio.Event()
        _events[course_id] = event
    return event


def notify_course(course_id: str) -> None:
    event = _events.get(course_id)
    if event is not None and not event.is_set():
        event.set()
