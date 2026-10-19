"""Pembacaan snapshot SQLite konsisten untuk integrasi solver."""

import sqlite3
from dataclasses import dataclass
from typing import Any

from .errors import APIError


@dataclass(frozen=True)
class SchedulingDataset:
    solver_payload: dict[str, Any]
    source_snapshot: dict[str, Any]
    source_revision: int


def _rows(db: sqlite3.Connection, sql: str) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(sql).fetchall()]


def _not_ready(message: str) -> APIError:
    return APIError("DATA_NOT_READY", message, 409)


def read_scheduling_dataset(db: sqlite3.Connection) -> SchedulingDataset:
    """Read solver projection and display source in one explicit transaction."""
    try:
        db.execute("BEGIN")
        metadata = db.execute(
            "SELECT value FROM system_metadata WHERE key='source_revision'"
        ).fetchone()
        if metadata is None or isinstance(metadata[0], bool) or not isinstance(metadata[0], int) or metadata[0] < 0:
            raise _not_ready("Metadata revisi data tidak valid.")
        revision = metadata[0]

        mata = _rows(db, "SELECT id,nama FROM mata_praktikum WHERE is_active=1 ORDER BY id")
        kelompok = _rows(db, "SELECT id,nama,jumlah_peserta FROM kelompok WHERE is_active=1 ORDER BY id")
        asisten = _rows(db, "SELECT id,nama FROM asisten WHERE is_active=1 ORDER BY id")
        laboratorium = _rows(db, "SELECT id,nama,kapasitas FROM laboratorium WHERE is_active=1 ORDER BY id")
        slots = _rows(
            db,
            "SELECT id,hari,jam_mulai,jam_selesai FROM slot_waktu WHERE is_active=1 ORDER BY id",
        )
        praktikum = _rows(
            db,
            """SELECT id,mata_praktikum_id,kelompok_id,asisten_id
               FROM praktikum WHERE is_active=1 ORDER BY id""",
        )

        if not praktikum:
            raise _not_ready("Belum ada kegiatan praktikum aktif untuk dijadwalkan.")
        if not laboratorium:
            raise _not_ready("Tidak ada laboratorium aktif.")
        if not slots:
            raise _not_ready("Tidak ada slot waktu aktif.")

        active_ids = {
            "mata_praktikum_id": {item["id"] for item in mata},
            "kelompok_id": {item["id"] for item in kelompok},
            "asisten_id": {item["id"] for item in asisten},
        }
        for item in praktikum:
            if any(item[field] not in ids for field, ids in active_ids.items()):
                raise _not_ready("Kegiatan aktif masih merujuk data master nonaktif.")

        availability_kelompok = _rows(
            db,
            """SELECT kk.kelompok_id,kk.slot_id
               FROM ketersediaan_kelompok kk
               JOIN kelompok k ON k.id=kk.kelompok_id AND k.is_active=1
               JOIN slot_waktu s ON s.id=kk.slot_id AND s.is_active=1
               ORDER BY kk.kelompok_id,kk.slot_id""",
        )
        availability_asisten = _rows(
            db,
            """SELECT ka.asisten_id,ka.slot_id
               FROM ketersediaan_asisten ka
               JOIN asisten a ON a.id=ka.asisten_id AND a.is_active=1
               JOIN slot_waktu s ON s.id=ka.slot_id AND s.is_active=1
               ORDER BY ka.asisten_id,ka.slot_id""",
        )

        solver_payload = {
            "schema_version": 1,
            "source_revision": revision,
            "mata_praktikum": [{"id": item["id"]} for item in mata],
            "kelompok": [
                {"id": item["id"], "jumlah_peserta": item["jumlah_peserta"]}
                for item in kelompok
            ],
            "asisten": [{"id": item["id"]} for item in asisten],
            "laboratorium": [
                {"id": item["id"], "kapasitas": item["kapasitas"]}
                for item in laboratorium
            ],
            "slot_waktu": slots,
            "praktikum": praktikum,
            "ketersediaan_kelompok": availability_kelompok,
            "ketersediaan_asisten": availability_asisten,
        }
        source_snapshot = {
            "schema_version": 1,
            "source_revision": revision,
            "mata_praktikum": [dict(item) for item in mata],
            "kelompok": [dict(item) for item in kelompok],
            "asisten": [dict(item) for item in asisten],
            "laboratorium": [dict(item) for item in laboratorium],
            "slot_waktu": [dict(item) for item in slots],
            "praktikum": [dict(item) for item in praktikum],
        }
        result = SchedulingDataset(solver_payload, source_snapshot, revision)
        db.commit()
        return result
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise
