"""Regression tests TASK 10D untuk mutasi slot waktu dan praktikum."""

import sqlite3
from pathlib import Path

import pytest

from backend.app import create_app
from backend.db.init_db import init_db
from backend.tests.test_mutations import entity, install_active_schedule, revision, schedule_status


@pytest.fixture()
def database(tmp_path: Path) -> Path:
    path = tmp_path / "task10d.sqlite3"
    init_db(str(path))
    with sqlite3.connect(path) as connection:
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
    return path


@pytest.fixture()
def app(database: Path):
    return create_app({"TESTING": True, "DATABASE": str(database)})


@pytest.fixture()
def client(app):
    return app.test_client()


def test_create_patch_and_status_slot(client):
    created = client.post("/api/v1/slot-waktu", json={"hari": 1, "jam_mulai": "10:00", "jam_selesai": "12:00"})
    assert created.status_code == 201
    slot_id = created.get_json()["data"]["id"]
    patched = client.patch(f"/api/v1/slot-waktu/{slot_id}", json={"hari": 2})
    assert patched.status_code == 200
    assert patched.get_json()["data"]["hari"] == 2
    assert client.patch(f"/api/v1/slot-waktu/{slot_id}/status", json={"is_active": False}).status_code == 200
    assert client.patch(f"/api/v1/slot-waktu/{slot_id}/status", json={"is_active": True}).status_code == 200


def test_adjacent_slot_is_valid(client):
    response = client.post("/api/v1/slot-waktu", json={"hari": 1, "jam_mulai": "10:00", "jam_selesai": "12:00"})
    assert response.status_code == 201


def test_overlap_rejected_on_create(client, database):
    response = client.post("/api/v1/slot-waktu", json={"hari": 1, "jam_mulai": "09:00", "jam_selesai": "11:00"})
    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
    assert revision(database) == 0


def test_overlap_rejected_on_partial_update_and_rolled_back(client, database):
    with sqlite3.connect(database) as connection:
        connection.execute("INSERT INTO slot_waktu (id,hari,jam_mulai,jam_selesai) VALUES (2,1,'10:00','12:00')")
    before = entity(database, "slot_waktu", 2)
    response = client.patch("/api/v1/slot-waktu/2", json={"jam_mulai": "09:00", "jam_selesai": "11:00"})
    assert response.status_code == 422
    assert entity(database, "slot_waktu", 2) == before
    assert revision(database) == 0


def test_overlap_rejected_on_reactivation(client, database):
    with sqlite3.connect(database) as connection:
        connection.execute("INSERT INTO slot_waktu (id,hari,jam_mulai,jam_selesai,is_active) VALUES (2,1,'09:00','11:00',0)")
    before = entity(database, "slot_waktu", 2)
    response = client.patch("/api/v1/slot-waktu/2/status", json={"is_active": True})
    assert response.status_code == 422
    assert entity(database, "slot_waktu", 2) == before
    assert revision(database) == 0


@pytest.mark.parametrize(
    "body",
    (
        {"hari": True, "jam_mulai": "10:00", "jam_selesai": "12:00"},
        {"hari": 0, "jam_mulai": "10:00", "jam_selesai": "12:00"},
        {"hari": 6, "jam_mulai": "10:00", "jam_selesai": "12:00"},
        {"hari": 1, "jam_mulai": "8:00", "jam_selesai": "10:00"},
        {"hari": 1, "jam_mulai": "23:00", "jam_selesai": "25:00"},
        {"hari": 1, "jam_mulai": "10:00", "jam_selesai": "11:59"},
    ),
)
def test_slot_day_time_and_duration_validation(client, body):
    response = client.post("/api/v1/slot-waktu", json=body)
    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


def test_slot_partial_patch_unknown_and_readonly_fields(client):
    assert client.patch("/api/v1/slot-waktu/1", json={"unexpected": 1}).get_json()["error"]["code"] == "UNKNOWN_FIELD"
    assert client.patch("/api/v1/slot-waktu/1", json={"id": 2}).get_json()["error"]["code"] == "READ_ONLY_FIELD"


def test_slot_noop_preserves_timestamp_and_revision(client, database):
    before = entity(database, "slot_waktu", 1)
    response = client.patch("/api/v1/slot-waktu/1", json={"jam_mulai": "08:00"})
    assert response.status_code == 200
    assert entity(database, "slot_waktu", 1)["updated_at"] == before["updated_at"]
    assert revision(database) == 0


