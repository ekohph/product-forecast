from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

API_PREFIX = "/product-forecast/api/v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PF_", env_file=".env", extra="ignore")
    service_name: str = "product-forecast"
    database_path: str = str(Path(__file__).resolve().parents[2] / "data" / "forecast.sqlite3")
    roadmap_database_path: str = str(Path(__file__).resolve().parents[2] / "data" / "roadmaps.duckdb")


@lru_cache
def get_settings() -> Settings:
    return Settings()
