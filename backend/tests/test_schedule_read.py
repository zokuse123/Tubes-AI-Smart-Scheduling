"""Active schedule and immutable history REST contract tests."""

import importlib
import json
import shutil
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.app import scheduling
from backend.tests.test_schedule_generate import solver_execution
from backend.tests.test_schedule_save import app, client, database, preview, generate, save, state
from backend.tests.route_inventory import EXPECTED_API_OPERATIONS


ACTIVE = "/api/v1/jadwal/aktif"
HISTORY = "/api/v1/jadwal/riwayat"


def create_saved(client, item):
    response = save(client, item)
    assert response.status_code == 201
    return response.get_json()["data"]


def seed_three_statuses(client, preview, monkeypatch):
    first = create_saved(client, preview)
    mutation = client.patch("/api/v1/praktikum/1/status", json={"is_active": False})
    assert mutation.status_code == 200
    # Remaining activity can still generate a valid schedule.
    def remaining_activity(payload, _config):
        return solver_execution(
            {"schema_version": 1, "source_revision": payload["source_revision"],
             "status": "success", "assignments": [
                 {"praktikum_id": 2, "slot_id": 2, "laboratorium_id": 1}
             ]},
            [{"praktikum_id": 2, "slot_count": 2, "laboratory_count": 1,
              "theoretical_pairs": 2}],
        )
    monkeypatch.setattr(scheduling, "run_solver", remaining_activity)
    second_preview = generate(client)
    second = create_saved(client, second_preview)
    third_preview = generate(client)
    third = create_saved(client, third_preview)
    first["status"] = "invalid"
    second["status"] = "archived"
    return first, second, third


def versions(database):
    return [dict(row) for row in state(database)["versi_jadwal"]]


def test_active_absent_and_no_side_effect(client, database):
    before = state(database)
    revision = sqlite3.connect(database).execute(
        "SELECT value FROM system_metadata WHERE key='source_revision'"
    ).fetchone()[0]
    response = client.get(ACTIVE)
    assert response.status_code == 200
    assert response.get_json() == {"data": None}
    assert state(database) == before
    assert sqlite3.connect(database).execute(
        "SELECT value FROM system_metadata WHERE key='source_revision'"
    ).fetchone()[0] == revision


def test_active_full_nested_response_many_assignments(client, preview):
    schedule = create_saved(client, preview)
    response = client.get(ACTIVE)
    assert response.status_code == 200
    assert response.get_json() == {"data": schedule}
    assert [a["praktikum_id"] for a in response.get_json()["data"]["assignments"]] == [1, 2]


def test_empty_history_contract(client):
    response = client.get(HISTORY)
    assert response.status_code == 200
    assert response.get_json() == {
        "data": [], "meta": {"page": 1, "page_size": 20, "total_items": 0, "total_pages": 0}
    }


def test_history_list_returns_metadata_without_snapshot_or_assignments(client, preview):
    saved = create_saved(client, preview)
    body = client.get(HISTORY).get_json()
    assert body["meta"] == {"page": 1, "page_size": 20, "total_items": 1, "total_pages": 1}
    assert body["data"] == [{k: saved[k] for k in (
        "id", "status", "source_revision", "created_at", "invalidated_at", "archived_at", "summary"
    )}]
    assert "snapshot" not in body["data"][0]
    assert "assignments" not in body["data"][0]


def test_history_statuses_and_default_created_desc(client, preview, monkeypatch):
    first, second, third = seed_three_statuses(client, preview, monkeypatch)
    body = client.get(HISTORY).get_json()
    assert [row["id"] for row in body["data"]] == [third["id"], second["id"], first["id"]]
    assert [row["status"] for row in body["data"]] == ["active", "archived", "invalid"]
    for status in ("active", "invalid", "archived"):
        filtered = client.get(HISTORY, query_string={"status": status}).get_json()
        assert [r["status"] for r in filtered["data"]] == [status]


@pytest.mark.parametrize("order,expected", [("asc", [1, 2, 3]), ("desc", [3, 2, 1])])
def test_sort_by_id_and_created_at(client, preview, monkeypatch, order, expected):
    seed_three_statuses(client, preview, monkeypatch)
    response = client.get(HISTORY, query_string={"sort_by": "id", "sort_order": order})
    assert [r["id"] for r in response.get_json()["data"]] == expected
    created = client.get(HISTORY, query_string={"sort_by": "created_at", "sort_order": order})
    assert [r["id"] for r in created.get_json()["data"]] == expected  # identical timestamps: ID tie-break


