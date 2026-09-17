import logging

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


def create_app() -> FastAPI:
    application = FastAPI(
        title="Auteur Education API",
        version="0.1.0",
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
