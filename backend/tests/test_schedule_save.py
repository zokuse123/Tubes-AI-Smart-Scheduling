"""Save lifecycle, persisted integrity, and bounded concurrent REST requests."""

import copy
import datetime as dt
import importlib
import json
import shutil
import sqlite3
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.app import create_app
from backend.app import scheduling
from backend.app import mutations
from backend.app.db import get_db
from backend.tests.test_schedule_generate import database, rows, FIXED_NOW
from backend.tests.route_inventory import EXPECTED_API_OPERATIONS


SAVE = "/api/v1/jadwal/simpan"
NOW = "2026-10-19T08:35:00.000Z"


@pytest.fixture()
def app(database, monkeypatch):
    app = create_app({"TESTING": True, "DATABASE": str(database), "SQLITE_TIMEOUT_SECONDS": 2})
    monkeypatch.setattr(scheduling, "_utc_now", lambda: FIXED_NOW)
    # Two activities exercise full detail insertion and rollback after one row.
    with sqlite3.connect(database) as db:
        db.executescript("""
            INSERT INTO slot_waktu(id,hari,jam_mulai,jam_selesai) VALUES (2,1,'10:00','12:00');
            INSERT INTO praktikum(id,mata_praktikum_id,kelompok_id,asisten_id) VALUES (2,1,1,1);
            INSERT INTO ketersediaan_kelompok VALUES (1,2);
            INSERT INTO ketersediaan_asisten VALUES (1,2);
        """)
    def solver(payload, config):
        return {"schema_version": 1, "source_revision": payload["source_revision"],
                "status": "success", "assignments": [
                    {"praktikum_id": 1, "slot_id": 1, "laboratorium_id": 1},
                    {"praktikum_id": 2, "slot_id": 2, "laboratorium_id": 1},
                ]}
    monkeypatch.setattr(scheduling, "run_solver", solver)
    return app


@pytest.fixture()
def client(app):
    return app.test_client()


def generate(client):
    response = client.post("/api/v1/jadwal/generate", json={})
    assert response.status_code == 200
    return response.get_json()["data"]


@pytest.fixture()
def preview(client, monkeypatch):
    result = generate(client)
    monkeypatch.setattr(scheduling, "_utc_now", lambda: FIXED_NOW + dt.timedelta(minutes=5))
    return result


def save(client, preview):
    return client.post(SAVE, json={"preview_id": preview["preview_id"]})


def assert_error(response, code, status):
    assert response.status_code == status
    error = response.get_json()["error"]
    assert set(error) == {"code", "message", "details"}
    assert error["code"] == code
    return error


def state(database):
    return {table: [dict(r) for r in rows(database, f"SELECT * FROM {table} ORDER BY id")]
            for table in ("preview_jadwal", "versi_jadwal", "detail_jadwal")}


def test_valid_save_response_snapshot_details_and_revision(client, preview, database):
    before = state(database)["preview_jadwal"][0]
    response = save(client, preview)
    assert response.status_code == 201
    body = response.get_json()
    assert body == {"data": {
        "id": 1, "status": "active", "source_revision": 7, "created_at": NOW,
        "invalidated_at": None, "archived_at": None,
        "summary": {"total_praktikum": 2, "total_assignment": 2},
        "assignments": preview["assignments"],
    }}
    after = state(database)
    stored = json.loads(after["versi_jadwal"][0]["snapshot_json"])
    original = json.loads(before["snapshot_json"])
    assert stored == {**original, "saved_at": NOW}
    assert after["preview_jadwal"][0] == {
        **before, "status": "consumed", "consumed_at": NOW, "terminal_at": NOW,
    }
    assert [(r["praktikum_id"], r["slot_id"], r["laboratorium_id"])
            for r in after["detail_jadwal"]] == [(1, 1, 1), (2, 2, 1)]
    assert rows(database, "SELECT value FROM system_metadata")[0][0] == 7
    with sqlite3.connect(database) as db:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("UPDATE versi_jadwal SET snapshot_json='{}' WHERE id=1")
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("UPDATE detail_jadwal SET slot_id=2 WHERE id=1")