def test_tie_break_and_pagination_are_deterministic(client, preview, monkeypatch):
    seed_three_statuses(client, preview, monkeypatch)
    all_ids = [r["id"] for r in client.get(HISTORY, query_string={"page_size": 1}).get_json()["data"]]
    pages = [client.get(HISTORY, query_string={"page": i, "page_size": 1}).get_json()
             for i in (1, 2, 3)]
    assert all_ids == [3]
    assert [page["data"][0]["id"] for page in pages] == [3, 2, 1]
    assert [page["meta"]["total_pages"] for page in pages] == [3, 3, 3]
    assert client.get(HISTORY, query_string={"page": 4, "page_size": 1}).get_json()["data"] == []


@pytest.mark.parametrize("query", [
    {"page": "0"}, {"page": "-1"}, {"page": "1.2"}, {"page": "１２"},
    {"page_size": "101"}, {"page_size": "0"}, {"sort_by": "status"},
    {"sort_order": "up"}, {"status": "deleted"}, {"unexpected": "x"},
    "page=1&page=2",
])
def test_invalid_history_query(client, query):
    response = client.get(HISTORY, query_string=query)
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_QUERY"


def test_history_detail_for_active_archived_and_invalid(client, preview, database, monkeypatch):
    first, second, third = seed_three_statuses(client, preview, monkeypatch)
    for expected in (first, second, third):
        response = client.get(f"{HISTORY}/{expected['id']}")
        assert response.status_code == 200
        body = response.get_json()["data"]
        assert body["id"] == expected["id"]
        assert body["status"] == expected["status"]
        assert body["assignments"] == expected["assignments"]
        assert body["snapshot"] == {
            "schema_version": 1,
            "source_revision": expected["source_revision"],
            "generated_at": json.loads(next(v["snapshot_json"] for v in versions(database)
                                               if v["id"] == expected["id"]))["generated_at"],
            "saved_at": expected["created_at"],
        }
        assert "snapshot_json" not in body
        assert "hasil_json" not in body


@pytest.mark.parametrize("path", [f"{HISTORY}/0", f"{HISTORY}/999999", f"{HISTORY}/abc"])
def test_history_detail_not_found_or_invalid_identifier(client, path):
    response = client.get(path)
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "RESOURCE_NOT_FOUND"


@pytest.mark.parametrize("mutation", ["rename", "deactivate"])
def test_master_changes_never_rebuild_historical_labels(client, preview, database, mutation):
    saved = create_saved(client, preview)
    original = json.loads(versions(database)[0]["snapshot_json"])
    if mutation == "rename":
        assert client.patch("/api/v1/mata-praktikum/1", json={"nama": "Renamed"}).status_code == 200
    else:
        assert client.patch("/api/v1/laboratorium/1/status", json={"is_active": False}).status_code == 200
    result = client.get(f"{HISTORY}/{saved['id']}").get_json()["data"]
    assert result["assignments"] == saved["assignments"]
    assert original["assignments"][0]["mata_praktikum_nama"] == "Kecerdasan Buatan"


def test_saving_new_version_preserves_old_snapshot(client, preview, database):
    old = create_saved(client, preview)
    old_snapshot = versions(database)[0]["snapshot_json"]
    new = create_saved(client, generate(client))
    assert new["id"] != old["id"]
    assert versions(database)[0]["snapshot_json"] == old_snapshot
    assert client.get(f"{HISTORY}/{old['id']}").get_json()["data"]["status"] == "archived"


@pytest.mark.parametrize("corruption", ["malformed", "shape", "detail_missing", "detail_mismatch"])
def test_corrupt_snapshot_or_detail_fails_safely_without_fallback(client, preview, database, corruption):
    saved = create_saved(client, preview)
    with sqlite3.connect(database) as db:
        if corruption in ("malformed", "shape"):
            db.execute("PRAGMA ignore_check_constraints=ON")
            db.execute("DROP TRIGGER trg_versi_jadwal_immutable")
            value = "{" if corruption == "malformed" else "[]"
            db.execute("UPDATE versi_jadwal SET snapshot_json=? WHERE id=?", (value, saved["id"]))
        elif corruption == "detail_missing":
            db.execute("DELETE FROM detail_jadwal WHERE versi_id=? AND praktikum_id=2", (saved["id"],))
        else:
            db.execute("DROP TRIGGER trg_detail_jadwal_immutable")
            db.execute("UPDATE detail_jadwal SET slot_id=999 WHERE versi_id=? AND praktikum_id=2", (saved["id"],))
    response = client.get(ACTIVE)
    assert response.status_code == 500
    error = response.get_json()["error"]
    assert error["code"] == "DATABASE_ERROR"
    assert "snapshot" not in json.dumps(error).lower()


def test_read_get_does_not_mutate_revision_status_or_timestamps(client, preview, database):
    saved = create_saved(client, preview)
    before = state(database)
    client.get(ACTIVE)
    client.get(HISTORY)
    client.get(f"{HISTORY}/{saved['id']}")
    after = state(database)
    assert before == after
    assert sqlite3.connect(database).execute(
        "SELECT value FROM system_metadata WHERE key='source_revision'"
    ).fetchone()[0] == 7


