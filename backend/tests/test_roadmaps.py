from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
import sys

import duckdb
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app
from app.schemas.roadmaps import RoadmapKey, RoadmapSave
from app.services.roadmaps import RoadmapConflict, RoadmapStore

PREFIX = "/product-forecast/api/v1/roadmaps"
KEY = {"product": "신제품 / 4175", "build": "P1", "phase": "고객 협의 완료", "version": "1.2"}
DATA = {
    "sort": "Start Date (Ascending)",
    "months": [
        {"key": "2026-11", "label": "Nov", "year": 2026, "quarter": 4},
        {"key": "2027-01", "label": "Jan", "year": 2027, "quarter": 1},
    ],
    "items": [{"id": "item-1", "name": "고객 샘플", "startDate": "2026-11-02", "endDate": "2027-01-12"}],
}


@pytest.fixture
def database(tmp_path):
    path = tmp_path / "roadmaps.duckdb"
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, roadmap_database_path=str(path))
    yield path
    app.dependency_overrides.clear()


def test_saved_roadmap_is_visible_to_next_client_and_process(database):
    with TestClient(app) as first:
        assert first.get(PREFIX, params=KEY).json() == {"revision": 0, "data": None, "updated_at": None}
        response = first.put(PREFIX, params=KEY, json={"revision": 0, "data": DATA})
        assert response.status_code == 200, response.text
        saved = response.json()
        assert saved["revision"] == 1
        assert saved["data"] == DATA
        assert saved["updated_at"]
    with TestClient(app) as second:
        assert second.get(PREFIX, params=KEY).json() == saved
        catalog = second.get(PREFIX + "/catalog").json()
        for category, value in KEY.items():
            assert value in catalog[category]
    code = "import duckdb,json,sys; c=duckdb.connect(sys.argv[1]); print(c.execute('SELECT payload FROM roadmaps').fetchone()[0]); c.close()"
    fresh = subprocess.run([sys.executable, "-X", "utf8", "-c", code, str(database)], check=True, capture_output=True, encoding="utf-8")
    assert json.loads(fresh.stdout) == DATA


def test_phase_versions_persist_and_catalog_is_scoped(database):
    with TestClient(app) as client:
        assert client.post(PREFIX + "/versions", json={"phase": "Plan", "version": "0.91"}).status_code == 200
        assert client.post(PREFIX + "/versions", json={"phase": "Approved", "version": "2.0"}).status_code == 200
        assert client.get(PREFIX + "/catalog", params={"phase": "Plan"}).json()["version"] == ["0.0", "0.91"]
        assert client.get(PREFIX + "/catalog", params={"phase": "Approved"}).json()["version"] == ["0.0", "2.0"]
    with TestClient(app) as other:
        assert "0.91" in other.get(PREFIX + "/catalog", params={"phase": "Plan"}).json()["version"]


def test_product_build_lists_are_independent_persistent_and_keep_history(database):
    defaults = ["POC", "P1", "EVT", "DVT"]
    with TestClient(app) as client:
        for product in ["New A", "New B"]:
            assert client.post(PREFIX + "/products", json={"product": product}).json()["builds"] == defaults
        source = {**KEY, "product": "New A", "build": "P1"}
        saved = client.put(PREFIX, params=source, json={"revision": 0, "data": DATA}).json()
        modified = ["POC", "EVT", "DVT", "Custom"]
        body = {"product": "New A", "previous_builds": defaults, "builds": modified}
        assert client.put(PREFIX + "/products/builds", json=body).status_code == 200
        assert client.put(PREFIX + "/products/builds", json=body).status_code == 409
        assert client.get(PREFIX, params=source).json() == saved
        assert client.put(PREFIX, params=source, json={"revision": 1, "data": DATA}).status_code == 409
        assert client.get(PREFIX + "/catalog", params={"product": "New B"}).json()["build"] == defaults
    with TestClient(app) as client:
        assert client.get(PREFIX + "/catalog", params={"product": "New A"}).json()["build"] == modified
        assert "New A" in client.get(PREFIX + "/catalog").json()["product"]
        assert client.put(PREFIX + "/products/builds", json={"product": "New A", "previous_builds": modified, "builds": []}).status_code == 200
        assert client.get(PREFIX + "/catalog", params={"product": "New A"}).json()["build"] == []


