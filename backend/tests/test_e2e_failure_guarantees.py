"""F11-D: real solver previews, controlled UTC boundary, and WAL reader atomicity."""

import datetime as dt
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.app import scheduling
from backend.app.solver_adapter import run_solver
from backend.tests.test_schedule_save import app, client, database, generate, save, state

pytestmark = pytest.mark.skipif(shutil.which("swipl") is None, reason="real SWI-Prolog required")


@pytest.fixture()
def real_preview(client, monkeypatch):
    # Reuse isolated SQLite/app fixtures but explicitly remove their solver stub.
    monkeypatch.setattr(scheduling, "run_solver", run_solver)
    result = generate(client)
    assert result["status"] == "success"
    assert result["solver_diagnostics"]["verification"] == {"overall": "passed"}
    return result


@pytest.mark.parametrize("milliseconds,status", [(-1, 201), (0, 409)])
def test_real_preview_exact_backend_expiry_boundary(client, real_preview, database, monkeypatch, milliseconds, status):
    expires = dt.datetime.fromisoformat(real_preview["expires_at"].replace("Z", "+00:00"))
    monkeypatch.setattr(scheduling, "_utc_now", lambda: expires + dt.timedelta(milliseconds=milliseconds))
    before = state(database)
    response = save(client, real_preview)
    assert response.status_code == status
    after = state(database)
    if status == 409:
        assert response.get_json()["error"]["code"] == "PREVIEW_EXPIRED"
        assert after["preview_jadwal"][0]["status"] == "expired"
        assert after["preview_jadwal"][0]["terminal_at"] == real_preview["expires_at"]
        assert after["preview_jadwal"][0]["hasil_json"] == before["preview_jadwal"][0]["hasil_json"]
        assert after["preview_jadwal"][0]["snapshot_json"] == before["preview_jadwal"][0]["snapshot_json"]
        assert after["versi_jadwal"] == after["detail_jadwal"] == []
        assert save(client, real_preview).get_json()["error"]["code"] == "PREVIEW_EXPIRED"
    else:
        assert len(after["versi_jadwal"]) == 1
        assert len(after["detail_jadwal"]) == 2
        assert after["preview_jadwal"][0]["status"] == "consumed"


def test_readers_see_committed_version_while_replacement_transaction_is_held(app, client, real_preview, database, monkeypatch):
    first = save(client, real_preview).get_json()["data"]
    second = generate(client)  # run_solver remains real within this test.
    entered, release = threading.Event(), threading.Event()
    original = scheduling._transition_preview

    def hold_after_insert(*args):
        original(*args)
        # Version, details, archive, consumption exist ONLY in this uncommitted writer.
        entered.set()
        assert release.wait(8)

    monkeypatch.setattr(scheduling, "_transition_preview", hold_after_insert)

    def writer():
        with app.test_client() as separate_client:
            return save(separate_client, second)

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(writer)
        try:
            assert entered.wait(5)
            active = client.get("/api/v1/jadwal/aktif").get_json()["data"]
            history = client.get("/api/v1/jadwal/riwayat").get_json()
            assert active == first
            assert history["meta"]["total_items"] == 1
            assert [(row["id"], row["status"]) for row in history["data"]] == [(first["id"], "active")]
            visible = state(database)
            assert len(visible["versi_jadwal"]) == 1
            assert len(visible["detail_jadwal"]) == 2
        finally:
            release.set()
        response = future.result(timeout=6)
    assert response.status_code == 201
    final = state(database)
    assert [row["status"] for row in final["versi_jadwal"]] == ["archived", "active"]
    assert len(final["detail_jadwal"]) == 4
    assert all(row["status"] == "consumed" for row in final["preview_jadwal"])
    assert client.get("/api/v1/jadwal/aktif").get_json()["data"]["id"] == response.get_json()["data"]["id"]