def test_snapshot_and_details_read_from_same_sqlite_transaction(app, client, preview, database, monkeypatch):
    create_saved(client, preview)
    second = generate(client)
    entered = threading.Event()
    release = threading.Event()
    original = scheduling._version_details
    def held(db, version_id):
        rows = original(db, version_id)
        entered.set()
        assert release.wait(4)
        return rows
    monkeypatch.setattr(scheduling, "_version_details", held)
    def reader():
        with app.test_client() as c:
            return c.get(ACTIVE)
    def writer():
        assert entered.wait(4)
        with app.test_client() as c:
            response = save(c, second)
        return response
    with ThreadPoolExecutor(max_workers=2) as pool:
        read_future = pool.submit(reader)
        write_future = pool.submit(writer)
        assert entered.wait(4)
        release.set()
        read_response = read_future.result(timeout=6)
        write_response = write_future.result(timeout=6)
    assert read_response.status_code == 200
    assert write_response.status_code == 201
    assert read_response.get_json()["data"]["id"] == 1
    assert read_response.get_json()["data"]["status"] == "active"
    assert client.get(ACTIVE).get_json()["data"]["id"] == 2


def test_read_route_inventory(app):
    actual = {(method, r.rule) for r in app.url_map.iter_rules()
              for method in r.methods - {"HEAD", "OPTIONS"} if r.rule.startswith("/api/v1")}
    assert actual == EXPECTED_API_OPERATIONS
    assert {(method, path) for method, path in actual if "/jadwal/" in path} == {
        ("POST", "/api/v1/jadwal/generate"), ("POST", "/api/v1/jadwal/simpan"),
        ("GET", ACTIVE), ("GET", HISTORY), ("GET", f"{HISTORY}/<int:version_id>"),
    }
    assert ("GET", "/api/v1/health") in actual


@pytest.mark.skipif(shutil.which("swipl") is None, reason="SWI-Prolog unavailable")
def test_real_generate_save_active_history(app, client, database, monkeypatch):
    from backend.app.solver_adapter import run_solver
    monkeypatch.setattr(scheduling, "run_solver", run_solver)
    generated = client.post("/api/v1/jadwal/generate", json={}).get_json()["data"]
    diagnostics = generated["solver_diagnostics"]
    assert type(diagnostics["wall_time_ms"]) is int
    assert diagnostics["wall_time_ms"] >= 0
    assert diagnostics["verification"] == {"overall": "passed"}
    assert diagnostics["domain_candidates"] == [
        {"praktikum_id": 1, "slot_count": 2, "laboratory_count": 1,
         "theoretical_pairs": 2},
        {"praktikum_id": 2, "slot_count": 2, "laboratory_count": 1,
         "theoretical_pairs": 2},
    ]
    with sqlite3.connect(database) as db:
        preview_row = db.execute(
            "SELECT hasil_json,snapshot_json FROM preview_jadwal WHERE id=?",
            (generated["preview_id"],),
        ).fetchone()
    assert preview_row is not None
    stored_result = json.loads(preview_row[0])
    assert set(stored_result) == {
        "schema_version", "source_revision", "status", "assignments",
    }
    assert stored_result["schema_version"] == 1
    assert stored_result["source_revision"] == generated["source_revision"]
    assert stored_result["status"] == "success"
    assert stored_result["assignments"]
    assert "domain_candidates" not in stored_result
    assert "solver_diagnostics" not in stored_result
    stored_snapshot = json.loads(preview_row[1])
    assert stored_snapshot["schema_version"] == 1
    assert stored_snapshot["source_revision"] == generated["source_revision"]
    assert "domain_candidates" not in stored_snapshot
    assert "solver_diagnostics" not in stored_snapshot
    assert [
        (item["praktikum_id"], item["slot_id"], item["laboratorium_id"])
        for item in stored_snapshot["assignments"]
    ] == [
        (item["praktikum_id"], item["slot_waktu"]["id"], item["laboratorium"]["id"])
        for item in generated["assignments"]
    ]
    assert stored_result["assignments"] != stored_snapshot["assignments"]

    saved = client.post("/api/v1/jadwal/simpan", json={"preview_id": generated["preview_id"]})
    assert saved.status_code == 201
    assert "solver_diagnostics" not in saved.get_json()["data"]
    with sqlite3.connect(database) as db:
        persisted_result_after_save = db.execute(
            "SELECT hasil_json FROM preview_jadwal WHERE id=?",
            (generated["preview_id"],),
        ).fetchone()[0]
    assert json.loads(persisted_result_after_save) == stored_result
    assert client.get(ACTIVE).get_json()["data"] == saved.get_json()["data"]
    assert client.get(HISTORY).get_json()["data"][0]["id"] == saved.get_json()["data"]["id"]
    assert client.get(f"{HISTORY}/{saved.get_json()['data']['id']}").get_json()["data"]["assignments"] == generated["assignments"]
