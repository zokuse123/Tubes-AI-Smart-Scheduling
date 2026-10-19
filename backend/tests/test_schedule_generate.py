"""Contract and transaction tests for POST /api/v1/jadwal/generate."""

import datetime as dt
import json
import shutil
import sqlite3
import uuid
from pathlib import Path

import pytest

from backend.app import create_app
from backend.app.errors import APIError
import backend.app.scheduling as scheduling
from backend.db.init_db import init_db


FIXED_NOW = dt.datetime(2026, 10, 19, 8, 30, tzinfo=dt.timezone.utc)
SUCCESS = {
    "schema_version": 1,
    "source_revision": 7,
    "status": "success",
    "assignments": [{"praktikum_id": 1, "slot_id": 1, "laboratorium_id": 1}],
}
UNSAT = {
    "schema_version": 1,
    "source_revision": 7,
    "status": "unsatisfiable",
    "assignments": [],
}


@pytest.fixture()
def database(tmp_path: Path) -> Path:
    path = tmp_path / "generate.sqlite3"
    init_db(str(path))
    with sqlite3.connect(path) as db:
        db.executescript(
            """
            INSERT INTO mata_praktikum(id,nama,is_active) VALUES (1,'Kecerdasan Buatan',1);
            INSERT INTO kelompok(id,nama,jumlah_peserta,is_active) VALUES (1,'IF-3A',24,1);
            INSERT INTO asisten(id,nama,is_active) VALUES (1,'Rina',1);
            INSERT INTO laboratorium(id,nama,kapasitas,is_active) VALUES (1,'Lab AI',30,1);
            INSERT INTO slot_waktu(id,hari,jam_mulai,jam_selesai,is_active)
              VALUES (1,1,'08:00','10:00',1);
            INSERT INTO praktikum(id,mata_praktikum_id,kelompok_id,asisten_id,is_active)
              VALUES (1,1,1,1,1);
            INSERT INTO ketersediaan_kelompok(kelompok_id,slot_id) VALUES (1,1);
            INSERT INTO ketersediaan_asisten(asisten_id,slot_id) VALUES (1,1);
            UPDATE system_metadata SET value=7 WHERE key='source_revision';
            """
        )
    return path


@pytest.fixture()
def app(database: Path, monkeypatch):
    application = create_app(
        {
            "TESTING": True,
            "DATABASE": str(database),
            "SQLITE_TIMEOUT_SECONDS": 0.01,
        }
    )
    monkeypatch.setattr(scheduling, "_utc_now", lambda: FIXED_NOW)
    monkeypatch.setattr(scheduling, "run_solver", lambda _payload, _config: dict(SUCCESS))
    return application


@pytest.fixture()
def client(app):
    return app.test_client()


def rows(path: Path, sql: str):
    with sqlite3.connect(path) as db:
        db.row_factory = sqlite3.Row
        return db.execute(sql).fetchall()


