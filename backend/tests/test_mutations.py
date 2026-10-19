"""Regression tests TASK 10C untuk mutation engine empat master resource."""

import json
import sqlite3
from pathlib import Path

import pytest

from backend.app import create_app
from backend.db.init_db import init_db


@pytest.fixture()
def database(tmp_path: Path) -> Path:
    path = tmp_path / "mutations.sqlite3"
    init_db(str(path))
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(
        """
        INSERT INTO mata_praktikum (id,nama) VALUES (1,'AI'),(2,'Data Mining');
        INSERT INTO kelompok (id,nama,jumlah_peserta) VALUES (1,'IF-1',20),(2,'IF-2',10);
        INSERT INTO asisten (id,nama) VALUES (1,'Rina'),(2,'Budi');
        INSERT INTO laboratorium (id,nama,kapasitas) VALUES (1,'Lab A',20),(2,'Lab B',30);
        INSERT INTO slot_waktu (id,hari,jam_mulai,jam_selesai) VALUES (1,1,'08:00','10:00');
        INSERT INTO praktikum (id,mata_praktikum_id,kelompok_id,asisten_id)
          VALUES (1,1,1,1);
        """
    )
    connection.commit()
    connection.close()
    return path


@pytest.fixture()
def app(database: Path):
    return create_app({"TESTING": True, "DATABASE": str(database), "SQLITE_TIMEOUT_SECONDS": 0.01})


@pytest.fixture()
def client(app):
    return app.test_client()


RESOURCE_CASES = (
    ("mata-praktikum", {"nama": "Sistem Pakar"}, {"nama": "Sistem Cerdas"}),
    ("kelompok", {"nama": "IF-3", "jumlah_peserta": 25}, {"jumlah_peserta": 26}),
    ("asisten", {"nama": "Sari"}, {"nama": "Sari Baru"}),
    ("laboratorium", {"nama": "Lab C", "kapasitas": 40}, {"kapasitas": 41}),
)


def revision(path: Path) -> int:
    with sqlite3.connect(path) as connection:
        return connection.execute("SELECT value FROM system_metadata WHERE key='source_revision'").fetchone()[0]


def entity(path: Path, table: str, entity_id: int):
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        row = connection.execute(f"SELECT * FROM {table} WHERE id=?", (entity_id,)).fetchone()
        return dict(row) if row else None
    finally:
        connection.close()


