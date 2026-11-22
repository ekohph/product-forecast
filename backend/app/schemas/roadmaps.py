from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RoadmapKey(StrictModel):
    product: Name
    build: Name
    phase: Name
    version: Name

    @model_validator(mode="after")
    def valid_names(self):
        if any(value in ("(추가)", "(제품추가)") for value in self.model_dump().values()):
            raise ValueError("추가 메뉴 이름은 저장 키로 사용할 수 없습니다.")
        return self


class RoadmapMonth(StrictModel):
    key: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    label: str
    year: int = Field(ge=1, le=9999)
    quarter: int = Field(ge=1, le=4)

    @model_validator(mode="after")
    def consistent_month(self):
        year, month = map(int, self.key.split("-"))
        labels = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
        if self.year != year or self.quarter != (month - 1) // 3 + 1 or self.label != labels[month - 1]:
            raise ValueError("월 정보가 일치하지 않습니다.")
        return self


class RoadmapItem(StrictModel):
    id: Name
    name: Name
    startDate: date
    endDate: date

    @model_validator(mode="after")
    def valid_range(self):
        if self.startDate > self.endDate:
            raise ValueError("종료일은 시작일보다 빠를 수 없습니다.")
        return self


class RoadmapMilestone(RoadmapItem):
    kind: Literal["milestone"]
    content: str = Field(max_length=20000)

    @model_validator(mode="after")
    def single_target_date(self):
        if self.startDate != self.endDate:
            raise ValueError("마일스톤은 하나의 Target Date를 가져야 합니다.")
        return self


class RoadmapData(StrictModel):
    months: list[RoadmapMonth] = Field(max_length=1200)
    items: list[RoadmapItem | RoadmapMilestone] = Field(max_length=5000)
    sort: Literal[
        "Start Date (Ascending)", "End Date (Ascending)", "Milestone Date (Ascending)",
        "Start Date (Descending)", "End Date (Descending)", "Milestone Date (Descending)",
    ] = "Start Date (Ascending)"

    @model_validator(mode="after")
    def unique_entries(self):
        keys = [month.key for month in self.months]
        if keys != sorted(set(keys)):
            raise ValueError("월은 중복 없이 시간 순으로 정렬해야 합니다.")
        ids = [item.id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("항목 ID는 중복될 수 없습니다.")
        return self


class RoadmapSave(StrictModel):
    revision: int = Field(ge=0)
    data: RoadmapData


class RoadmapResponse(StrictModel):
    revision: int
    data: RoadmapData | None
    updated_at: str | None = None


class RoadmapCatalog(StrictModel):
    product: list[str]
    build: list[str]
    phase: list[str]
    version: list[str]


class PhaseVersion(StrictModel):
    phase: Name
    version: Name


class ProductCreate(StrictModel):
    product: Name


class ProductBuilds(ProductCreate):
    builds: list[Name] = Field(max_length=500)
    previous_builds: list[Name] = Field(max_length=500)

    @model_validator(mode="after")
    def unique_builds(self):
        if len(set(self.builds)) != len(self.builds) or any(value in ("(추가)", "(제품추가)") for value in self.builds):
            raise ValueError("Build 이름이 중복되었거나 사용할 수 없는 이름입니다.")
        return self


class VersionCreate(PhaseVersion):
    copy_from: Name | None = None


class VersionInfo(StrictModel):
    version: str
    updated_at: str | None
    roadmap_count: int
    has_content: bool = False
    content: str = ""


class VersionNote(PhaseVersion):
    content: str = Field(max_length=200)
    previous_content: str = Field(max_length=200)


class VersionDeletionPreview(StrictModel):
    roadmap_count: int
    token: str
    has_note: bool = False


class VersionDeletion(PhaseVersion):
    token: str = Field(pattern=r"^[0-9a-f]{64}$")
    confirmed: bool = False


class PhaseAdvanceBuild(RoadmapSave):
    build: Name


class PhaseAdvance(StrictModel):
    product: Name
    phase: Name
    version: Name
    target_phase: Name
    target_version: Name
    builds: list[PhaseAdvanceBuild] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def distinct_destination_and_builds(self):
        if self.phase == self.target_phase:
            raise ValueError("다른 Phase를 선택해 주세요.")
        if len({item.build for item in self.builds}) != len(self.builds):
            raise ValueError("Build가 중복되었습니다.")
        return self