@pytest.mark.parametrize("value", [None, True, 7, [], {}, "", "invalid",
    "550E8400-E29B-41D4-A716-446655440000", "550e8400e29b41d4a716446655440000",
    "{550e8400-e29b-41d4-a716-446655440000}", " 550e8400-e29b-41d4-a716-446655440000",
    "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
    "00000000-0000-0000-0000-000000000000", "550e8400-e29b-91d4-a716-446655440000"])
def test_invalid_uuid(client, value):
    assert_error(client.post(SAVE, json={"preview_id": value}), "VALIDATION_ERROR", 422)


@pytest.mark.parametrize("version", range(1, 9))
def test_rfc_uuid_versions_valid_but_missing(client, version):
    value = f"550e8400-e29b-{version}1d4-a716-446655440000"
    assert_error(client.post(SAVE, json={"preview_id": value}), "PREVIEW_NOT_FOUND", 404)


@pytest.mark.parametrize("kwargs,code,status", [
    ({}, "UNSUPPORTED_MEDIA_TYPE", 415),
    ({"data": "", "content_type": "application/json"}, "INVALID_JSON", 400),
    ({"data": "{", "content_type": "application/json"}, "INVALID_JSON", 400),
    ({"json": []}, "VALIDATION_ERROR", 422),
    ({"json": {}}, "VALIDATION_ERROR", 422),
    ({"json": {"surprise": 1}}, "UNKNOWN_FIELD", 400),
    ({"json": {"assignments": []}}, "READ_ONLY_FIELD", 400),
    ({"json": {"source_revision": 7}}, "READ_ONLY_FIELD", 400),
])
def test_request_shape(client, kwargs, code, status):
    assert_error(client.post(SAVE, **kwargs), code, status)


@pytest.mark.parametrize("terminal,code", [
    ("consumed", "PREVIEW_CONSUMED"), ("stale", "STALE_PREVIEW"), ("expired", "PREVIEW_EXPIRED"),
])
def test_terminal_priority_and_no_rewrite(client, preview, database, monkeypatch, terminal, code):
    with sqlite3.connect(database) as db:
        db.execute("UPDATE preview_jadwal SET status=?,terminal_at=?,consumed_at=?",
                   (terminal, NOW, NOW if terminal == "consumed" else None))
        db.execute("UPDATE system_metadata SET value=8")
    before = state(database)
    monkeypatch.setattr(scheduling, "_utc_now", lambda: FIXED_NOW + dt.timedelta(hours=1))
    assert_error(save(client, preview), code, 409)
    assert state(database) == before


@pytest.mark.parametrize("stale", [False, True])
def test_exact_expiry_commits_terminal_and_beats_stale(client, preview, database, monkeypatch, stale):
    if stale:
        with sqlite3.connect(database) as db:
            db.execute("UPDATE system_metadata SET value=8")
    monkeypatch.setattr(scheduling, "_utc_now", lambda: FIXED_NOW + dt.timedelta(minutes=30))
    assert_error(save(client, preview), "PREVIEW_EXPIRED", 409)
    row = state(database)["preview_jadwal"][0]
    assert (row["status"], row["terminal_at"], row["consumed_at"]) == ("expired", preview["expires_at"], None)
    assert state(database)["versi_jadwal"] == []


def test_ready_stale_commits_terminal(client, preview, database):
    with sqlite3.connect(database) as db:
        db.execute("UPDATE system_metadata SET value=8")
    assert_error(save(client, preview), "STALE_PREVIEW", 409)
    row = state(database)["preview_jadwal"][0]
    assert (row["status"], row["terminal_at"], row["consumed_at"]) == ("stale", NOW, None)
    assert state(database)["versi_jadwal"] == []


def test_sequential_double_save(client, preview, database):
    assert save(client, preview).status_code == 201
    before = state(database)
    assert_error(save(client, preview), "PREVIEW_CONSUMED", 409)
    assert state(database) == before


def test_archive_active_keep_invalid_and_old_details(client, preview, database):
    assert save(client, preview).status_code == 201
    second = generate(client)
    assert save(client, second).status_code == 201
    versions = state(database)["versi_jadwal"]
    assert [(r["status"], r["archived_at"]) for r in versions] == [("archived", NOW), ("active", None)]
    with sqlite3.connect(database) as db:
        db.execute("UPDATE versi_jadwal SET status='invalid',invalidated_at=? WHERE id=2", (NOW,))
    before = state(database)
    third = generate(client)
    assert save(client, third).status_code == 201
    after = state(database)
    assert after["versi_jadwal"][:2] == before["versi_jadwal"]
    assert after["detail_jadwal"][:4] == before["detail_jadwal"]
    assert sum(r["status"] == "active" for r in after["versi_jadwal"]) == 1


