"""Tests for the consistent SQLite scheduling projection."""

import sqlite3
from pathlib import Path

import pytest

from backend.app.errors import APIError
from backend.app.scheduling_dataset import read_scheduling_dataset
from backend.db.init_db import init_db


@pytest.fixture()
def database(tmp_path: Path) -> Path:
    path = tmp_path / "dataset.sqlite3"
    init_db(str(path))
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(
            """
            INSERT INTO mata_praktikum(id,nama,is_active) VALUES (2,'Data',1),(1,'AI',1),(3,'Old',0);
            INSERT INTO kelompok(id,nama,jumlah_peserta,is_active) VALUES (2,'B',30,1),(1,'A',20,1),(3,'Old',10,0);
            INSERT INTO asisten(id,nama,is_active) VALUES (2,'Budi',1),(1,'Ani',1),(3,'Old',0);
            INSERT INTO laboratorium(id,nama,kapasitas,is_active) VALUES (2,'Lab B',10,1),(1,'Lab A',25,1),(3,'Old',99,0);
            INSERT INTO slot_waktu(id,hari,jam_mulai,jam_selesai,is_active)
              VALUES (2,1,'10:00','12:00',1),(1,1,'08:00','10:00',1),(3,2,'08:00','10:00',0);
            INSERT INTO praktikum(id,mata_praktikum_id,kelompok_id,asisten_id,is_active)
              VALUES (2,2,2,2,1),(1,1,1,1,1),(3,3,3,3,0);
            INSERT INTO ketersediaan_kelompok(kelompok_id,slot_id) VALUES (2,2),(1,2),(1,1),(3,3);
            INSERT INTO ketersediaan_asisten(asisten_id,slot_id) VALUES (2,2),(1,2),(1,1),(3,3);
            UPDATE system_metadata SET value=7 WHERE key='source_revision';
            """
        )
    return path


def connect(path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


def test_valid_dataset_has_exact_schema_canonical_order_and_snapshot(database):
    with connect(database) as db:
        result = read_scheduling_dataset(db)
    assert result.source_revision == 7
    assert list(result.solver_payload) == [
        "schema_version", "source_revision", "mata_praktikum", "kelompok", "asisten",
        "laboratorium", "slot_waktu", "praktikum", "ketersediaan_kelompok",
        "ketersediaan_asisten",
    ]
    assert [item["id"] for item in result.solver_payload["praktikum"]] == [1, 2]
    assert result.solver_payload["mata_praktikum"] == [{"id": 1}, {"id": 2}]
    assert result.solver_payload["ketersediaan_kelompok"] == [
        {"kelompok_id": 1, "slot_id": 1}, {"kelompok_id": 1, "slot_id": 2},
        {"kelompok_id": 2, "slot_id": 2},
    ]
    assert result.source_snapshot["mata_praktikum"][0] == {"id": 1, "nama": "AI"}
    assert "nama" not in result.solver_payload["kelompok"][0]
    result.solver_payload["slot_waktu"][0]["hari"] = 5
    assert result.source_snapshot["slot_waktu"][0]["hari"] == 1


def test_reader_uses_explicit_transaction_and_closes_it(database):
    with connect(database) as db:
        statements = []
        db.set_trace_callback(statements.append)
        read_scheduling_dataset(db)
        assert not db.in_transaction
    assert statements[0] == "BEGIN"
    assert statements[-1] == "COMMIT"


@pytest.mark.parametrize("delete_sql", (
    "UPDATE praktikum SET is_active=0",
    "UPDATE laboratorium SET is_active=0",
    "UPDATE slot_waktu SET is_active=0",
))
def test_incomplete_dataset_is_not_ready_and_rolls_back(database, delete_sql):
    with connect(database) as db:
        db.execute(delete_sql)
        db.commit()
        with pytest.raises(APIError) as caught:
            read_scheduling_dataset(db)
        assert caught.value.code == "DATA_NOT_READY"
        assert not db.in_transaction


@pytest.mark.parametrize("table,entity_id", (("mata_praktikum",1),("kelompok",1),("asisten",1)))
def test_active_praktikum_cannot_reference_inactive_master(database, table, entity_id):
    with connect(database) as db:
        db.execute(f"UPDATE {table} SET is_active=0 WHERE id=?", (entity_id,))
        db.commit()
        with pytest.raises(APIError) as caught:
            read_scheduling_dataset(db)
        assert caught.value.code == "DATA_NOT_READY"


def test_empty_availability_is_valid_and_inactive_pairs_are_filtered(database):
    with connect(database) as db:
        db.execute("DELETE FROM ketersediaan_kelompok WHERE kelompok_id IN (1,2)")
        db.commit()
        result = read_scheduling_dataset(db)
    assert result.solver_payload["ketersediaan_kelompok"] == []
    assert {item["slot_id"] for item in result.solver_payload["ketersediaan_asisten"]} == {1, 2}


def test_insufficient_capacity_remains_solver_input(database):
    with connect(database) as db:
        db.execute("UPDATE laboratorium SET kapasitas=1 WHERE is_active=1")
        db.commit()
        result = read_scheduling_dataset(db)
    assert [lab["kapasitas"] for lab in result.solver_payload["laboratorium"]] == [1, 1]


def test_invalid_revision_is_not_ready(database):
    with connect(database) as db:
        db.execute("DELETE FROM system_metadata WHERE key='source_revision'")
        db.commit()
        with pytest.raises(APIError) as caught:
            read_scheduling_dataset(db)
        assert caught.value.code == "DATA_NOT_READY"