def test_legacy_builds_are_scoped_to_their_product(database):
    with TestClient(app) as client:
        assert client.put(PREFIX, params={**KEY, "build": "Special"}, json={"revision": 0, "data": DATA}).status_code == 200
        assert client.get(PREFIX + "/catalog", params={"product": KEY["product"]}).json()["build"] == ["P1", "EVT", "DVT", "Special"]
        assert client.get(PREFIX + "/catalog", params={"product": "brand new"}).json()["build"] == ["POC", "P1", "EVT", "DVT"]


def test_version_copy_preserves_all_builds_and_products_but_not_other_phases(database):
    with TestClient(app) as client:
        keys = [KEY, {**KEY, "product": "another", "build": "EVT"}, {**KEY, "phase": "Other"}]
        for key in keys:
            assert client.put(PREFIX, params=key, json={"revision": 0, "data": DATA}).status_code == 200
        original = client.get(PREFIX, params=KEY).json()
        created = client.post(PREFIX + "/versions", json={"phase": KEY["phase"], "version": "2.0", "copy_from": KEY["version"]})
        assert created.status_code == 200, created.text
        assert created.json()["roadmap_count"] == 2
        for key in keys[:2]:
            copied = client.get(PREFIX, params={**key, "version": "2.0"}).json()
            assert copied["data"] == DATA
            assert copied["revision"] == 1
            assert copied["updated_at"] == created.json()["updated_at"]
        assert client.get(PREFIX, params={**keys[2], "version": "2.0"}).json()["data"] is None
        target = {**KEY, "version": "2.0"}
        empty = {"months": [], "items": []}
        assert client.put(PREFIX, params=target, json={"revision": 1, "data": empty}).status_code == 200
        assert client.get(PREFIX, params=KEY).json() == original
        assert client.post(PREFIX + "/versions", json={"phase": KEY["phase"], "version": "2.0", "copy_from": KEY["version"]}).status_code == 409
        assert client.get(PREFIX, params=target).json()["data"]["items"] == []


def test_version_details_report_creation_and_latest_save_with_no_invented_default_date(database):
    with TestClient(app) as client:
        assert client.get(PREFIX + "/versions", params={"phase": "Plan"}).json() == [{"version": "0.0", "updated_at": None, "roadmap_count": 0, "has_content": False, "content": ""}]
        created = client.post(PREFIX + "/versions", json={"phase": "Plan", "version": "0.1"}).json()
        details = client.get(PREFIX + "/versions", params={"phase": "Plan"}).json()
        assert next(row for row in details if row["version"] == "0.1")["updated_at"] == created["updated_at"]
        saved = client.put(PREFIX, params={**KEY, "phase": "Plan", "version": "0.1"}, json={"revision": 0, "data": DATA}).json()
        details = client.get(PREFIX + "/versions", params={"phase": "Plan"}).json()
        assert next(row for row in details if row["version"] == "0.1") == {"version": "0.1", "updated_at": saved["updated_at"], "roadmap_count": 1, "has_content": True, "content": ""}


def test_version_note_persistence_limits_conflict_and_phase_isolation(database):
    body = {"phase": "Plan", "version": "0.0", "content": "가" * 198 + "\n끝", "previous_content": ""}
    with TestClient(app) as client:
        response = client.patch(PREFIX + "/versions/content", json=body)
        assert response.status_code == 200, response.text
        timestamp = response.json()["updated_at"]
        assert client.patch(PREFIX + "/versions/content", json={**body, "content": "x" * 201}).status_code == 422
        assert client.patch(PREFIX + "/versions/content", json={**body, "content": "conflict"}).status_code == 409
    with TestClient(app) as client:
        note = client.get(PREFIX + "/versions", params={"phase": "Plan"}).json()[0]
        assert note["content"] == body["content"] and note["updated_at"] == timestamp
        assert client.get(PREFIX + "/versions", params={"phase": "Other"}).json()[0]["content"] == ""
        assert client.patch(PREFIX + "/versions/content", json={**body, "content": "", "previous_content": body["content"]}).status_code == 200
        assert client.get(PREFIX + "/versions", params={"phase": "Plan"}).json()[0]["content"] == ""


def test_note_only_version_deletion_requires_confirmation_and_removes_note(database):
    scope = {"phase": "Plan", "version": "0.0"}
    with TestClient(app) as client:
        assert client.patch(PREFIX + "/versions/content", json={**scope, "content": "memo", "previous_content": ""}).status_code == 200
        preview = client.get(PREFIX + "/versions/deletion", params=scope).json()
        assert preview["roadmap_count"] == 0 and preview["has_note"] is True
        body = {**scope, "token": preview["token"]}
        assert client.request("DELETE", PREFIX + "/versions", json=body).status_code == 409
        assert client.request("DELETE", PREFIX + "/versions", json={**body, "confirmed": True}).status_code == 200
        assert client.patch(PREFIX + "/versions/content", json={**scope, "content": "stale", "previous_content": "memo"}).status_code == 409
        assert client.post(PREFIX + "/versions", json=scope).status_code == 200
        assert client.get(PREFIX + "/versions", params={"phase": "Plan"}).json()[0]["content"] == ""


