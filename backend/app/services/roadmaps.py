from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
import hashlib
import json

import duckdb

from app.schemas.roadmaps import RoadmapCatalog, RoadmapKey, RoadmapResponse, RoadmapSave
from app.schemas.roadmaps import PhaseVersion, VersionCreate, VersionInfo, VersionDeletion, VersionDeletionPreview, PhaseAdvance, VersionNote
from app.schemas.roadmaps import ProductBuilds

_LOCK = RLock()


class RoadmapConflict(Exception):
    pass


class RoadmapStore:
    def __init__(self, path: str):
        self.path = path

    @contextmanager
    def connect(self):
        # One FastAPI process owns this local file. Serialize connection lifetimes and writes.
        with _LOCK:
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
            db = duckdb.connect(self.path)
            try:
                db.execute("""CREATE TABLE IF NOT EXISTS roadmaps (
                    product VARCHAR NOT NULL, build VARCHAR NOT NULL,
                    phase VARCHAR NOT NULL, version_name VARCHAR NOT NULL,
                    payload VARCHAR NOT NULL, revision BIGINT NOT NULL,
                    updated_at VARCHAR NOT NULL,
                    PRIMARY KEY (product, build, phase, version_name))""")
                db.execute("""CREATE TABLE IF NOT EXISTS phase_versions (
                    phase VARCHAR NOT NULL, version_name VARCHAR NOT NULL,
                    deleted BOOLEAN NOT NULL, updated_at VARCHAR NOT NULL,
                    PRIMARY KEY (phase, version_name))""")
                db.execute("""CREATE TABLE IF NOT EXISTS phase_version_notes (
                    phase VARCHAR NOT NULL, version_name VARCHAR NOT NULL,
                    content VARCHAR NOT NULL, updated_at VARCHAR NOT NULL,
                    PRIMARY KEY (phase, version_name))""")
                db.execute("""CREATE TABLE IF NOT EXISTS product_build_catalog (
                    product VARCHAR PRIMARY KEY, builds VARCHAR NOT NULL)""")
                yield db
            finally:
                db.close()

    @staticmethod
    def params(key: RoadmapKey):
        return [key.product, key.build, key.phase, key.version]

    @staticmethod
    def response(row):
        if row is None:
            return RoadmapResponse(revision=0, data=None)
        from app.schemas.roadmaps import RoadmapData
        return RoadmapResponse(data=RoadmapData.model_validate_json(row[0]), revision=row[1], updated_at=row[2])

    def get(self, key: RoadmapKey) -> RoadmapResponse:
        with self.connect() as db:
            row = db.execute("""SELECT payload, revision, updated_at FROM roadmaps
                WHERE product=? AND build=? AND phase=? AND version_name=?""", self.params(key)).fetchone()
            return self.response(row)

    def save(self, key: RoadmapKey, request: RoadmapSave) -> RoadmapResponse:
        with self.connect() as db:
            db.execute("BEGIN TRANSACTION")
            try:
                configured = db.execute("SELECT builds FROM product_build_catalog WHERE product=?", [key.product]).fetchone()
                if configured and key.build not in json.loads(configured[0]):
                    raise RoadmapConflict("이 제품에서 제외된 Build입니다. 목록을 다시 불러와 주세요.")
                removed = db.execute("SELECT deleted FROM phase_versions WHERE phase=? AND version_name=?", [key.phase, key.version]).fetchone()
                if removed and removed[0]:
                    raise RoadmapConflict("삭제된 버전입니다. 버전 목록을 다시 불러와 주세요.")
                row = db.execute("""SELECT revision FROM roadmaps
                    WHERE product=? AND build=? AND phase=? AND version_name=?""", self.params(key)).fetchone()
                revision = row[0] if row else 0
                if revision != request.revision:
                    raise RoadmapConflict("다른 사용자가 이 로드맵을 저장했습니다. 편집 내용을 확인한 뒤 Cancel로 최신 내용을 불러오고 다시 편집해 주세요.")
                revision += 1
                updated = datetime.now(timezone.utc).isoformat()
                payload = request.data.model_dump_json()
                if row:
                    db.execute("""UPDATE roadmaps SET payload=?, revision=?, updated_at=?
                        WHERE product=? AND build=? AND phase=? AND version_name=?""",
                        [payload, revision, updated, *self.params(key)])
                else:
                    db.execute("INSERT INTO roadmaps VALUES (?, ?, ?, ?, ?, ?, ?)",
                               [*self.params(key), payload, revision, updated])
                db.execute("COMMIT")
                return RoadmapResponse(data=request.data, revision=revision, updated_at=updated)
            except Exception:
                db.execute("ROLLBACK")
                raise

    @staticmethod
    def product_builds(db, product: str):
        configured = db.execute("SELECT builds FROM product_build_catalog WHERE product=?", [product]).fetchone()
        if configured:
            return json.loads(configured[0])
        saved = [row[0] for row in db.execute("SELECT build FROM roadmaps WHERE product=? GROUP BY build ORDER BY min(updated_at), build", [product]).fetchall()]
        defaults = ["P1", "EVT", "DVT"] if saved or product == "4175" else ["POC", "P1", "EVT", "DVT"]
        return list(dict.fromkeys([*defaults, *saved]))

    def create_product(self, product: str):
        with self.connect() as db:
            builds = self.product_builds(db, product)
            db.execute("INSERT INTO product_build_catalog VALUES (?, ?) ON CONFLICT DO NOTHING", [product, json.dumps(builds)])
        return {"builds": builds}

    def save_product_builds(self, request: ProductBuilds):
        with self.connect() as db:
            if self.product_builds(db, request.product) != request.previous_builds:
                raise RoadmapConflict("Build 목록이 변경되었습니다. 패널을 다시 열어 주세요.")
            db.execute("""INSERT INTO product_build_catalog VALUES (?, ?)
                ON CONFLICT (product) DO UPDATE SET builds=excluded.builds""", [request.product, json.dumps(request.builds)])
        return {"builds": request.builds}

    def catalog(self, phase: str | None = None, product: str | None = None) -> RoadmapCatalog:
        values = {"product": ["4175"], "build": ["P1", "EVT", "DVT"],
                  "phase": ["Plan", "내부 협의 완료", "고객 협의 완료"], "version": ["0.0"]}
        with self.connect() as db:
            rows = db.execute("SELECT product, build, phase, version_name FROM roadmaps ORDER BY updated_at, product, build, phase, version_name").fetchall()
            versions = db.execute("SELECT phase, version_name, deleted FROM phase_versions ORDER BY updated_at, phase, version_name").fetchall()
            products = [row[0] for row in db.execute("SELECT product FROM product_build_catalog ORDER BY product").fetchall()]
            scoped_builds = self.product_builds(db, product) if product else None
        for row in rows:
            for category, value in zip(values, row):
                if category == "version" and phase is not None and row[2] != phase:
                    continue
                if value not in values[category]:
                    values[category].append(value)
        for owner, name, deleted in versions:
            if owner not in values["phase"]:
                values["phase"].append(owner)
            if (phase is None or owner == phase) and not deleted and name not in values["version"]:
                values["version"].append(name)
        if phase is not None:
            removed = {name for owner, name, deleted in versions if owner == phase and deleted}
            values["version"] = [name for name in values["version"] if name not in removed]
        values["product"] = list(dict.fromkeys([*values["product"], *products]))
        if scoped_builds is not None:
            values["build"] = scoped_builds
        return RoadmapCatalog(**values)

    def version_details(self, phase: str):
        names = self.catalog(phase).version
        with self.connect() as db:
            saved = {row[0]: (row[1], row[2]) for row in db.execute("""SELECT version_name, max(updated_at), count(*)
                FROM roadmaps WHERE phase=? GROUP BY version_name""", [phase]).fetchall()}
            registered = dict(db.execute("SELECT version_name, updated_at FROM phase_versions WHERE phase=? AND NOT deleted", [phase]).fetchall())
            populated = {name for name, payload in db.execute("SELECT version_name, payload FROM roadmaps WHERE phase=?", [phase]).fetchall() if json.loads(payload)["items"]}
            notes = {name: (content, updated) for name, content, updated in db.execute("SELECT version_name, content, updated_at FROM phase_version_notes WHERE phase=?", [phase]).fetchall()}
        result = []
        for name in names:
            last_saved, count = saved.get(name, (None, 0))
            content, note_updated = notes.get(name, ("", None))
            dates = [value for value in [last_saved, registered.get(name), note_updated] if value]
            result.append(VersionInfo(version=name, updated_at=max(dates) if dates else None, roadmap_count=count, has_content=name in populated, content=content))
        return result

    def save_version_note(self, request: VersionNote):
        with self.connect() as db:
            db.execute("BEGIN TRANSACTION")
            try:
                state = db.execute("SELECT deleted FROM phase_versions WHERE phase=? AND version_name=?", [request.phase, request.version]).fetchone()
                exists = db.execute("SELECT count(*) FROM roadmaps WHERE phase=? AND version_name=?", [request.phase, request.version]).fetchone()[0]
                if (state and state[0]) or (not state and not exists and request.version != "0.0"):
                    raise RoadmapConflict("버전이 없거나 삭제되었습니다. 목록을 다시 열어 주세요.")
                row = db.execute("SELECT content FROM phase_version_notes WHERE phase=? AND version_name=?", [request.phase, request.version]).fetchone()
                if (row[0] if row else "") != request.previous_content:
                    raise RoadmapConflict("다른 사용자가 내용을 변경했습니다. 목록을 다시 열어 확인해 주세요.")
                updated = datetime.now(timezone.utc).isoformat()
                db.execute("""INSERT INTO phase_versions VALUES (?, ?, false, ?)
                    ON CONFLICT (phase, version_name) DO NOTHING""", [request.phase, request.version, updated])
                db.execute("""INSERT INTO phase_version_notes VALUES (?, ?, ?, ?)
                    ON CONFLICT (phase, version_name) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at""",
                    [request.phase, request.version, request.content, updated])
                db.execute("COMMIT")
                return {"content": request.content, "updated_at": updated}
            except Exception:
                db.execute("ROLLBACK")
                raise

    def advance_phase(self, request: PhaseAdvance):
        with self.connect() as db:
            db.execute("BEGIN TRANSACTION")
            try:
                removed = db.execute("SELECT deleted FROM phase_versions WHERE phase=? AND version_name=?", [request.phase, request.version]).fetchone()
                if removed and removed[0]:
                    raise RoadmapConflict("원본 버전이 삭제되었습니다. 다시 불러와 주세요.")
                existing = dict(db.execute("SELECT build, revision FROM roadmaps WHERE product=? AND phase=? AND version_name=?",
                                           [request.product, request.phase, request.version]).fetchall())
                active_builds = set(self.product_builds(db, request.product))
                existing = {build: revision for build, revision in existing.items() if build in active_builds}
                supplied = {row.build for row in request.builds}
                if not supplied.issubset(active_builds):
                    raise RoadmapConflict("제품의 Build 목록이 변경되었습니다. 다시 불러와 주세요.")
                if not set(existing).issubset(supplied) or any(existing.get(row.build, 0) != row.revision for row in request.builds):
                    raise RoadmapConflict("원본 로드맵이 변경되었습니다. 최신 내용을 확인한 뒤 다시 진행해 주세요.")
                # Only an empty 0.0 may be reused. Recheck inside the write transaction.
                target = db.execute("SELECT deleted FROM phase_versions WHERE phase=? AND version_name=?", [request.target_phase, request.target_version]).fetchone()
                target_rows = db.execute("SELECT product, build, payload, revision FROM roadmaps WHERE phase=? AND version_name=?", [request.target_phase, request.target_version]).fetchall()
                reusable = request.target_version == "0.0" and not any(json.loads(row[2])["items"] for row in target_rows)
                if not reusable and (target_rows or (target and not target[0])):
                    raise RoadmapConflict("대상 버전이 이미 있습니다. 다른 신규 버전을 선택해 주세요.")
                updated = datetime.now(timezone.utc).isoformat()
                db.execute("""INSERT INTO phase_versions VALUES (?, ?, false, ?)
                    ON CONFLICT (phase, version_name) DO UPDATE SET deleted=false, updated_at=excluded.updated_at""",
                    [request.target_phase, request.target_version, updated])
                for row in request.builds:
                    db.execute("""INSERT INTO roadmaps VALUES (?, ?, ?, ?, ?, 1, ?)
                        ON CONFLICT (product, build, phase, version_name) DO UPDATE
                        SET payload=excluded.payload, revision=roadmaps.revision+1, updated_at=excluded.updated_at""",
                               [request.product, row.build, request.target_phase, request.target_version, row.data.model_dump_json(), updated])
                db.execute("COMMIT")
                return {"ok": True, "updated_at": updated, "build_count": len(request.builds)}
            except Exception:
                db.execute("ROLLBACK")
                raise

    def add_version(self, key: VersionCreate):
        with self.connect() as db:
            db.execute("BEGIN TRANSACTION")
            try:
                existing = db.execute("SELECT deleted FROM phase_versions WHERE phase=? AND version_name=?", [key.phase, key.version]).fetchone()
                saved = db.execute("SELECT count(*) FROM roadmaps WHERE phase=? AND version_name=?", [key.phase, key.version]).fetchone()[0]
                if saved or (existing and not existing[0]):
                    raise RoadmapConflict("이미 존재하는 버전입니다. 목록을 다시 열어 확인해 주세요.")
                source = []
                if key.copy_from is not None:
                    state = db.execute("SELECT deleted FROM phase_versions WHERE phase=? AND version_name=?", [key.phase, key.copy_from]).fetchone()
                    source = db.execute("SELECT product, build, payload FROM roadmaps WHERE phase=? AND version_name=?", [key.phase, key.copy_from]).fetchall()
                    if key.copy_from == key.version or (state and state[0]) or (not state and not source and key.copy_from != "0.0"):
                        raise RoadmapConflict("복사할 원본 버전이 없거나 삭제되었습니다. 목록을 다시 열어 확인해 주세요.")
                updated = datetime.now(timezone.utc).isoformat()
                db.execute("""INSERT INTO phase_versions VALUES (?, ?, false, ?)
                    ON CONFLICT (phase, version_name) DO UPDATE SET deleted=false, updated_at=excluded.updated_at""",
                    [key.phase, key.version, updated])
                for product, build, payload in source:
                    db.execute("INSERT INTO roadmaps VALUES (?, ?, ?, ?, ?, 1, ?)",
                               [product, build, key.phase, key.version, payload, updated])
                db.execute("COMMIT")
                return {"ok": True, "updated_at": updated, "roadmap_count": len(source)}
            except Exception:
                db.execute("ROLLBACK")
                raise

    @staticmethod
    def version_snapshot(db, key: PhaseVersion):
        rows = db.execute("""SELECT product, build, payload, revision, updated_at FROM roadmaps
            WHERE phase=? AND version_name=? ORDER BY product, build""", [key.phase, key.version]).fetchall()
        state = db.execute("SELECT deleted, updated_at FROM phase_versions WHERE phase=? AND version_name=?", [key.phase, key.version]).fetchone()
        note = db.execute("SELECT content, updated_at FROM phase_version_notes WHERE phase=? AND version_name=?", [key.phase, key.version]).fetchone()
        token = hashlib.sha256(json.dumps([key.phase, key.version, rows, state, note], ensure_ascii=False).encode()).hexdigest()
        return VersionDeletionPreview(roadmap_count=len(rows), token=token, has_note=bool(note and note[0]))

    def preview_version_deletion(self, key: PhaseVersion):
        with self.connect() as db:
            return self.version_snapshot(db, key)

    def delete_version(self, request: VersionDeletion):
        with self.connect() as db:
            db.execute("BEGIN TRANSACTION")
            try:
                current = self.version_snapshot(db, request)
                if current.token != request.token:
                    raise RoadmapConflict("버전 내용이 변경되었습니다. 삭제를 다시 눌러 최신 내용을 확인해 주세요.")
                if (current.roadmap_count or current.has_note) and not request.confirmed:
                    raise RoadmapConflict("저장된 내용이 있는 버전은 확인 후에만 삭제할 수 있습니다.")
                db.execute("DELETE FROM roadmaps WHERE phase=? AND version_name=?", [request.phase, request.version])
                db.execute("DELETE FROM phase_version_notes WHERE phase=? AND version_name=?", [request.phase, request.version])
                db.execute("""INSERT INTO phase_versions VALUES (?, ?, true, ?)
                    ON CONFLICT (phase, version_name) DO UPDATE SET deleted=true, updated_at=excluded.updated_at""",
                    [request.phase, request.version, datetime.now(timezone.utc).isoformat()])
                db.execute("COMMIT")
                return {"ok": True}
            except Exception:
                db.execute("ROLLBACK")
                raise
