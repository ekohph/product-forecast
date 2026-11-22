from pydantic import BaseModel, ConfigDict, Field


class NamedInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=120)


class PlanCreate(NamedInput):
    product_name: str = Field(min_length=1, max_length=120)


class VersionCreate(NamedInput):
    content: str = Field(default="", max_length=20000)


class Version(VersionCreate):
    id: str


class Selection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version_id: str | None


class Phase(NamedInput):
    id: str
    version_id: str | None = None


class Plan(PlanCreate):
    id: str
    versions: list[Version]
    phases: list[Phase]
