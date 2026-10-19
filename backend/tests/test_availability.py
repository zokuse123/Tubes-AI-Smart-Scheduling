"""Regression tests TASK 10E untuk API ketersediaan full replacement."""

import sqlite3
from pathlib import Path

import pytest

from backend.app import create_app
from backend.db.init_db import init_db
from backend.tests.test_mutations import install_active_schedule, revision, schedule_status


@pytest.fixture()
def database(tmp_path: Path) -> Path:
    path = tmp_path / "availability.sqlite3"
    init_db(str(path))
    with sqlite3.connect(path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(
            """
            INSERT INTO mata_praktikum (id,nama) VALUES (1,'AI');
            INSERT INTO kelompok (id,nama,jumlah_peserta,is_active)
              VALUES (1,'IF-1',20,1),(2,'IF-2',10,0);
            INSERT INTO asisten (id,nama,is_active) VALUES (1,'Rina',1),(2,'Budi',0);
            INSERT INTO laboratorium (id,nama,kapasitas) VALUES (1,'Lab A',20);
            INSERT INTO slot_waktu (id,hari,jam_mulai,jam_selesai,is_active)
              VALUES (1,1,'08:00','10:00',1),(2,1,'10:00','12:00',1),(3,2,'08:00','10:00',0);
            INSERT INTO praktikum (id,mata_praktikum_id,kelompok_id,asisten_id)
              VALUES (1,1,1,1);
            """
        )
    return path


@pytest.fixture()
def client(database: Path):
    return create_app({"TESTING": True, "DATABASE": str(database)}).test_client()


def stored(path: Path, table: str, owner_column: str, owner_id: int) -> list[int]:
    with sqlite3.connect(path) as connection:
        return [row[0] for row in connection.execute(
            f"SELECT slot_id FROM {table} WHERE {owner_column}=? ORDER BY slot_id", (owner_id,)
        )]


@pytest.mark.parametrize("owner", ("kelompok", "asisten"))
def test_get_empty_and_put_returns_canonical_full_replacement(client, owner):
    assert client.get(f"/api/v1/{owner}/1/ketersediaan").get_json()["data"] == {
        "owner_type": owner, "owner_id": 1, "slot_ids": []
    }
    response = client.put(f"/api/v1/{owner}/1/ketersediaan", json={"slot_ids": [2, 1]})
    assert response.status_code == 200
    assert response.get_json()["data"]["slot_ids"] == [1, 2]
    assert client.get(f"/api/v1/{owner}/1/ketersediaan").get_json() == response.get_json()


@pytest.mark.parametrize("owner,table,column", (
    ("kelompok", "ketersediaan_kelompok", "kelompok_id"),
    ("asisten", "ketersediaan_asisten", "asisten_id"),
))
def test_empty_array_is_valid_full_replacement(client, database, owner, table, column):
    assert client.put(f"/api/v1/{owner}/1/ketersediaan", json={"slot_ids": [1]}).status_code == 200
    assert client.put(f"/api/v1/{owner}/1/ketersediaan", json={"slot_ids": []}).status_code == 200
    assert stored(database, table, column, 1) == []


@pytest.mark.parametrize("body", (
    {"slot_ids": [1, 1]}, {"slot_ids": [True]}, {"slot_ids": ["1"]},
    {"slot_ids": [0]}, {"slot_ids": 1}, {},
))
def test_strict_payload_validation(client, body):
    response = client.put("/api/v1/kelompok/1/ketersediaan", json=body)
    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


def test_unknown_and_readonly_fields(client):
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [], "x": 1}).get_json()["error"]["code"] == "UNKNOWN_FIELD"
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [], "id": 1}).get_json()["error"]["code"] == "READ_ONLY_FIELD"


@pytest.mark.parametrize("method", ("get", "put"))
def test_missing_owner(client, method):
    kwargs = {"json": {"slot_ids": []}} if method == "put" else {}
    response = getattr(client, method)("/api/v1/asisten/999/ketersediaan", **kwargs)
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "RESOURCE_NOT_FOUND"


@pytest.mark.parametrize("slot_id,status,code", ((999,422,"INVALID_REFERENCE"),(3,409,"INACTIVE_REFERENCE")))
def test_slot_reference_validation_is_atomic(client, database, slot_id, status, code):
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [1]}).status_code == 200
    baseline = revision(database)
    response = client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [2, slot_id]})
    assert response.status_code == status
    assert response.get_json()["error"]["code"] == code
    assert stored(database, "ketersediaan_kelompok", "kelompok_id", 1) == [1]
    assert revision(database) == baseline


@pytest.mark.parametrize("owner,table,column", (
    ("kelompok", "ketersediaan_kelompok", "kelompok_id"),
    ("asisten", "ketersediaan_asisten", "asisten_id"),
))
def test_inactive_owner_allowed_without_revision(client, database, owner, table, column):
    response = client.put(f"/api/v1/{owner}/2/ketersediaan", json={"slot_ids": [2]})
    assert response.status_code == 200
    assert stored(database, table, column, 2) == [2]
    assert revision(database) == 0


def test_active_change_increments_once_and_reordered_set_is_noop(client, database):
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [1, 2]}).status_code == 200
    assert revision(database) == 1
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [2, 1]}).status_code == 200
    assert revision(database) == 1


@pytest.mark.parametrize("owner", ("kelompok", "asisten"))
def test_removing_used_slot_invalidates_active_schedule(client, database, owner):
    assert client.put(f"/api/v1/{owner}/1/ketersediaan", json={"slot_ids": [1, 2]}).status_code == 200
    install_active_schedule(database)
    response = client.put(f"/api/v1/{owner}/1/ketersediaan", json={"slot_ids": [2]})
    assert response.status_code == 200
    assert schedule_status(database)[0] == "invalid"


def test_addition_and_unused_removal_do_not_invalidate(client, database):
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [1]}).status_code == 200
    install_active_schedule(database)
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [1, 2]}).status_code == 200
    assert schedule_status(database)[0] == "active"
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [1]}).status_code == 200
    assert schedule_status(database)[0] == "active"


def test_invalid_schedule_is_not_restored(client, database):
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [1]}).status_code == 200
    install_active_schedule(database)
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": []}).status_code == 200
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [1]}).status_code == 200
    assert schedule_status(database)[0] == "invalid"


def test_database_failure_rolls_back_replacement_and_revision(client, database, monkeypatch):
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [1]}).status_code == 200
    baseline = revision(database)
    import backend.app.mutations as mutations
    monkeypatch.setattr(mutations, "_increment_revision", lambda _db: (_ for _ in ()).throw(sqlite3.OperationalError("forced")))
    response = client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [2]})
    assert response.status_code == 500
    assert stored(database, "ketersediaan_kelompok", "kelompok_id", 1) == [1]
    assert revision(database) == baseline


def test_history_snapshot_and_detail_immutable(client, database):
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": [1]}).status_code == 200
    install_active_schedule(database)
    with sqlite3.connect(database) as connection:
        before = connection.execute("SELECT snapshot_json FROM versi_jadwal WHERE id=1").fetchone()[0]
    assert client.put("/api/v1/kelompok/1/ketersediaan", json={"slot_ids": []}).status_code == 200
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT snapshot_json FROM versi_jadwal WHERE id=1").fetchone()[0] == before
        assert connection.execute("SELECT praktikum_id,slot_id,laboratorium_id FROM detail_jadwal").fetchone() == (1,1,1)