def corrupt_copy(database, original_id, mutate):
    # Insert adversarial persisted data; production triggers remain enabled.
    with sqlite3.connect(database) as db:
        db.row_factory = sqlite3.Row
        row = dict(db.execute("SELECT * FROM preview_jadwal WHERE id=?", (original_id,)).fetchone())
        result, snapshot = json.loads(row["hasil_json"]), json.loads(row["snapshot_json"])
        mutate(result, snapshot)
        row.update(id=str(uuid.uuid4()), hasil_json=json.dumps(result), snapshot_json=json.dumps(snapshot))
        fields = tuple(row)
        db.execute(f"INSERT INTO preview_jadwal({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})",
                   tuple(row.values()))
        return {"preview_id": row["id"]}


@pytest.mark.parametrize("mutation", [
    lambda r, s: r.update(status="unsatisfiable", assignments=[]),
    lambda r, s: r.update(source_revision=8),
    lambda r, s: r.update(schema_version=True),
    lambda r, s: r["assignments"].reverse(),
    lambda r, s: r["assignments"].pop(),
    lambda r, s: r["assignments"][0].update(slot_id=99),
    lambda r, s: s.update(source_revision=True),
    lambda r, s: s.update(schema_version=True),
    lambda r, s: s.update(saved_at=NOW),
    lambda r, s: s.update(generated_at=NOW),
    lambda r, s: s.update(extra="secret"),
    lambda r, s: s["assignments"].reverse(),
    lambda r, s: s["assignments"][0].update(slot_id=True),
    lambda r, s: s["assignments"][0].update(kelompok_nama="forged"),
    lambda r, s: s["kelompok"][0].update(jumlah_peserta=24.0),
    lambda r, s: s["praktikum"][0].update(asisten_id=99),
    lambda r, s: s["praktikum"].reverse(),
    lambda r, s: s["mata_praktikum"].append(copy.deepcopy(s["mata_praktikum"][0])),
])
def test_persisted_inconsistency_rolls_back(client, preview, database, mutation):
    bad = corrupt_copy(database, preview["preview_id"], mutation)
    before = state(database)
    error = assert_error(save(client, bad), "DATABASE_ERROR", 500)
    assert error == {"code": "DATABASE_ERROR", "message": "Operasi database gagal.", "details": None}
    assert state(database) == before


@pytest.mark.parametrize("field,raw", [
    ("hasil_json", "[]"), ("snapshot_json", "null"),
    ("hasil_json", '{"schema_version":1,"schema_version":1}'),
])
def test_corrupt_json_shapes_rejected(client, preview, database, field, raw):
    with sqlite3.connect(database) as db:
        db.row_factory = sqlite3.Row
        row = dict(db.execute("SELECT * FROM preview_jadwal").fetchone())
        row.update(id=str(uuid.uuid4()))
        row[field] = raw
        fields = tuple(row)
        db.execute(f"INSERT INTO preview_jadwal({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})",
                   tuple(row.values()))
    assert_error(save(client, {"preview_id": row["id"]}), "DATABASE_ERROR", 500)


def test_malformed_json_read_failure_is_sanitized(client, preview, monkeypatch):
    original = scheduling._validated_preview
    def corrupted_read(row):
        row = dict(row)
        row["hasil_json"] = '{"sensitive":'
        return original(row)
    monkeypatch.setattr(scheduling, "_validated_preview", corrupted_read)
    assert_error(save(client, preview), "DATABASE_ERROR", 500)