def test_valid_empty_object_creates_canonical_preview(client, database):
    response = client.post("/api/v1/jadwal/generate", json={})
    assert response.status_code == 200
    data = response.get_json()["data"]
    parsed_uuid = uuid.UUID(data["preview_id"])
    assert parsed_uuid.version == 4
    assert data["preview_id"] == str(parsed_uuid)
    assert data["preview_status"] == "ready"
    assert data["source_revision"] == 7
    assert data["created_at"] == "2026-10-19T08:30:00.000Z"
    assert data["expires_at"] == "2026-10-19T09:00:00.000Z"
    assert data["summary"] == {"total_praktikum": 1, "total_assignment": 1}
    assert data["assignments"][0]["mata_praktikum"] == {
        "id": 1,
        "nama": "Kecerdasan Buatan",
    }

    preview = rows(database, "SELECT * FROM preview_jadwal")[0]
    assert preview["id"] == data["preview_id"]
    assert preview["status"] == "ready"
    assert preview["expires_at"] == data["expires_at"]
    assert preview["hasil_json"] == json.dumps(
        SUCCESS, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    assert json.loads(preview["hasil_json"]) == SUCCESS
    snapshot = json.loads(preview["snapshot_json"])
    assert snapshot["schema_version"] == 1
    assert snapshot["source_revision"] == 7
    assert snapshot["generated_at"] == data["created_at"]
    assert snapshot["saved_at"] is None
    assert snapshot["assignments"] == [
        {
            "praktikum_id": 1,
            "slot_id": 1,
            "laboratorium_id": 1,
            "mata_praktikum_nama": "Kecerdasan Buatan",
            "kelompok_nama": "IF-3A",
            "jumlah_peserta": 24,
            "asisten_nama": "Rina",
            "laboratorium_nama": "Lab AI",
            "laboratorium_kapasitas": 30,
            "hari": 1,
            "jam_mulai": "08:00",
            "jam_selesai": "10:00",
        }
    ]


@pytest.mark.parametrize(
    "kwargs,code,status",
    (
        ({}, "UNSUPPORTED_MEDIA_TYPE", 415),
        ({"data": "", "content_type": "application/json"}, "INVALID_JSON", 400),
        ({"json": []}, "VALIDATION_ERROR", 422),
        ({"json": {"unexpected": 1}}, "UNKNOWN_FIELD", 400),
        ({"json": {"source_revision": 7}}, "READ_ONLY_FIELD", 400),
    ),
)
def test_request_validation(client, kwargs, code, status):
    response = client.post("/api/v1/jadwal/generate", **kwargs)
    assert response.status_code == status
    assert response.get_json()["error"]["code"] == code


def test_unsatisfiable_has_no_side_effects(client, database, monkeypatch):
    monkeypatch.setattr(scheduling, "run_solver", lambda _payload, _config: dict(UNSAT))
    before_revision = rows(database, "SELECT value FROM system_metadata WHERE key='source_revision'")[0][0]
    response = client.post("/api/v1/jadwal/generate", json={})
    assert response.status_code == 200
    assert response.get_json() == {
        "data": {
            "status": "unsatisfiable",
            "message": "Tidak ditemukan jadwal yang memenuhi seluruh aturan.",
            "assignments": [],
        }
    }
    assert rows(database, "SELECT * FROM preview_jadwal") == []
    assert rows(database, "SELECT value FROM system_metadata WHERE key='source_revision'")[0][0] == before_revision


def test_data_not_ready_does_not_call_solver(client, database, monkeypatch):
    with sqlite3.connect(database) as db:
        db.execute("UPDATE praktikum SET is_active=0")
    monkeypatch.setattr(
        scheduling,
        "run_solver",
        lambda *_args: pytest.fail("solver must not run for unready data"),
    )
    response = client.post("/api/v1/jadwal/generate", json={})
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "DATA_NOT_READY"
    assert rows(database, "SELECT * FROM preview_jadwal") == []


@pytest.mark.parametrize(
    "code,status",
    (
        ("SOLVER_UNAVAILABLE", 503),
        ("SOLVER_TIMEOUT", 504),
        ("SOLVER_PROTOCOL_ERROR", 502),
        ("SOLVER_PROCESS_ERROR", 502),
        ("SOLVER_INTERNAL_ERROR", 502),
        ("SOLVER_INVALID_INPUT", 502),
    ),
)
def test_solver_errors_are_preserved_without_preview(client, database, monkeypatch, code, status):
    def fail(_payload, _config):
        raise APIError(code, "Pesan publik aman.", status)

    monkeypatch.setattr(scheduling, "run_solver", fail)
    response = client.post("/api/v1/jadwal/generate", json={})
    assert response.status_code == status
    assert response.get_json()["error"] == {
        "code": code,
        "message": "Pesan publik aman.",
        "details": None,
    }
    assert rows(database, "SELECT * FROM preview_jadwal") == []


def test_revision_race_returns_stale_and_preserves_initial_snapshot(client, database, monkeypatch):
    captured = {}

    def mutate_during_solver(payload, _config):
        captured["payload"] = payload
        with sqlite3.connect(database) as writer:
            writer.execute("UPDATE mata_praktikum SET nama='Nama Baru' WHERE id=1")
            writer.execute("UPDATE system_metadata SET value=8 WHERE key='source_revision'")
        return dict(SUCCESS)

    monkeypatch.setattr(scheduling, "run_solver", mutate_during_solver)
    response = client.post("/api/v1/jadwal/generate", json={})
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "STALE_GENERATION"
    assert captured["payload"]["source_revision"] == 7
    assert rows(database, "SELECT * FROM preview_jadwal") == []
    assert rows(database, "SELECT nama FROM mata_praktikum WHERE id=1")[0][0] == "Nama Baru"


def test_insert_failure_rolls_back_without_revision_or_active_changes(client, database):
    with sqlite3.connect(database) as db:
        db.executescript(
            """
            CREATE TRIGGER reject_preview BEFORE INSERT ON preview_jadwal
            BEGIN SELECT RAISE(ABORT, 'forced preview failure'); END;
            INSERT INTO versi_jadwal
              (id,status,source_revision,created_at,snapshot_json)
              VALUES (1,'active',7,'2026-10-19T08:00:00.000Z','{}');
            """
        )
    response = client.post("/api/v1/jadwal/generate", json={})
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "DATABASE_ERROR"
    assert rows(database, "SELECT * FROM preview_jadwal") == []
    assert rows(database, "SELECT status FROM versi_jadwal WHERE id=1")[0][0] == "active"
    assert rows(database, "SELECT value FROM system_metadata WHERE key='source_revision'")[0][0] == 7


def test_generate_never_changes_existing_active_schedule_or_revision(client, database):
    with sqlite3.connect(database) as db:
        db.execute(
            """INSERT INTO versi_jadwal
               (id,status,source_revision,created_at,snapshot_json)
               VALUES (1,'active',7,'2026-10-19T08:00:00.000Z','{}')"""
        )
    assert client.post("/api/v1/jadwal/generate", json={}).status_code == 200
    assert rows(database, "SELECT status FROM versi_jadwal WHERE id=1")[0][0] == "active"
    assert rows(database, "SELECT value FROM system_metadata WHERE key='source_revision'")[0][0] == 7


def test_display_uses_initial_source_snapshot_without_post_solver_join(client, database, monkeypatch):
    def rename_without_revision(_payload, _config):
        with sqlite3.connect(database) as writer:
            writer.execute("UPDATE mata_praktikum SET nama='Nama Yang Tidak Boleh Dipakai' WHERE id=1")
        return dict(SUCCESS)

    monkeypatch.setattr(scheduling, "run_solver", rename_without_revision)
    response = client.post("/api/v1/jadwal/generate", json={})
    assert response.status_code == 200
    assignment = response.get_json()["data"]["assignments"][0]
    assert assignment["mata_praktikum"]["nama"] == "Kecerdasan Buatan"
    preview = rows(database, "SELECT snapshot_json FROM preview_jadwal")[0]
    assert json.loads(preview[0])["mata_praktikum"][0]["nama"] == "Kecerdasan Buatan"


def test_assignments_are_materialized_in_canonical_praktikum_order(client, database, monkeypatch):
    with sqlite3.connect(database) as db:
        db.executescript(
            """
            INSERT INTO mata_praktikum(id,nama,is_active) VALUES (2,'Data',1);
            INSERT INTO kelompok(id,nama,jumlah_peserta,is_active) VALUES (2,'IF-3B',20,1);
            INSERT INTO asisten(id,nama,is_active) VALUES (2,'Budi',1);
            INSERT INTO laboratorium(id,nama,kapasitas,is_active) VALUES (2,'Lab Data',25,1);
            INSERT INTO slot_waktu(id,hari,jam_mulai,jam_selesai,is_active)
              VALUES (2,1,'10:00','12:00',1);
            INSERT INTO praktikum(id,mata_praktikum_id,kelompok_id,asisten_id,is_active)
              VALUES (2,2,2,2,1);
            INSERT INTO ketersediaan_kelompok(kelompok_id,slot_id) VALUES (2,2);
            INSERT INTO ketersediaan_asisten(asisten_id,slot_id) VALUES (2,2);
            """
        )
    reversed_result = {
        "schema_version": 1,
        "source_revision": 7,
        "status": "success",
        "assignments": [
            {"praktikum_id": 2, "slot_id": 2, "laboratorium_id": 2},
            {"praktikum_id": 1, "slot_id": 1, "laboratorium_id": 1},
        ],
    }
    monkeypatch.setattr(scheduling, "run_solver", lambda *_args: reversed_result)
    response = client.post("/api/v1/jadwal/generate", json={})
    assert response.status_code == 200
    assert [item["praktikum_id"] for item in response.get_json()["data"]["assignments"]] == [1, 2]
    snapshot = json.loads(rows(database, "SELECT snapshot_json FROM preview_jadwal")[0][0])
    assert [item["praktikum_id"] for item in snapshot["assignments"]] == [1, 2]


def test_database_busy_during_revision_recheck_has_no_partial_preview(client, database):
    blocker = sqlite3.connect(database)
    try:
        blocker.execute("BEGIN IMMEDIATE")
        response = client.post("/api/v1/jadwal/generate", json={})
    finally:
        blocker.rollback()
        blocker.close()
    assert response.status_code == 503
    assert response.get_json()["error"]["code"] == "DATABASE_BUSY"
    assert rows(database, "SELECT * FROM preview_jadwal") == []


@pytest.mark.skipif(shutil.which("swipl") is None, reason="SWI-Prolog executable unavailable")
def test_real_solver_sat_and_unsat(database, monkeypatch):
    monkeypatch.undo()
    application = create_app({"TESTING": True, "DATABASE": str(database)})
    client = application.test_client()
    sat = client.post("/api/v1/jadwal/generate", json={})
    assert sat.status_code == 200
    assert sat.get_json()["data"]["status"] == "success"
    with sqlite3.connect(database) as db:
        db.execute("DELETE FROM ketersediaan_kelompok")
        db.execute("UPDATE system_metadata SET value=8 WHERE key='source_revision'")
    unsat = client.post("/api/v1/jadwal/generate", json={})
    assert unsat.status_code == 200
    assert unsat.get_json()["data"]["status"] == "unsatisfiable"
