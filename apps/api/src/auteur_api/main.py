import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auteur_api.api.v1.router import api_router
from auteur_api.api.v1.routes.health import router as health_router
from auteur_api.core.config import settings
from auteur_api.core.errors import register_error_handlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger("auteur_api")

# Tests disable this so TestClient startup does not resume real or leftover builds.
startup_resume_enabled = True


def resume_on_startup() -> bool:
    """DEC-013 needs one long-lived process. A Vercel cold start is not that."""
    if not startup_resume_enabled:
        return False
    return not os.environ.get("VERCEL")


@asynccontextmanager
async def lifespan(_application: FastAPI):
    if resume_on_startup():
        await _resume_incomplete_builds()
    yield


async def _resume_incomplete_builds() -> None:
    if not settings.supabase_configured or not settings.has_openai_api_key:
        return
    from auteur_api.ai.client import get_ai_client
    from auteur_api.core.background import get_task_runner
    from auteur_api.core.store import get_store
    from auteur_api.modules.generation.build import resume_incomplete_builds

    try:
        await resume_incomplete_builds(
            ai=get_ai_client(),
            store=get_store(),
            runner=get_task_runner(),
        )
    except Exception:
        logger.exception("startup_resume_failed")


def create_app() -> FastAPI:
    application = FastAPI(
        title="Auteur Education API",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(application)
    application.include_router(health_router)
    application.include_router(api_router, prefix="/api/v1")
    return application


app = create_app()