def test_phase_advance_reuses_empty_zero_but_rejects_populated_zero(database):
    with TestClient(app) as client:
        empty = {**DATA, "items": []}
        target = {**KEY, "phase": "Next", "version": "0.0"}
        assert client.post(PREFIX + "/versions", json={"phase": "Next", "version": "0.0"}).status_code == 200
        assert client.put(PREFIX, params=target, json={"revision": 0, "data": empty}).status_code == 200
        details = client.get(PREFIX + "/versions", params={"phase": "Next"}).json()
        assert next(row for row in details if row["version"] == "0.0")["has_content"] is False
        body = {"product": KEY["product"], "phase": "Plan", "version": "1.0", "target_phase": "Next", "target_version": "0.0",
                "builds": [{"build": KEY["build"], "revision": 0, "data": DATA}]}
        assert client.post(PREFIX + "/advance-phase", json=body).status_code == 200
        saved = client.get(PREFIX, params=target).json()
        assert saved["data"] == DATA and saved["revision"] == 2
        assert client.post(PREFIX + "/advance-phase", json=body).status_code == 409
        assert client.get(PREFIX, params=target).json() == saved
        # A milestone in another product also makes this Phase version nonempty.
        assert client.put(PREFIX, params=target, json={"revision": 2, "data": empty}).status_code == 200
        milestone = {"id": "m", "name": "M", "kind": "milestone", "content": "", "startDate": "2027-01-01", "endDate": "2027-01-01"}
        assert client.put(PREFIX, params={**target, "product": "Other"}, json={"revision": 0, "data": {**DATA, "items": [milestone]}}).status_code == 200
        assert client.post(PREFIX + "/advance-phase", json=body).status_code == 409


def test_missing_or_deleted_copy_source_does_not_create_target(database):
    with TestClient(app) as client:
        for source in ["missing", "1.0"]:
            if source == "1.0":
                scope = {"phase": "Plan", "version": source}
                assert client.post(PREFIX + "/versions", json=scope).status_code == 200
                token = client.get(PREFIX + "/versions/deletion", params=scope).json()["token"]
                assert client.request("DELETE", PREFIX + "/versions", json={**scope, "token": token}).status_code == 200
            assert client.post(PREFIX + "/versions", json={"phase": "Plan", "version": "2.0", "copy_from": source}).status_code == 409
            assert "2.0" not in client.get(PREFIX + "/catalog", params={"phase": "Plan"}).json()["version"]


def test_phase_advance_copies_all_current_drafts_and_preserves_source(database):
    with TestClient(app) as client:
        source = {**KEY, "phase": "Plan", "version": "0.2"}
        originals = {}
        for build in ["P1", "EVT"]:
            originals[build] = client.put(PREFIX, params={**source, "build": build}, json={"revision": 0, "data": DATA}).json()
        other = {**source, "product": "other product"}
        assert client.put(PREFIX, params=other, json={"revision": 0, "data": DATA}).status_code == 200
        draft = {**DATA, "items": [{**DATA["items"][0], "name": "unsaved draft"}], "sort": "End Date (Descending)"}
        request = {"product": source["product"], "phase": "Plan", "version": "0.2", "target_phase": "내부 협의 완료", "target_version": "0.2",
                   "builds": [{"build": build, "revision": 1, "data": draft} for build in ["P1", "EVT"]]}
        response = client.post(PREFIX + "/advance-phase", json=request)
        assert response.status_code == 200, response.text
        assert response.json()["build_count"] == 2
        for build in ["P1", "EVT"]:
            assert client.get(PREFIX, params={**source, "build": build}).json() == originals[build]
            target = client.get(PREFIX, params={**source, "build": build, "phase": "내부 협의 완료"}).json()
            assert target["data"] == draft
            assert target["revision"] == 1
        assert client.get(PREFIX, params={**other, "phase": "내부 협의 완료"}).json()["data"] is None
        assert client.post(PREFIX + "/advance-phase", json=request).status_code == 409


