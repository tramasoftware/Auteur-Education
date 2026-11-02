"""Attach an anonymous visitor's learning rows to a permanent account."""

from auteur_api.core.store import Store


def attach_anonymous_owner(
    store: Store, *, anonymous_user_id: str, permanent_user_id: str
) -> bool:
    """BR-AUT-005. Returns whether any ownership change was required."""
    if anonymous_user_id == permanent_user_id:
        return False
    store.reassign_owner(anonymous_user_id, permanent_user_id)
    return True