def install_active_schedule(path: Path) -> None:
    snapshot = {
        "schema_version": 1,
        "source_revision": 0,
        "generated_at": "2026-10-19T09:59:00.000Z",
        "saved_at": "2026-10-19T10:00:00.000Z",
        "mata_praktikum": [{"id": 1, "nama": "AI"}],
        "kelompok": [{"id": 1, "nama": "IF-1", "jumlah_peserta": 20}],
        "asisten": [{"id": 1, "nama": "Rina"}],
        "laboratorium": [{"id": 1, "nama": "Lab A", "kapasitas": 20}],
        "slot_waktu": [{"id": 1, "hari": 1, "jam_mulai": "08:00", "jam_selesai": "10:00"}],
        "praktikum": [{"id": 1, "mata_praktikum_id": 1, "kelompok_id": 1, "asisten_id": 1}],
        "assignments": [{"praktikum_id": 1, "slot_id": 1, "laboratorium_id": 1}],
    }
    with sqlite3.connect(path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(
            """INSERT INTO versi_jadwal
               (id,status,source_revision,created_at,invalidated_at,archived_at,snapshot_json)
               VALUES (1,'active',0,'2026-10-19T10:00:00.000Z',NULL,NULL,?)""",
            (json.dumps(snapshot, separators=(",", ":"), sort_keys=True),),
        )
        connection.execute(
            "INSERT INTO detail_jadwal (versi_id,praktikum_id,slot_id,laboratorium_id) VALUES (1,1,1,1)"
        )


def schedule_status(path: Path):
    with sqlite3.connect(path) as connection:
        return connection.execute("SELECT status,invalidated_at,snapshot_json FROM versi_jadwal WHERE id=1").fetchone()


@pytest.mark.parametrize(("resource", "create_body", "patch_body"), RESOURCE_CASES)
def test_post_patch_and_status_for_each_resource(client, resource, create_body, patch_body):
    created = client.post(f"/api/v1/{resource}", json=create_body)
    assert created.status_code == 201
    data = created.get_json()["data"]
    assert data["is_active"] is True
    entity_id = data["id"]

    patched = client.patch(f"/api/v1/{resource}/{entity_id}", json=patch_body)
    assert patched.status_code == 200
    for field, value in patch_body.items():
        assert patched.get_json()["data"][field] == value

    disabled = client.patch(f"/api/v1/{resource}/{entity_id}/status", json={"is_active": False})
    assert disabled.status_code == 200
    assert disabled.get_json()["data"]["is_active"] is False
    enabled = client.patch(f"/api/v1/{resource}/{entity_id}/status", json={"is_active": True})
    assert enabled.status_code == 200
    assert enabled.get_json()["data"]["is_active"] is True


@pytest.mark.parametrize(
    ("method", "path", "body", "code", "status"),
    (
        ("post", "/api/v1/kelompok", {"nama": "X", "jumlah_peserta": True}, "VALIDATION_ERROR", 422),
        ("post", "/api/v1/laboratorium", {"nama": "X", "kapasitas": "20"}, "VALIDATION_ERROR", 422),
        ("post", "/api/v1/mata-praktikum", {"nama": 1}, "VALIDATION_ERROR", 422),
        ("post", "/api/v1/kelompok", {"nama": "X"}, "VALIDATION_ERROR", 422),
        ("patch", "/api/v1/asisten/1", {}, "VALIDATION_ERROR", 422),
        ("patch", "/api/v1/asisten/1", {"id": 9}, "READ_ONLY_FIELD", 400),
        ("patch", "/api/v1/asisten/1", {"nickname": "X"}, "UNKNOWN_FIELD", 400),
        ("patch", "/api/v1/asisten/1/status", {"is_active": 0}, "VALIDATION_ERROR", 422),
        ("patch", "/api/v1/asisten/1/status", {"is_active": False, "nama": "X"}, "UNKNOWN_FIELD", 400),
    ),
)
def test_validation_and_strict_types(client, method, path, body, code, status):
    response = getattr(client, method)(path, json=body)
    assert response.status_code == status
    assert response.get_json()["error"]["code"] == code


@pytest.mark.parametrize("resource", ("mata-praktikum", "kelompok", "laboratorium"))
def test_duplicate_name_is_safe_conflict(client, resource):
    body = {"nama": {"mata-praktikum": " ai ", "kelompok": "if-1", "laboratorium": "LAB A"}[resource]}
    if resource == "kelompok":
        body["jumlah_peserta"] = 9
    if resource == "laboratorium":
        body["kapasitas"] = 9
    response = client.post(f"/api/v1/{resource}", json=body)
    assert response.status_code == 409
    assert response.get_json() == {"error": {"code": "DUPLICATE_NAME", "message": "Nama sudah digunakan.", "details": {"field": "nama"}}}


def test_duplicate_assistant_name_is_allowed(client):
    response = client.post("/api/v1/asisten", json={"nama": "Rina"})
    assert response.status_code == 201


def test_noop_preserves_revision_and_timestamp(client, database):
    before = entity(database, "mata_praktikum", 1)
    response = client.patch("/api/v1/mata-praktikum/1", json={"nama": "  AI  "})
    after = entity(database, "mata_praktikum", 1)
    assert response.status_code == 200
    assert revision(database) == 0
    assert after["updated_at"] == before["updated_at"]


def test_effective_inactive_mutation_updates_timestamp_without_revision(client, database):
    assert client.patch("/api/v1/asisten/2/status", json={"is_active": False}).status_code == 200
    baseline_revision = revision(database)
    before = entity(database, "asisten", 2)
    response = client.patch("/api/v1/asisten/2", json={"nama": "Budi Nonaktif"})
    after = entity(database, "asisten", 2)
    assert response.status_code == 200
    assert after["updated_at"] > before["updated_at"]
    assert revision(database) == baseline_revision


def test_status_noop_preserves_timestamp_and_revision(client, database):
    before = entity(database, "asisten", 1)
    response = client.patch("/api/v1/asisten/1/status", json={"is_active": True})
    assert response.status_code == 200
    assert entity(database, "asisten", 1)["updated_at"] == before["updated_at"]
    assert revision(database) == 0


def test_reactivation_does_not_restore_invalid_schedule(client, database):
    install_active_schedule(database)
    assert client.patch("/api/v1/asisten/1/status", json={"is_active": False}).status_code == 200
    assert schedule_status(database)[0] == "invalid"
    assert client.patch("/api/v1/asisten/1/status", json={"is_active": True}).status_code == 200
    assert schedule_status(database)[0] == "invalid"
    assert revision(database) == 2


def test_active_mutation_increments_revision_once(client, database):
    response = client.patch("/api/v1/kelompok/1", json={"nama": "IF-1 Baru", "jumlah_peserta": 19})
    assert response.status_code == 200
    assert revision(database) == 1


def test_active_label_change_does_not_invalidate_schedule(client, database):
    install_active_schedule(database)
    response = client.patch("/api/v1/mata-praktikum/1", json={"nama": "AI Baru"})
    assert response.status_code == 200
    assert revision(database) == 1
    assert schedule_status(database)[0] == "active"


@pytest.mark.parametrize(("capacity", "expected"), ((20, "active"), (19, "invalid"), (25, "active")))
def test_laboratory_capacity_boundary(client, database, capacity, expected):
    install_active_schedule(database)
    response = client.patch("/api/v1/laboratorium/1", json={"kapasitas": capacity})
    assert response.status_code == 200
    assert schedule_status(database)[0] == expected


@pytest.mark.parametrize(("participants", "expected"), ((20, "active"), (21, "invalid"), (19, "active")))
def test_group_participant_boundary(client, database, participants, expected):
    install_active_schedule(database)
    response = client.patch("/api/v1/kelompok/1", json={"jumlah_peserta": participants})
    assert response.status_code == 200
    assert schedule_status(database)[0] == expected


@pytest.mark.parametrize(
    ("resource", "entity_id", "expected"),
    (
        ("mata-praktikum", 1, "invalid"),
        ("kelompok", 1, "invalid"),
        ("asisten", 1, "invalid"),
        ("laboratorium", 1, "invalid"),
        ("mata-praktikum", 2, "active"),
        ("kelompok", 2, "active"),
        ("asisten", 2, "active"),
        ("laboratorium", 2, "active"),
    ),
)
def test_deactivation_used_versus_unused(client, database, resource, entity_id, expected):
    install_active_schedule(database)
    response = client.patch(f"/api/v1/{resource}/{entity_id}/status", json={"is_active": False})
    assert response.status_code == 200
    assert schedule_status(database)[0] == expected


def test_invalidation_and_revision_are_atomic(client, database):
    install_active_schedule(database)
    response = client.patch("/api/v1/laboratorium/1", json={"kapasitas": 19})
    assert response.status_code == 200
    status, invalidated_at, _snapshot = schedule_status(database)
    assert status == "invalid"
    assert invalidated_at is not None
    assert revision(database) == 1


def test_duplicate_failure_rolls_back_revision_and_entity(client, database):
    before = entity(database, "mata_praktikum", 2)
    response = client.patch("/api/v1/mata-praktikum/2", json={"nama": "AI"})
    assert response.status_code == 409
    assert entity(database, "mata_praktikum", 2) == before
    assert revision(database) == 0


def test_failure_after_revision_increment_rolls_back_everything(client, database, monkeypatch):
    import backend.app.mutations as mutation_module

    install_active_schedule(database)
    before = entity(database, "laboratorium", 1)

    def fail_invalidation(_db, _timestamp):
        raise sqlite3.OperationalError("controlled rollback fault")

    monkeypatch.setattr(mutation_module, "_invalidate_active", fail_invalidation)
    response = client.patch("/api/v1/laboratorium/1", json={"kapasitas": 19})
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "DATABASE_ERROR"
    assert entity(database, "laboratorium", 1) == before
    assert revision(database) == 0
    assert schedule_status(database)[0] == "active"


def test_history_snapshot_and_detail_remain_immutable(client, database):
    install_active_schedule(database)
    before = schedule_status(database)[2]
    assert client.patch("/api/v1/mata-praktikum/1", json={"nama": "AI Renamed"}).status_code == 200
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT snapshot_json FROM versi_jadwal WHERE id=1").fetchone()[0] == before
        assert connection.execute("SELECT praktikum_id,slot_id,laboratorium_id FROM detail_jadwal WHERE versi_id=1").fetchone() == (1, 1, 1)


def test_database_busy_is_sanitized(app, database):
    lock = sqlite3.connect(database, timeout=0)
    lock.execute("BEGIN IMMEDIATE")
    try:
        response = app.test_client().patch("/api/v1/asisten/1", json={"nama": "Locked"})
    finally:
        lock.rollback()
        lock.close()
    assert response.status_code == 503
    assert response.get_json()["error"]["code"] == "DATABASE_BUSY"
    assert "locked" not in response.get_data(as_text=True).lower()


def test_mutations_remain_compatible_with_read_api(client):
    created = client.post("/api/v1/kelompok", json={"nama": "IF-9", "jumlah_peserta": 15}).get_json()["data"]
    detail = client.get(f"/api/v1/kelompok/{created['id']}")
    listed = client.get("/api/v1/kelompok", query_string={"search": "if-9"})
    assert detail.status_code == 200
    assert detail.get_json()["data"] == created
    assert [row["id"] for row in listed.get_json()["data"]] == [created["id"]]


@pytest.mark.parametrize("path", ("mata-praktikum", "kelompok", "asisten", "laboratorium"))
def test_missing_resource_returns_contract_error(client, path):
    response = client.patch(f"/api/v1/{path}/999", json={"nama": "Missing"})
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "RESOURCE_NOT_FOUND"