@pytest.mark.parametrize("failure", ["detail", "consume_abort", "consume_ignore"])
def test_failure_restores_archived_active_all_details_and_preview(client, preview, database, failure):
    assert save(client, preview).status_code == 201
    next_preview = generate(client)
    before = state(database)
    with sqlite3.connect(database) as db:
        if failure == "detail":
            db.executescript("""CREATE TRIGGER injected_failure BEFORE INSERT ON detail_jadwal
                WHEN NEW.praktikum_id=2 BEGIN SELECT RAISE(ABORT,'private SQL detail'); END;""")
        else:
            action = "RAISE(IGNORE)" if failure == "consume_ignore" else "RAISE(ABORT,'private SQL consume')"
            db.executescript(f"""CREATE TRIGGER injected_failure BEFORE UPDATE ON preview_jadwal
                WHEN NEW.status='consumed' BEGIN SELECT {action}; END;""")
    assert_error(save(client, next_preview), "DATABASE_ERROR", 500)
    assert state(database) == before
    assert rows(database, "SELECT value FROM system_metadata")[0][0] == 7


def test_database_busy(client, preview, database, app):
    app.config["SQLITE_TIMEOUT_SECONDS"] = 0.02
    with sqlite3.connect(database) as blocker:
        blocker.execute("BEGIN IMMEDIATE")
        assert_error(save(client, preview), "DATABASE_BUSY", 503)
    assert state(database)["versi_jadwal"] == []


@pytest.mark.parametrize("same_preview", [True, False])
def test_concurrent_saves(app, client, preview, database, same_preview):
    other = preview if same_preview else generate(client)
    barrier = threading.Barrier(2, timeout=3)
    def worker(item):
        with app.test_client() as thread_client:
            barrier.wait()
            return save(thread_client, item)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker, item) for item in (preview, other)]
        responses = [future.result(timeout=6) for future in futures]
    assert sorted(r.status_code for r in responses) == ([201, 409] if same_preview else [201, 201])
    if same_preview:
        assert_error(next(r for r in responses if r.status_code == 409), "PREVIEW_CONSUMED", 409)
    final = state(database)
    assert len(final["versi_jadwal"]) == (1 if same_preview else 2)
    assert len(final["detail_jadwal"]) == (2 if same_preview else 4)
    assert sum(r["status"] == "active" for r in final["versi_jadwal"]) == 1
    assert all(r["status"] == "consumed" for r in final["preview_jadwal"])


@pytest.mark.parametrize("save_first", [True, False])
def test_save_vs_mutation_serializes(app, client, preview, database, monkeypatch, save_first):
    entered = threading.Event()
    release = threading.Event()
    contender_started = threading.Event()
    if save_first:
        original = scheduling._validated_preview
        def held(*args):
            entered.set()
            assert release.wait(4)
            return original(*args)
        monkeypatch.setattr(scheduling, "_validated_preview", held)
    else:
        original = mutations._increment_revision
        def held(*args):
            original(*args)
            entered.set()
            assert release.wait(4)
        monkeypatch.setattr(mutations, "_increment_revision", held)
    def do_save():
        with app.test_client() as c:
            return save(c, preview)
    def do_mutation():
        with app.test_client() as c:
            return c.patch("/api/v1/praktikum/1/status", json={"is_active": False})
    first, second = (do_save, do_mutation) if save_first else (do_mutation, do_save)
    def contender():
        with app.app_context():
            connection = get_db()
            connection.set_trace_callback(
                lambda sql: contender_started.set() if sql == "BEGIN IMMEDIATE" else None
            )
            return second()
    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(first)
        try:
            assert entered.wait(4)
            b = pool.submit(contender)
            assert contender_started.wait(4)
        finally:
            release.set()
        responses = [a.result(timeout=6), b.result(timeout=6)]
    if save_first:
        assert [r.status_code for r in responses] == [201, 200]
        assert [r["status"] for r in state(database)["versi_jadwal"]] == ["invalid"]
    else:
        assert responses[0].status_code == 200
        assert_error(responses[1], "STALE_PREVIEW", 409)
        assert state(database)["versi_jadwal"] == []
    assert rows(database, "SELECT value FROM system_metadata")[0][0] == 8


@pytest.mark.parametrize("mutation", ["rename", "deactivate"])
def test_changed_master_rejects_stale_without_rewriting_preview(client, preview, database, mutation):
    before = state(database)["preview_jadwal"][0]["snapshot_json"]
    if mutation == "rename":
        response = client.patch("/api/v1/mata-praktikum/1", json={"nama": "New name"})
    else:
        response = client.patch("/api/v1/mata-praktikum/1/status", json={"is_active": False})
    assert response.status_code == 200
    assert_error(save(client, preview), "STALE_PREVIEW", 409)
    assert state(database)["preview_jadwal"][0]["snapshot_json"] == before


