"""Open redirects stay inside the application."""

from auteur_api.core.redirects import safe_internal_path


def test_external_next_is_rejected() -> None:
    assert safe_internal_path("https://evil.example/steal") == "/"
    assert safe_internal_path("//evil.example") == "/"
    assert safe_internal_path("/\\evil.example") == "/"
    assert safe_internal_path("/%2f%2fevil.example") == "/"


def test_internal_next_is_kept() -> None:
    assert safe_internal_path("/proposals?request=abc") == "/proposals?request=abc"
    assert safe_internal_path("/login?mode=password") == "/login?mode=password"
