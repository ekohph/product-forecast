import sqlite3
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from app.schemas.plans import Plan, PlanCreate, VersionCreate


class PlanError(Exception):
    def __init__(self, message: str, status: int = 404):
        self.message = message
        self.status = status


class PlanStore:
    def __init__(self, path: str):
        self.path = path

    @contextmanager
    def connect(self):
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        try:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS plans (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, product_name TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS versions (
                    id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id),
                    name TEXT NOT NULL, content TEXT NOT NULL, UNIQUE(plan_id, name));
                CREATE TABLE IF NOT EXISTS phases (
                    id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id),
                    name TEXT NOT NULL, version_id TEXT REFERENCES versions(id), UNIQUE(plan_id, name));
            """)
            with db:
                yield db
        except sqlite3.IntegrityError as exc:
            raise PlanError("같은 이름이 이미 있습니다. 다른 이름을 입력해 주세요.", 409) from exc
        finally:
            db.close()

    def _get(self, db, plan_id: str) -> Plan:
        row = db.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
        if row is None:
            raise PlanError("계획을 찾을 수 없습니다.")
        return Plan(**dict(row), versions=[dict(r) for r in db.execute(
            "SELECT id, name, content FROM versions WHERE plan_id = ? ORDER BY rowid", (plan_id,))],
            phases=[dict(r) for r in db.execute(
                "SELECT id, name, version_id FROM phases WHERE plan_id = ? ORDER BY rowid", (plan_id,))])

    def list(self) -> list[Plan]:
        with self.connect() as db:
            return [self._get(db, r[0]) for r in db.execute("SELECT id FROM plans ORDER BY rowid DESC").fetchall()]

    def create(self, data: PlanCreate) -> Plan:
        with self.connect() as db:
            plan_id = str(uuid4())
            db.execute("INSERT INTO plans VALUES (?, ?, ?)", (plan_id, data.name, data.product_name))
            for name in ("계획", "내부 협의 완료", "고객 협의 완료"):
                db.execute("INSERT INTO phases VALUES (?, ?, ?, NULL)", (str(uuid4()), plan_id, name))
            return self._get(db, plan_id)

    def add_version(self, plan_id: str, data: VersionCreate) -> Plan:
        with self.connect() as db:
            self._get(db, plan_id)
            db.execute("INSERT INTO versions VALUES (?, ?, ?, ?)",
                       (str(uuid4()), plan_id, data.name, data.content))
            return self._get(db, plan_id)

    def add_phase(self, plan_id: str, name: str) -> Plan:
        with self.connect() as db:
            self._get(db, plan_id)
            db.execute("INSERT INTO phases VALUES (?, ?, ?, NULL)", (str(uuid4()), plan_id, name))
            return self._get(db, plan_id)

    def update_phase(self, plan_id: str, phase_id: str, *, name=None, version_id=None, select=False) -> Plan:
        with self.connect() as db:
            plan = self._get(db, plan_id)
            if not any(p.id == phase_id for p in plan.phases):
                raise PlanError("Phase를 찾을 수 없습니다.")
            if select:
                if version_id is not None and not any(v.id == version_id for v in plan.versions):
                    raise PlanError("이 계획에 속한 버전을 선택해 주세요.", 422)
                db.execute("UPDATE phases SET version_id = ? WHERE id = ?", (version_id, phase_id))
            else:
                db.execute("UPDATE phases SET name = ? WHERE id = ?", (name, phase_id))
            return self._get(db, plan_id)
