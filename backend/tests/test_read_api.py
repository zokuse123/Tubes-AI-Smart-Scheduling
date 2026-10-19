"""Contract tests TASK 10B untuk Flask foundation dan dua belas Read API."""

import sqlite3
import sys
from importlib.metadata import version
from pathlib import Path

import pytest
from flask import request

from backend.app import create_app
from backend.app.db import get_db
from backend.db.init_db import init_db


@pytest.fixture()
def database(tmp_path: Path) -> Path:
    path = tmp_path / "api.sqlite3"
    init_db(str(path))
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(
        """
        INSERT INTO mata_praktikum (id,nama,is_active) VALUES
          (1,'Kecerdasan Buatan',1),(2,'Data 100% Praktis',1),(3,'Basis_Data',0);
        INSERT INTO kelompok (id,nama,jumlah_peserta,is_active) VALUES
          (1,'IF-3A',24,1),(2,'IF-3B',24,1),(3,'IF-3C',20,0);
        INSERT INTO asisten (id,nama,is_active) VALUES
          (1,'Rina',1),(2,'rina',1),(3,'Budi',0);
        INSERT INTO laboratorium (id,nama,kapasitas,is_active) VALUES
          (1,'Lab AI',30,1),(2,'Lab Data',30,1),(3,'Lab Lama',20,0);
        INSERT INTO slot_waktu (id,hari,jam_mulai,jam_selesai,is_active) VALUES
          (1,1,'08:00','10:00',1),(2,1,'10:00','12:00',1),(3,2,'08:00','10:00',0);
        INSERT INTO praktikum (id,mata_praktikum_id,kelompok_id,asisten_id,is_active) VALUES
          (1,1,1,1,1),(2,2,2,2,1),(3,3,3,3,0);
        """
    )
    connection.commit()
    connection.close()
    return path


@pytest.fixture()
def app(database: Path):
    return create_app({"TESTING": True, "DATABASE": str(database)})


@pytest.fixture()
def client(app):
    return app.test_client()


LIST_PATHS = (
    "/api/v1/mata-praktikum",
    "/api/v1/kelompok",
    "/api/v1/asisten",
    "/api/v1/laboratorium",
    "/api/v1/slot-waktu",
    "/api/v1/praktikum",
)


def test_application_factory_configuration(app, database):
    assert app.testing is True
    assert app.config["DATABASE"] == str(database)
    assert app.config["MAX_CONTENT_LENGTH"] == 256 * 1024
    assert {rule.rule for rule in app.url_map.iter_rules()} >= set(LIST_PATHS)


def test_default_factory_uses_development_configuration():
    development_app = create_app()
    assert development_app.debug is True
    assert development_app.testing is False


def test_python_314_and_dependency_versions():
    assert sys.version_info[:2] == (3, 14)
    assert tuple(map(int, version("Flask").split(".")[:2])) == (3, 1)
    assert tuple(map(int, version("Flask-CORS").split(".")[:2])) == (6, 0)


def test_connection_enables_foreign_keys_and_teardown(app):
    with app.app_context():
        connection = get_db()
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    with pytest.raises(sqlite3.ProgrammingError):
        connection.execute("SELECT 1")


def test_factory_does_not_create_or_migrate_database(tmp_path):
    missing = tmp_path / "must-not-be-created.sqlite3"
    isolated = create_app({"TESTING": True, "DATABASE": str(missing)})
    assert not missing.exists()
    response = isolated.test_client().get("/api/v1/kelompok")
    assert response.status_code == 500
    assert response.get_json()["error"]["code"] == "DATABASE_ERROR"
    assert not missing.exists()


@pytest.mark.parametrize("path", LIST_PATHS)
def test_six_list_endpoints(path, client):
    response = client.get(path)
    assert response.status_code == 200
    body = response.get_json()
    assert set(body) == {"data", "meta"}
    assert body["meta"] == {"page": 1, "page_size": 20, "total_items": 2, "total_pages": 1}
    assert all(row["is_active"] is True for row in body["data"])


@pytest.mark.parametrize("path", LIST_PATHS)
def test_six_detail_endpoints(path, client):
    response = client.get(f"{path}/1")
    assert response.status_code == 200
    assert response.get_json()["data"]["id"] == 1


def test_pagination_and_out_of_range_page(client):
    first = client.get("/api/v1/kelompok?page=1&page_size=1").get_json()
    assert [row["id"] for row in first["data"]] == [1]
    assert first["meta"] == {"page": 1, "page_size": 1, "total_items": 2, "total_pages": 2}
    empty = client.get("/api/v1/kelompok?page=9&page_size=1").get_json()
    assert empty["data"] == []
    assert empty["meta"]["total_items"] == 2


