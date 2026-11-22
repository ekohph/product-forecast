from fastapi import FastAPI

from app.api.v1.router import router
from app.core.config import API_PREFIX

app = FastAPI(
    title="Product Forecast API",
    version="0.1.0",
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=None,
    openapi_url=f"{API_PREFIX}/openapi.json",
)
app.include_router(router, prefix=API_PREFIX)
