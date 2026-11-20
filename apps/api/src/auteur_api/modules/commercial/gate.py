"""Internal credit hold for a system-confirmed Blueprint.

DEC-024. This does not run while COMMERCIAL_GATE_ENABLED is false, and it is
not the screen where a learner should be offered Checkout.
"""

from __future__ import annotations

import logging

from auteur_api.core.config import settings
from auteur_api.core.errors import ApiError, invalid_state
from auteur_api.modules.commercial.access import get_commercial_ledger

logger = logging.getLogger("auteur_api.commercial")

SUBJECT_TYPE = "blueprint_version"


def hold_for_blueprint(user_id: str, blueprint_id: str, version: int) -> str:
    if not settings.commercial_gate_enabled:
        return "skipped"
    ledger = get_commercial_ledger()
    rate = ledger.active_rate("course_build")
    if rate is None:
        raise ApiError(
            "commercial_not_configured",
            "Course generation is not available for purchase yet.",
        )
    outcome = ledger.reserve_credits(
        user_id=user_id,
        subject_type=SUBJECT_TYPE,
        subject_id=_subject(blueprint_id, version),
        rate_key=rate.rate_key,
        rate_version=rate.version,
        credits=rate.credits,
    )
    if outcome == "insufficient":
        raise ApiError(
            "insufficient_credits",
            "There are not enough credits to start this course.",
        )
    if outcome == "already_refunded":
        raise invalid_state("This Blueprint version was already settled.")
    return outcome


def confirm_hold(blueprint_id: str, version: int, course_id: str) -> None:
    if not settings.commercial_gate_enabled:
        return
    get_commercial_ledger().confirm_reservation(
        subject_type=SUBJECT_TYPE,
        subject_id=_subject(blueprint_id, version),
        course_id=course_id,
    )


def release_hold(blueprint_id: str, version: int) -> None:
    if not settings.commercial_gate_enabled:
        return
    get_commercial_ledger().release_reservation(
        subject_type=SUBJECT_TYPE,
        subject_id=_subject(blueprint_id, version),
    )


def restitute_failed_course(course_id: str) -> None:
    """Internal credit restitution. This is not a Stripe refund."""
    if not settings.commercial_gate_enabled:
        return
    try:
        get_commercial_ledger().refund_for_course(course_id)
    except Exception:
        logger.info("credit_restitution_failed course=%s", course_id)


def _subject(blueprint_id: str, version: int) -> str:
    return f"{blueprint_id}:{version}"