def test_phase_advance_conflicts_and_validation_leave_no_partial_target(database):
    with TestClient(app) as client:
        source = {**KEY, "phase": "Plan"}
        for build in ["P1", "EVT"]:
            assert client.put(PREFIX, params={**source, "build": build}, json={"revision": 0, "data": DATA}).status_code == 200
        request = {"product": KEY["product"], "phase": "Plan", "version": KEY["version"], "target_phase": "Next", "target_version": "1.0",
                   "builds": [{"build": build, "revision": 1, "data": DATA} for build in ["P1", "EVT"]]}
        for invalid in [
            {**request, "builds": request["builds"][:1]},
            {**request, "builds": [{**row, "revision": 0} for row in request["builds"]]},
        ]:
            assert client.post(PREFIX + "/advance-phase", json=invalid).status_code == 409
            assert "1.0" not in client.get(PREFIX + "/catalog", params={"phase": "Next"}).json()["version"]
        for invalid in [{**request, "target_phase": "Plan"}, {**request, "builds": []}, {**request, "builds": request["builds"] * 2}]:
            assert client.post(PREFIX + "/advance-phase", json=invalid).status_code == 422
        assert client.post(PREFIX + "/versions", json={"phase": "Next", "version": "1.0"}).status_code == 200
        assert client.post(PREFIX + "/advance-phase", json=request).status_code == 409
        assert client.get(PREFIX, params={**source, "phase": "Next", "version": "1.0"}).json()["data"] is None


def test_version_deletion_requires_confirmation_and_only_deletes_its_phase(database):
    scope = {"phase": KEY["phase"], "version": KEY["version"]}
    keys = [KEY, {**KEY, "product": "another product", "build": "EVT"}, {**KEY, "phase": "Plan"}]
    with TestClient(app) as client:
        for key in keys:
            assert client.put(PREFIX, params=key, json={"revision": 0, "data": DATA}).status_code == 200
        preview = client.get(PREFIX + "/versions/deletion", params=scope).json()
        assert preview["roadmap_count"] == 2
        body = {**scope, "token": preview["token"]}
        assert client.request("DELETE", PREFIX + "/versions", json=body).status_code == 409
        assert client.get(PREFIX, params=KEY).json()["data"] == DATA
        assert client.request("DELETE", PREFIX + "/versions", json={**body, "confirmed": True}).status_code == 200
        for key in keys[:2]:
            assert client.get(PREFIX, params=key).json()["data"] is None
        assert client.get(PREFIX, params=keys[2]).json()["data"] == DATA
        assert KEY["version"] not in client.get(PREFIX + "/catalog", params={"phase": KEY["phase"]}).json()["version"]
        assert KEY["version"] in client.get(PREFIX + "/catalog", params={"phase": "Plan"}).json()["version"]
        assert client.put(PREFIX, params=KEY, json={"revision": 0, "data": DATA}).status_code == 409


def test_version_deletion_rechecks_snapshot_and_keeps_default_deleted(database):
    scope = {"phase": "Plan", "version": "0.0"}
    key = {**KEY, **scope}
    with TestClient(app) as client:
        preview = client.get(PREFIX + "/versions/deletion", params=scope).json()
        assert preview["roadmap_count"] == 0
        assert client.put(PREFIX, params=key, json={"revision": 0, "data": DATA}).status_code == 200
        assert client.request("DELETE", PREFIX + "/versions", json={**scope, "token": preview["token"], "confirmed": True}).status_code == 409
        preview = client.get(PREFIX + "/versions/deletion", params=scope).json()
        assert client.request("DELETE", PREFIX + "/versions", json={**scope, "token": preview["token"], "confirmed": True}).status_code == 200
    with TestClient(app) as other:
        assert other.get(PREFIX + "/catalog", params={"phase": "Plan"}).json()["version"] == []
        assert other.get(PREFIX + "/catalog", params={"phase": "Other"}).json()["version"] == ["0.0"]
        assert other.post(PREFIX + "/versions", json={"phase": "Plan", "version": "0.1"}).status_code == 200
        preview = other.get(PREFIX + "/versions/deletion", params={**scope, "version": "0.1"}).json()
        assert other.request("DELETE", PREFIX + "/versions", json={**scope, "version": "0.1", "token": preview["token"]}).status_code == 200


def test_revision_conflict_preserves_first_writer_and_versions_are_isolated(database):
    with TestClient(app) as client:
        assert client.put(PREFIX, params=KEY, json={"revision": 0, "data": DATA}).status_code == 200
        empty = {"months": [], "items": [], "sort": "Start Date (Ascending)"}
        assert client.put(PREFIX, params=KEY, json={"revision": 0, "data": empty}).status_code == 409
        assert client.get(PREFIX, params=KEY).json()["data"] == DATA
        for field in ("product", "build", "phase", "version"):
            other = {**KEY, field: "다른 값"}
            assert client.get(PREFIX, params=other).json()["data"] is None
            assert client.put(PREFIX, params=other, json={"revision": 0, "data": empty}).status_code == 200
        assert client.put(PREFIX, params=KEY, json={"revision": 1, "data": empty}).json()["revision"] == 2
        assert client.get(PREFIX, params=KEY).json()["data"] == empty


