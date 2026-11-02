"""Internal redirect targets. Rejects open redirects."""

from urllib.parse import unquote


def safe_internal_path(value: str | None, default: str = "/") -> str:
    if value is None:
        return default
    candidate = value.strip()
    if not _is_internal(candidate):
        return default
    decoded = unquote(candidate)
    if decoded != candidate and not _is_internal(decoded):
        return default
    return candidate


def _is_internal(candidate: str) -> bool:
    if not candidate.startswith("/"):
        return False
    if candidate.startswith("//") or candidate.startswith("/\\"):
        return False
    if "\\" in candidate or "://" in candidate:
        return False
    return True
