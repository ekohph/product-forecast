import logging
from typing import Annotated

import duckdb
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import Settings, get_settings
from app.schemas.roadmaps import RoadmapCatalog, RoadmapKey, RoadmapResponse, RoadmapSave
from app.schemas.roadmaps import Name, PhaseVersion, VersionCreate, VersionInfo, VersionDeletion, VersionDeletionPreview, PhaseAdvance, VersionNote
from app.schemas.roadmaps import ProductCreate, ProductBuilds, FeatureList
from app.services.roadmaps import RoadmapConflict, RoadmapStore

router = APIRouter(prefix="/roadmaps", tags=["roadmaps"])
logger = logging.getLogger(__name__)


def store(settings: Settings = Depends(get_settings)):
    return RoadmapStore(settings.roadmap_database_path)


def invoke(action):
    try:
        return action()
    except RoadmapConflict as exc:
        raise HTTPException(409, detail=str(exc)) from exc
    except (duckdb.Error, OSError) as exc:
        logger.exception("Roadmap database operation failed")
        raise HTTPException(503, detail="로드맵 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.") from exc


@router.get("/catalog", response_model=RoadmapCatalog)
def catalog(phase: Name | None = None, product: Name | None = None, db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.catalog(phase, product))


@router.get("/features", response_model=FeatureList)
def list_features(db: RoadmapStore = Depends(store)):
    return invoke(db.features)


@router.put("/features", response_model=FeatureList)
def save_features(request: FeatureList, db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.features(request))


@router.post("/products")
def create_product(request: ProductCreate, db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.create_product(request.product))


@router.put("/products/builds")
def save_product_builds(request: ProductBuilds, db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.save_product_builds(request))


@router.post("/versions")
def add_version(request: VersionCreate, db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.add_version(request))


@router.post("/advance-phase")
def advance_phase(request: PhaseAdvance, db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.advance_phase(request))


@router.get("/versions", response_model=list[VersionInfo])
def version_details(phase: Name, db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.version_details(phase))


@router.patch("/versions/content")
def save_version_note(request: VersionNote, db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.save_version_note(request))


@router.get("/versions/deletion", response_model=VersionDeletionPreview)
def preview_version_deletion(key: Annotated[PhaseVersion, Query()], db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.preview_version_deletion(key))


@router.delete("/versions")
def delete_version(request: VersionDeletion, db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.delete_version(request))


@router.get("", response_model=RoadmapResponse)
def get_roadmap(key: Annotated[RoadmapKey, Query()], db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.get(key))


@router.put("", response_model=RoadmapResponse)
def save_roadmap(key: Annotated[RoadmapKey, Query()], request: RoadmapSave, db: RoadmapStore = Depends(store)):
    return invoke(lambda: db.save(key, request))
