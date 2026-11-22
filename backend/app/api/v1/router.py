from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.health import HealthResponse
from app.api.v1.plans import router as plans_router
from app.api.v1.roadmaps import router as roadmaps_router

router = APIRouter()
router.include_router(plans_router)
router.include_router(roadmaps_router)


@router.get("/health", response_model=HealthResponse, tags=["health"])
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(status="ok", service=settings.service_name)
