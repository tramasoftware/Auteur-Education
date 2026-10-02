"""Vercel FastAPI entrypoint (`main:app`).

The package lives under `src/` and is not installed as a wheel on Vercel.
This shim puts that directory on the path so the builder can import `app`.
"""

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from auteur_api.main import app  # noqa: E402

__all__ = ["app"]
