from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.schemas.plans import NamedInput, Plan, PlanCreate, Selection, VersionCreate
from app.services.plans import PlanError, PlanStore

router = APIRouter(prefix="/plans", tags=["plans"])


def store(settings: Settings = Depends(get_settings)):
    return PlanStore(settings.database_path)


def invoke(action):
    try:
        return action()
    except PlanError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


@router.get("", response_model=list[Plan])
def list_plans(db: PlanStore = Depends(store)):
    return invoke(db.list)


@router.post("", response_model=Plan, status_code=201)
def create_plan(data: PlanCreate, db: PlanStore = Depends(store)):
    return invoke(lambda: db.create(data))


@router.post("/{plan_id}/versions", response_model=Plan, status_code=201)
def add_version(plan_id: str, data: VersionCreate, db: PlanStore = Depends(store)):
    return invoke(lambda: db.add_version(plan_id, data))


@router.post("/{plan_id}/phases", response_model=Plan, status_code=201)
def add_phase(plan_id: str, data: NamedInput, db: PlanStore = Depends(store)):
    return invoke(lambda: db.add_phase(plan_id, data.name))


@router.patch("/{plan_id}/phases/{phase_id}", response_model=Plan)
def rename_phase(plan_id: str, phase_id: str, data: NamedInput, db: PlanStore = Depends(store)):
    return invoke(lambda: db.update_phase(plan_id, phase_id, name=data.name))


@router.put("/{plan_id}/phases/{phase_id}/selection", response_model=Plan)
def select_version(plan_id: str, phase_id: str, data: Selection, db: PlanStore = Depends(store)):
    return invoke(lambda: db.update_phase(plan_id, phase_id, version_id=data.version_id, select=True))
