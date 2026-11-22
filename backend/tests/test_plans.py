import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import Settings, get_settings
from app.services.plans import PlanStore

PREFIX = "/product-forecast/api/v1/plans"

@pytest.fixture
def client(tmp_path):
    path = str(tmp_path / "plans.sqlite3")
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, database_path=path)
    with TestClient(app) as http:
        yield http, path
    app.dependency_overrides.clear()

def create(http, name="신제품"):
    response = http.post(PREFIX, json={"name": "출시 계획", "product_name": name})
    assert response.status_code == 201
    return response.json()

def test_phase_selection_is_independent_and_persistent(client):
    http, path = client
    plan = create(http)
    base = f"{PREFIX}/{plan['id']}"
    assert [p['name'] for p in plan['phases']] == ["계획", "내부 협의 완료", "고객 협의 완료"]
    for name in ["v1", "v2"]:
        response = http.post(base + "/versions", json={"name": name, "content": name + " 내용"})
        assert response.status_code == 201
        plan = response.json()
    first, second = plan["versions"]
    p1, p2, p3 = plan["phases"]
    for phase, version in [(p1, first), (p2, second)]:
        assert http.put(f"{base}/phases/{phase['id']}/selection", json={"version_id": version["id"]}).status_code == 200
    assert http.patch(f"{base}/phases/{p1['id']}", json={"name": "초기 계획"}).status_code == 200
    assert http.post(base + "/phases", json={"name": "양산 승인"}).status_code == 201
    saved = PlanStore(path).list()[0]
    assert [p.version_id for p in saved.phases] == [first["id"], second["id"], None, None]
    assert saved.phases[0].name == "초기 계획"
    assert saved.versions[0].content == "v1 내용"
    assert http.put(f"{base}/phases/{p1['id']}/selection", json={"version_id": None}).json()["phases"][0]["version_id"] is None
    assert len(http.get(PREFIX).json()) == 1

def test_invalid_input_and_cross_plan_references(client):
    http, _ = client
    a, b = create(http), create(http, "다른 제품")
    base = f"{PREFIX}/{a['id']}"
    version = http.post(f"{PREFIX}/{b['id']}/versions", json={"name": "v1"}).json()["versions"][0]
    phase = a["phases"][0]
    assert http.put(f"{base}/phases/{phase['id']}/selection", json={"version_id": version["id"]}).status_code == 422
    assert http.patch(f"{base}/phases/{b['phases'][0]['id']}", json={"name": "잘못된 수정"}).status_code == 404
    assert http.post(PREFIX, json={"name": "  ", "product_name": "제품"}).status_code == 422
    assert http.post(base + "/phases", json={"name": "계획"}).status_code == 409
    assert http.patch(f"{base}/phases/{phase['id']}", json={"name": "내부 협의 완료"}).status_code == 409
    assert http.post(base + "/versions", json={"name": "v1"}).status_code == 201
    assert http.post(base + "/versions", json={"name": " v1 "}).status_code == 409
    assert http.post(base + "/versions", json={"name": "v2", "content": "x" * 20001}).status_code == 422
    assert http.post(PREFIX + "/missing/phases", json={"name": "Phase"}).status_code == 404
    assert http.get(PREFIX).json()[1]["phases"][0]["version_id"] is None
