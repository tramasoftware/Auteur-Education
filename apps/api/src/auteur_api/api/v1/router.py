from fastapi import APIRouter

from auteur_api.api.v1.routes.blueprints import router as blueprints_router
from auteur_api.api.v1.routes.courses import router as courses_router
from auteur_api.api.v1.routes.health import router as health_router
from auteur_api.api.v1.routes.learning_requests import (
    router as learning_requests_router,
)

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(learning_requests_router)
api_router.include_router(blueprints_router)
api_router.include_router(courses_router)