def test_inactive_slot_effective_patch_updates_timestamp_without_revision(client, database):
    assert client.patch("/api/v1/slot-waktu/1/status", json={"is_active": False}).status_code == 200
    baseline = revision(database)
    before = entity(database, "slot_waktu", 1)
    response = client.patch("/api/v1/slot-waktu/1", json={"hari": 2})
    assert response.status_code == 200
    assert entity(database, "slot_waktu", 1)["updated_at"] > before["updated_at"]
    assert revision(database) == baseline


@pytest.mark.parametrize(("slot_id", "expected"), ((1, "invalid"), (2, "active")))
def test_slot_used_versus_unused_deactivation(client, database, slot_id, expected):
    with sqlite3.connect(database) as connection:
        connection.execute("INSERT INTO slot_waktu (id,hari,jam_mulai,jam_selesai) VALUES (2,1,'10:00','12:00')")
    install_active_schedule(database)
    response = client.patch(f"/api/v1/slot-waktu/{slot_id}/status", json={"is_active": False})
    assert response.status_code == 200
    assert schedule_status(database)[0] == expected


def test_used_slot_time_change_invalidates(client, database):
    install_active_schedule(database)
    response = client.patch("/api/v1/slot-waktu/1", json={"hari": 2})
    assert response.status_code == 200
    assert schedule_status(database)[0] == "invalid"


def test_create_patch_status_praktikum_and_nested_response(client):
    created = client.post("/api/v1/praktikum", json={"mata_praktikum_id": 2, "kelompok_id": 2, "asisten_id": 2})
    assert created.status_code == 201
    data = created.get_json()["data"]
    assert data["mata_praktikum"] == {"id": 2, "nama": "Data Mining"}
    assert data["kelompok"] == {"id": 2, "nama": "IF-2", "jumlah_peserta": 10}
    assert data["asisten"] == {"id": 2, "nama": "Budi"}
    praktikum_id = data["id"]
    patched = client.patch(f"/api/v1/praktikum/{praktikum_id}", json={"asisten_id": 1})
    assert patched.status_code == 200
    assert patched.get_json()["data"]["asisten"] == {"id": 1, "nama": "Rina"}
    assert client.patch(f"/api/v1/praktikum/{praktikum_id}/status", json={"is_active": False}).status_code == 200
    assert client.patch(f"/api/v1/praktikum/{praktikum_id}/status", json={"is_active": True}).status_code == 200


def test_duplicate_praktikum_fk_combination_is_allowed(client):
    body = {"mata_praktikum_id": 1, "kelompok_id": 1, "asisten_id": 1}
    first = client.post("/api/v1/praktikum", json=body)
    second = client.post("/api/v1/praktikum", json=body)
    assert first.status_code == second.status_code == 201
    assert first.get_json()["data"]["id"] != second.get_json()["data"]["id"]


@pytest.mark.parametrize("field", ("mata_praktikum_id", "kelompok_id", "asisten_id"))
def test_praktikum_missing_reference(client, field):
    body = {"mata_praktikum_id": 1, "kelompok_id": 1, "asisten_id": 1}
    body[field] = 999
    response = client.post("/api/v1/praktikum", json=body)
    assert response.status_code == 422
    assert response.get_json()["error"] == {"code": "INVALID_REFERENCE", "message": "Referensi tidak ditemukan.", "details": {"field": field}}


@pytest.mark.parametrize(("field", "table"), (("mata_praktikum_id", "mata_praktikum"), ("kelompok_id", "kelompok"), ("asisten_id", "asisten")))
def test_praktikum_inactive_reference_on_create_and_patch(client, database, field, table):
    with sqlite3.connect(database) as connection:
        connection.execute(f"UPDATE {table} SET is_active=0 WHERE id=2")
    body = {"mata_praktikum_id": 1, "kelompok_id": 1, "asisten_id": 1}
    body[field] = 2
    created = client.post("/api/v1/praktikum", json=body)
    patched = client.patch("/api/v1/praktikum/1", json={field: 2})
    assert created.status_code == patched.status_code == 409
    assert created.get_json()["error"]["code"] == patched.get_json()["error"]["code"] == "INACTIVE_REFERENCE"


def test_praktikum_strict_fk_partial_and_unknown_validation(client):
    assert client.post("/api/v1/praktikum", json={"mata_praktikum_id": True, "kelompok_id": 1, "asisten_id": 1}).status_code == 422
    assert client.patch("/api/v1/praktikum/1", json={"kelompok_id": 2}).status_code == 200
    assert client.patch("/api/v1/praktikum/1", json={"nama": "x"}).get_json()["error"]["code"] == "UNKNOWN_FIELD"