def test_saved_history_keeps_labels_after_master_mutations(client, preview, database):
    assert save(client, preview).status_code == 201
    before = state(database)["versi_jadwal"][0]["snapshot_json"]
    assert client.patch("/api/v1/mata-praktikum/1", json={"nama": "New name"}).status_code == 200
    assert client.patch("/api/v1/mata-praktikum/1/status", json={"is_active": False}).status_code == 200
    assert state(database)["versi_jadwal"][0]["snapshot_json"] == before


def test_route_inventory(app):
    actual = {(m, r.rule) for r in app.url_map.iter_rules()
              for m in r.methods - {"HEAD", "OPTIONS"} if r.rule.startswith("/api/v1")}
    assert actual == EXPECTED_API_OPERATIONS
    assert {(method, path) for method, path in actual if "/jadwal/" in path} == {
        ("POST", SAVE), ("POST", "/api/v1/jadwal/generate"),
        ("GET", "/api/v1/jadwal/aktif"), ("GET", "/api/v1/jadwal/riwayat"),
        ("GET", "/api/v1/jadwal/riwayat/<int:version_id>"),
    }
    assert ("GET", "/api/v1/health") in actual


def test_one_transaction_and_no_master_reads(app, preview, database):
    statements = []
    with app.app_context():
        connection = get_db()
        connection.set_trace_callback(statements.append)
        assert save(app.test_client(), preview).status_code == 201
        assert not connection.in_transaction
    assert statements[0] == "BEGIN IMMEDIATE"
    assert statements[-1] == "COMMIT"
    assert statements.count("BEGIN IMMEDIATE") == 1
    selects = [sql for sql in statements if sql.startswith("SELECT")]
    assert len(selects) == 2
    assert "preview_jadwal" in selects[0]
    assert "system_metadata" in selects[1]


@pytest.mark.parametrize("terminal", ["expired", "stale"])
def test_failed_terminal_transition_rolls_back(client, preview, database, monkeypatch, terminal):
    if terminal == "expired":
        monkeypatch.setattr(scheduling, "_utc_now", lambda: FIXED_NOW + dt.timedelta(minutes=30))
    else:
        with sqlite3.connect(database) as db:
            db.execute("UPDATE system_metadata SET value=8")
    with sqlite3.connect(database) as db:
        db.executescript("""CREATE TRIGGER reject_terminal BEFORE UPDATE ON preview_jadwal
            BEGIN SELECT RAISE(IGNORE); END;""")
    before = state(database)
    assert_error(save(client, preview), "DATABASE_ERROR", 500)
    assert state(database) == before


def test_missing_revision_is_database_error(client, preview, database):
    with sqlite3.connect(database) as db:
        db.execute("DELETE FROM system_metadata WHERE key='source_revision'")
    before = state(database)
    assert_error(save(client, preview), "DATABASE_ERROR", 500)
    assert state(database) == before


def test_commit_failure_rolls_back_all_changes(app, client, preview, database, monkeypatch):
    api_module = importlib.import_module("backend.app.api")
    class CommitFailure(sqlite3.Connection):
        def commit(self):
            raise sqlite3.OperationalError("injected private commit failure")
    connection = sqlite3.connect(database, factory=CommitFailure)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    monkeypatch.setattr(api_module, "get_db", lambda: connection)
    before = state(database)
    try:
        assert_error(save(client, preview), "DATABASE_ERROR", 500)
        assert not connection.in_transaction
        assert state(database) == before
    finally:
        connection.close()


@pytest.mark.skipif(shutil.which("swipl") is None, reason="SWI-Prolog unavailable")
def test_real_generate_save(app, client, database, monkeypatch):
    from backend.app.solver_adapter import run_solver
    monkeypatch.setattr(scheduling, "run_solver", run_solver)
    preview = generate(client)
    response = save(client, preview)
    assert response.status_code == 201
    assert response.get_json()["data"]["assignments"] == preview["assignments"]
    assert len(state(database)["detail_jadwal"]) == 2