@pytest.mark.parametrize(("query", "ids"), (("true", [1, 2]), ("false", [3]), ("all", [1, 2, 3])))
def test_active_filter(client, query, ids):
    body = client.get(f"/api/v1/kelompok?is_active={query}").get_json()
    assert [row["id"] for row in body["data"]] == ids


def test_sorting_and_stable_tie_break(client):
    asc = client.get("/api/v1/asisten?sort_by=nama&sort_order=asc").get_json()["data"]
    desc = client.get("/api/v1/asisten?sort_by=nama&sort_order=desc").get_json()["data"]
    assert [row["id"] for row in asc] == [1, 2]
    assert [row["id"] for row in desc] == [2, 1]


def test_search_case_insensitive_contains(client):
    body = client.get("/api/v1/mata-praktikum?search=KECERDASAN").get_json()
    assert [row["id"] for row in body["data"]] == [1]


def test_search_uses_unicode_casefold(client, database):
    connection = sqlite3.connect(database)
    connection.execute("INSERT INTO asisten (id,nama) VALUES (10,'Élodie')")
    connection.commit()
    connection.close()
    body = client.get("/api/v1/asisten", query_string={"search": "élOD"}).get_json()
    assert [row["id"] for row in body["data"]] == [10]


@pytest.mark.parametrize(("search", "expected"), (("100%", [2]), ("Basis_Data", [3])))
def test_search_treats_wildcards_as_literals(client, search, expected):
    body = client.get("/api/v1/mata-praktikum", query_string={"search": search, "is_active": "all"}).get_json()
    assert [row["id"] for row in body["data"]] == expected


@pytest.mark.parametrize("query", ("page=0", "page_size=101", "sort_by=DROP TABLE", "sort_order=sideways", "is_active=1", "unknown=x", "page=1&page=2"))
def test_invalid_query_envelope(client, query):
    response = client.get(f"/api/v1/kelompok?{query}")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_QUERY"


def test_search_rejected_for_unsupported_resource_and_length(client):
    assert client.get("/api/v1/praktikum?search=x").status_code == 400
    assert client.get("/api/v1/asisten", query_string={"search": "x" * 101}).status_code == 400


@pytest.mark.parametrize("suffix", ("0", "999", "not-an-id"))
def test_invalid_or_missing_path_id(client, suffix):
    response = client.get(f"/api/v1/kelompok/{suffix}")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "RESOURCE_NOT_FOUND"


def test_nested_praktikum_shape(client):
    data = client.get("/api/v1/praktikum/1").get_json()["data"]
    assert data["mata_praktikum"] == {"id": 1, "nama": "Kecerdasan Buatan"}
    assert data["kelompok"] == {"id": 1, "nama": "IF-3A", "jumlah_peserta": 24}
    assert data["asisten"] == {"id": 1, "nama": "Rina"}
    assert set(data) == {"id", "mata_praktikum_id", "kelompok_id", "asisten_id", "is_active", "created_at", "updated_at", "mata_praktikum", "kelompok", "asisten"}


def test_read_api_does_not_increment_source_revision(client, database):
    before = sqlite3.connect(database).execute("SELECT value FROM system_metadata WHERE key='source_revision'").fetchone()[0]
    for path in LIST_PATHS:
        assert client.get(path).status_code == 200
    after = sqlite3.connect(database).execute("SELECT value FROM system_metadata WHERE key='source_revision'").fetchone()[0]
    assert before == after == 0


def test_database_error_is_sanitized(tmp_path):
    invalid = tmp_path / "invalid.sqlite3"
    invalid.touch()
    isolated = create_app({"TESTING": True, "DATABASE": str(invalid)})
    response = isolated.test_client().get("/api/v1/kelompok")
    body = response.get_json()
    assert response.status_code == 500
    assert body == {"error": {"code": "DATABASE_ERROR", "message": "Operasi database gagal.", "details": None}}
    assert "no such table" not in response.get_data(as_text=True).lower()


def test_json_error_handlers_and_payload_limit(database):
    isolated = create_app({"TESTING": True, "DATABASE": str(database)})

    @isolated.post("/_test/json")
    def parse_json_for_handler_test():
        request.get_json()
        return {"data": None}

    client = isolated.test_client()
    malformed = client.post("/_test/json", data="{", content_type="application/json")
    assert (malformed.status_code, malformed.get_json()["error"]["code"]) == (400, "INVALID_JSON")
    media = client.post("/_test/json", data="{}", content_type="text/plain")
    assert (media.status_code, media.get_json()["error"]["code"]) == (415, "UNSUPPORTED_MEDIA_TYPE")
    large = client.post("/_test/json", data="x" * (256 * 1024 + 1), content_type="application/json")
    assert (large.status_code, large.get_json()["error"]["code"]) == (413, "PAYLOAD_TOO_LARGE")


def test_cors_allows_configured_local_frontend(client):
    response = client.options("/api/v1/kelompok", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