def test_praktikum_noop_preserves_timestamp_revision_and_schedule(client, database):
    install_active_schedule(database)
    before = entity(database, "praktikum", 1)
    response = client.patch("/api/v1/praktikum/1", json={"kelompok_id": 1})
    assert response.status_code == 200
    assert entity(database, "praktikum", 1)["updated_at"] == before["updated_at"]
    assert revision(database) == 0
    assert schedule_status(database)[0] == "active"


def test_inactive_praktikum_patch_updates_timestamp_without_revision(client, database):
    assert client.patch("/api/v1/praktikum/1/status", json={"is_active": False}).status_code == 200
    baseline = revision(database)
    before = entity(database, "praktikum", 1)
    response = client.patch("/api/v1/praktikum/1", json={"asisten_id": 2})
    assert response.status_code == 200
    assert entity(database, "praktikum", 1)["updated_at"] > before["updated_at"]
    assert revision(database) == baseline


def test_create_praktikum_invalidates_active_schedule_coverage(client, database):
    install_active_schedule(database)
    response = client.post("/api/v1/praktikum", json={"mata_praktikum_id": 2, "kelompok_id": 2, "asisten_id": 2})
    assert response.status_code == 201
    assert revision(database) == 1
    assert schedule_status(database)[0] == "invalid"


def test_used_praktikum_fk_change_invalidates(client, database):
    install_active_schedule(database)
    response = client.patch("/api/v1/praktikum/1", json={"asisten_id": 2})
    assert response.status_code == 200
    assert schedule_status(database)[0] == "invalid"


def test_praktikum_deactivate_and_reactivate_does_not_restore_schedule(client, database):
    install_active_schedule(database)
    assert client.patch("/api/v1/praktikum/1/status", json={"is_active": False}).status_code == 200
    assert schedule_status(database)[0] == "invalid"
    assert client.patch("/api/v1/praktikum/1/status", json={"is_active": True}).status_code == 200
    assert schedule_status(database)[0] == "invalid"


def test_reactivating_praktikum_invalidates_other_active_schedule(client, database):
    with sqlite3.connect(database) as connection:
        connection.execute("INSERT INTO praktikum (id,mata_praktikum_id,kelompok_id,asisten_id,is_active) VALUES (2,2,2,2,0)")
    # Jadwal aktif mencakup kegiatan 1; reaktivasi kegiatan 2 menambah coverage wajib.
    install_active_schedule(database)
    response = client.patch("/api/v1/praktikum/2/status", json={"is_active": True})
    assert response.status_code == 200
    assert schedule_status(database)[0] == "invalid"


def test_snapshot_and_details_remain_immutable_after_task10d_mutations(client, database):
    install_active_schedule(database)
    snapshot = schedule_status(database)[2]
    assert client.patch("/api/v1/praktikum/1", json={"asisten_id": 2}).status_code == 200
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT snapshot_json FROM versi_jadwal WHERE id=1").fetchone()[0] == snapshot
        assert connection.execute("SELECT praktikum_id,slot_id,laboratorium_id FROM detail_jadwal WHERE versi_id=1").fetchone() == (1, 1, 1)


def test_praktikum_reference_failure_rolls_back(client, database):
    before = entity(database, "praktikum", 1)
    response = client.patch("/api/v1/praktikum/1", json={"asisten_id": 999})
    assert response.status_code == 422
    assert entity(database, "praktikum", 1) == before
    assert revision(database) == 0


def test_get_list_and_detail_consistent_after_task10d_mutations(client):
    slot = client.post("/api/v1/slot-waktu", json={"hari": 1, "jam_mulai": "10:00", "jam_selesai": "12:00"}).get_json()["data"]
    praktikum = client.post("/api/v1/praktikum", json={"mata_praktikum_id": 2, "kelompok_id": 2, "asisten_id": 2}).get_json()["data"]
    assert client.get(f"/api/v1/slot-waktu/{slot['id']}").get_json()["data"] == slot
    assert client.get(f"/api/v1/praktikum/{praktikum['id']}").get_json()["data"] == praktikum
    assert slot["id"] in [item["id"] for item in client.get("/api/v1/slot-waktu").get_json()["data"]]
    assert praktikum["id"] in [item["id"] for item in client.get("/api/v1/praktikum").get_json()["data"]]