def test_concurrent_writes_have_exactly_one_winner(database):
    key = RoadmapKey(**KEY)
    request = RoadmapSave(revision=0, data=DATA)
    def save(_):
        try:
            return RoadmapStore(str(database)).save(key, request).revision
        except RoadmapConflict:
            return "conflict"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, range(2)))
    assert sorted(map(str, results)) == ["1", "conflict"]


def test_input_validation_and_catalog_defaults(database):
    with TestClient(app) as client:
        assert client.get(PREFIX + "/catalog").json()["version"] == ["0.0"]
        bad_data = [
            {**DATA, "items": [{**DATA["items"][0], "endDate": "2026-01-01"}]},
            {**DATA, "items": [{**DATA["items"][0], "startDate": "2026-02-31"}]},
            {**DATA, "items": DATA["items"] * 2},
            {**DATA, "months": DATA["months"] * 2},
            {**DATA, "months": [{**DATA["months"][0], "quarter": 1}]},
        ]
        for data in bad_data:
            assert client.put(PREFIX, params=KEY, json={"revision": 0, "data": data}).status_code == 422
        assert client.put(PREFIX, params={**KEY, "product": " "}, json={"revision": 0, "data": DATA}).status_code == 422
        assert client.get(PREFIX).status_code == 422
        assert client.get(PREFIX, params=KEY).json()["revision"] == 0


def test_database_failure_is_reported_without_false_success(database, monkeypatch):
    def fail(*args, **kwargs):
        raise duckdb.IOException("test database unavailable")
    monkeypatch.setattr(duckdb, "connect", fail)
    with TestClient(app) as client:
        assert client.get(PREFIX, params=KEY).status_code == 503
        assert client.put(PREFIX, params=KEY, json={"revision": 0, "data": DATA}).status_code == 503


def test_milestone_roundtrip_and_target_date_validation(database):
    milestone = {"id": "milestone-1", "kind": "milestone", "name": "출시",
                 "content": "고객 승인 후 출시\n최종 점검", "startDate": "2027-01-15", "endDate": "2027-01-15"}
    data = {**DATA, "items": [*DATA["items"], milestone]}
    with TestClient(app) as client:
        response = client.put(PREFIX, params=KEY, json={"revision": 0, "data": data})
        assert response.status_code == 200, response.text
        assert response.json()["data"] == data
    with TestClient(app) as client:
        assert client.get(PREFIX, params=KEY).json()["data"] == data
        for invalid in ({"endDate": "2027-01-16"}, {"startDate": "2027-02-30"}, {"name": " "}, {"content": "x" * 20001}):
            bad = {**data, "items": [{**milestone, **invalid}]}
            assert client.put(PREFIX, params=KEY, json={"revision": 1, "data": bad}).status_code == 422
        assert client.get(PREFIX, params=KEY).json()["data"] == data


def test_sort_persists_per_table_and_legacy_payload_uses_default(database):
    options = [f"{field} ({direction})" for direction in ("Ascending", "Descending")
               for field in ("Start Date", "End Date", "Milestone Date")]
    for option in options:
        key = {**KEY, "version": option}
        with TestClient(app) as client:
            response = client.put(PREFIX, params=key, json={"revision": 0, "data": {**DATA, "sort": option}})
            assert response.status_code == 200, response.text
        with TestClient(app) as client:
            assert client.get(PREFIX, params=key).json()["data"]["sort"] == option
    legacy = {name: value for name, value in DATA.items() if name != "sort"}
    with TestClient(app) as client:
        assert client.put(PREFIX, params=KEY, json={"revision": 0, "data": legacy}).status_code == 200
        assert client.put(PREFIX, params=KEY, json={"revision": 1, "data": {**DATA, "sort": "invalid"}}).status_code == 422
    # Simulate an existing DuckDB record written before the sort field existed.
    with duckdb.connect(str(database)) as db:
        db.execute("UPDATE roadmaps SET payload=? WHERE version_name=?", [json.dumps(legacy), KEY["version"]])
    with TestClient(app) as client:
        assert client.get(PREFIX, params=KEY).json()["data"]["sort"] == "Start Date (Ascending)"
