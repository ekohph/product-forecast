from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app


def test_health_contract():
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, service_name="product-forecast")
    try:
        with TestClient(app) as client:
            response = client.get("/product-forecast/api/v1/health")
            assert response.status_code == 200
            assert response.json() == {"status": "ok", "service": "product-forecast"}
    finally:
        app.dependency_overrides.clear()


def test_openapi_and_docs_use_public_prefix():
    with TestClient(app) as client:
        schema = client.get("/product-forecast/api/v1/openapi.json")
        assert schema.status_code == 200
        assert "/product-forecast/api/v1/health" in schema.json()["paths"]
        docs = client.get("/product-forecast/api/v1/docs")
        assert docs.status_code == 200
        assert "/product-forecast/api/v1/openapi.json" in docs.text
        assert client.get("/health").status_code == 404
