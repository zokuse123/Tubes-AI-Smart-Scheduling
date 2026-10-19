"""Health contract tests for GET /api/v1/health."""

import datetime as dt
import importlib
import re
import shutil
import sqlite3
from pathlib import Path

import pytest

from backend.app import create_app
from backend.app.db import get_db
from backend.db.init_db import init_db


@pytest.fixture()
def database(tmp_path: Path) -> Path:
    path = tmp_path / "health.sqlite3"
    init_db(str(path))
    return path


@pytest.fixture()
def app(database: Path):
    return create_app({"TESTING": True, "DATABASE": str(database)})


@pytest.fixture()
def client(app):
    return app.test_client()


def api_state(path: Path) -> tuple[int, int, int, int]:
    with sqlite3.connect(path) as db:
        revision = db.execute(
            "SELECT value FROM system_metadata WHERE key='source_revision'"
        ).fetchone()[0]
        counts = [db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                  for table in ("preview_jadwal", "versi_jadwal", "detail_jadwal")]
    return revision, *counts


def assert_health(response, *, status_code: int, status: str,
                  database: str, solver: str) -> dict:
    assert response.status_code == status_code
    body = response.get_json()
    assert set(body) == {"data"}
    data = body["data"]
    assert set(data) == {"status", "components", "checked_at"}
    assert data["status"] == status
    assert data["components"] == {
        "backend": "available", "database": database, "solver": solver,
    }
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", data["checked_at"])
    dt.datetime.strptime(data["checked_at"], "%Y-%m-%dT%H:%M:%S.%fZ")
    return data


def test_healthy_contract_is_read_only_and_does_not_invoke_solver(
    client, app, database, monkeypatch,
):
    api = importlib.import_module("backend.app.api")

    monkeypatch.setattr(api, "solver_available", lambda _config: True)
    monkeypatch.setattr(api, "generate_schedule", lambda *_args: pytest.fail("health ran scheduler"))
    before = api_state(database)
    response = client.get("/api/v1/health")
    assert_health(response, status_code=200, status="healthy",
                  database="available", solver="available")
    assert api_state(database) == before
    with app.app_context():
        assert not get_db().in_transaction


def test_database_unavailable_returns_degraded_without_leaking_path(tmp_path, monkeypatch):
    api = importlib.import_module("backend.app.api")

    missing_path = tmp_path / "private" / "missing.sqlite3"
    app = create_app({"TESTING": True, "DATABASE": str(missing_path)})
    monkeypatch.setattr(api, "solver_available", lambda _config: True)
    response = app.test_client().get("/api/v1/health")
    assert_health(response, status_code=503, status="degraded",
                  database="unavailable", solver="available")
    assert str(missing_path) not in response.get_data(as_text=True)
    assert "Traceback" not in response.get_data(as_text=True)


def test_solver_unavailable_returns_degraded_without_leaking_configuration(
    client, app, database, monkeypatch,
):
    api = importlib.import_module("backend.app.api")

    monkeypatch.setattr(api, "solver_available", lambda _config: False)
    before = api_state(database)
    response = client.get("/api/v1/health")
    assert_health(response, status_code=503, status="degraded",
                  database="available", solver="unavailable")
    text = response.get_data(as_text=True)
    assert str(database) not in text
    assert app.config["SOLVER_CLI_PATH"] not in text
    assert "Traceback" not in text
    assert api_state(database) == before


def test_solver_availability_is_a_non_launching_configured_path_check(tmp_path, monkeypatch):
    from backend.app import solver_adapter

    cli = tmp_path / "solver_cli.pl"
    cli.write_text("% fixture", encoding="utf-8")
    calls = []
    monkeypatch.setattr(solver_adapter, "_resolve_executable",
                        lambda executable: calls.append(executable) or "resolved-swipl")
    assert solver_adapter.solver_available({
        "SWIPL_EXECUTABLE": "configured-swipl", "SOLVER_CLI_PATH": str(cli),
    }) is True
    assert calls == ["configured-swipl"]
    assert solver_adapter.solver_available({
        "SWIPL_EXECUTABLE": "configured-swipl",
        "SOLVER_CLI_PATH": str(tmp_path / "missing.pl"),
    }) is False


@pytest.mark.skipif(shutil.which("swipl") is None, reason="SWI-Prolog unavailable")
def test_real_local_swipl_health_check(client):
    response = client.get("/api/v1/health")
    assert_health(response, status_code=200, status="healthy",
                  database="available", solver="available")


def test_sqlite_failure_is_degraded_not_database_error(client, monkeypatch):
    api = importlib.import_module("backend.app.api")

    monkeypatch.setattr(api, "solver_available", lambda _config: False)

    def fail_database():
        raise sqlite3.OperationalError("private database location unavailable")

    monkeypatch.setattr(api, "get_db", fail_database)
    response = client.get("/api/v1/health")
    assert_health(response, status_code=503, status="degraded",
                  database="unavailable", solver="unavailable")
    text = response.get_data(as_text=True)
    assert "private database location" not in text
    assert "Traceback" not in text
