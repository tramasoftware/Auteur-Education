"""Structured, safe API errors (BR-ERR-001, BR-ERR-004).

Error codes are stable categories consumed by the frontend. Messages explain what
happened and what the user can do; they never contain secrets, stack traces or
raw provider errors.
"""

from __future__ import annotations

import logging
import uuid
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger("auteur_api.errors")

ErrorCode = Literal[
    "validation_error",
    "non_english_input",
    "not_found",
    "invalid_state",
    "stale_version",
    "generation_failed",
    "provider_unavailable",
    "internal_error",
]

_STATUS_BY_CODE: dict[str, int] = {
    "validation_error": 422,
    "non_english_input": 422,
    "not_found": 404,
    "invalid_state": 409,
    "stale_version": 409,
    "generation_failed": 502,
    "provider_unavailable": 503,
    "internal_error": 500,
}


class ErrorDetail(BaseModel):
    field: str | None = None
    issue: str


class ErrorBody(BaseModel):
    code: ErrorCode
    message: str
    support_reference: str
    details: list[ErrorDetail] = []


class ErrorResponse(BaseModel):
    error: ErrorBody


class ApiError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        details: list[ErrorDetail] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or []
        self.status_code = _STATUS_BY_CODE[code]
        self.support_reference = new_support_reference()


def new_support_reference() -> str:
    return uuid.uuid4().hex[:12]


def not_found(resource: str) -> ApiError:
    return ApiError("not_found", f"{resource} was not found.")


def invalid_state(message: str) -> ApiError:
    return ApiError("invalid_state", message)


def _error_response(
    status_code: int,
    code: ErrorCode,
    message: str,
    support_reference: str,
    details: list[ErrorDetail] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorBody(
            code=code,
            message=message,
            support_reference=support_reference,
            details=details or [],
        )
    )
    return JSONResponse(status_code=status_code, content=body.model_dump())


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        if exc.status_code >= 500:
            logger.warning(
                "api_error code=%s ref=%s message=%s",
                exc.code,
                exc.support_reference,
                exc.message,
            )
        return _error_response(
            exc.status_code, exc.code, exc.message, exc.support_reference, exc.details
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = [
            ErrorDetail(
                field=".".join(str(p) for p in err.get("loc", []) if p != "body"),
                issue=str(err.get("msg", "Invalid value")),
            )
            for err in exc.errors()
        ]
        return _error_response(
            422,
            "validation_error",
            "Some fields are missing or invalid. Please review the highlighted "
            "fields and try again. Nothing was saved.",
            new_support_reference(),
            details,
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
        reference = new_support_reference()
        logger.exception("unhandled_error ref=%s", reference)
        return _error_response(
            500,
            "internal_error",
            "Something went wrong on our side. Your confirmed information was "
            "kept. Please try again or contact support with the reference.",
            reference,
        )
