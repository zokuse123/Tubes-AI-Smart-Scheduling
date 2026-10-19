"""Generate scheduling previews through the validated SWI-Prolog adapter."""

import datetime as dt
import json
import sqlite3
import uuid
from typing import Any, Mapping

from .errors import APIError
from .scheduling_dataset import SchedulingDataset, read_scheduling_dataset
from .solver_adapter import SolverConfig, run_solver


_GENERATE_READ_ONLY_FIELDS = frozenset(
    (
        "id",
        "preview_id",
        "preview_status",
        "schema_version",
        "source_revision",
        "status",
        "summary",
        "assignments",
        "snapshot",
        "created_at",
        "expires_at",
    )
)


def validate_generate_payload(payload: dict[str, Any]) -> None:
    """Generate accepts exactly one empty JSON object."""
    if not payload:
        return
    field = next(iter(payload))
    if field in _GENERATE_READ_ONLY_FIELDS:
        raise APIError("READ_ONLY_FIELD", "Field bersifat read-only.", 400, {"field": field})
    raise APIError("UNKNOWN_FIELD", "Field tidak dikenal.", 400, {"field": field})


def _timestamp(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:23] + "Z"


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _by_id(items: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    return {item["id"]: item for item in items}


def _build_assignments(
    dataset: SchedulingDataset,
    solver_assignments: list[dict[str, int]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    source = dataset.source_snapshot
    praktikum = _by_id(source["praktikum"])
    mata = _by_id(source["mata_praktikum"])
    kelompok = _by_id(source["kelompok"])
    asisten = _by_id(source["asisten"])
    slots = _by_id(source["slot_waktu"])
    labs = _by_id(source["laboratorium"])
    display: list[dict[str, Any]] = []
    snapshot: list[dict[str, Any]] = []

    try:
        for assignment in sorted(solver_assignments, key=lambda item: item["praktikum_id"]):
            activity = praktikum[assignment["praktikum_id"]]
            subject = mata[activity["mata_praktikum_id"]]
            group = kelompok[activity["kelompok_id"]]
            assistant = asisten[activity["asisten_id"]]
            slot = slots[assignment["slot_id"]]
            lab = labs[assignment["laboratorium_id"]]
            display.append(
                {
                    "praktikum_id": activity["id"],
                    "mata_praktikum": {"id": subject["id"], "nama": subject["nama"]},
                    "kelompok": {
                        "id": group["id"],
                        "nama": group["nama"],
                        "jumlah_peserta": group["jumlah_peserta"],
                    },
                    "asisten": {"id": assistant["id"], "nama": assistant["nama"]},
                    "slot_waktu": {
                        "id": slot["id"],
                        "hari": slot["hari"],
                        "jam_mulai": slot["jam_mulai"],
                        "jam_selesai": slot["jam_selesai"],
                    },
                    "laboratorium": {
                        "id": lab["id"],
                        "nama": lab["nama"],
                        "kapasitas": lab["kapasitas"],
                    },
                }
            )
            snapshot.append(
                {
                    "praktikum_id": activity["id"],
                    "slot_id": slot["id"],
                    "laboratorium_id": lab["id"],
                    "mata_praktikum_nama": subject["nama"],
                    "kelompok_nama": group["nama"],
                    "jumlah_peserta": group["jumlah_peserta"],
                    "asisten_nama": assistant["nama"],
                    "laboratorium_nama": lab["nama"],
                    "laboratorium_kapasitas": lab["kapasitas"],
                    "hari": slot["hari"],
                    "jam_mulai": slot["jam_mulai"],
                    "jam_selesai": slot["jam_selesai"],
                }
            )
    except (KeyError, TypeError):
        raise APIError(
            "SOLVER_PROTOCOL_ERROR",
            "Mesin penjadwalan menghasilkan respons tidak valid.",
            502,
        ) from None
    return display, snapshot


def _provisional_snapshot(
    dataset: SchedulingDataset,
    assignments: list[dict[str, Any]],
    generated_at: str,
) -> dict[str, Any]:
    source = dataset.source_snapshot
    return {
        "schema_version": 1,
        "source_revision": dataset.source_revision,
        "generated_at": generated_at,
        "saved_at": None,
        "mata_praktikum": source["mata_praktikum"],
        "kelompok": source["kelompok"],
        "asisten": source["asisten"],
        "laboratorium": source["laboratorium"],
        "slot_waktu": source["slot_waktu"],
        "praktikum": source["praktikum"],
        "assignments": assignments,
    }


def _persist_preview(
    db: sqlite3.Connection,
    dataset: SchedulingDataset,
    solver_result: dict[str, Any],
    snapshot: dict[str, Any],
    preview_id: str,
    created_at: str,
    expires_at: str,
) -> None:
    try:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT value FROM system_metadata WHERE key='source_revision'"
        ).fetchone()
        if row is None or isinstance(row[0], bool) or not isinstance(row[0], int) or row[0] < 0:
            raise sqlite3.IntegrityError("source revision seed invalid")
        if row[0] != dataset.source_revision:
            db.rollback()
            raise APIError(
                "STALE_GENERATION",
                "Data berubah selama generate. Silakan generate ulang.",
                409,
            )
        db.execute(
            """INSERT INTO preview_jadwal
               (id,source_revision,hasil_json,snapshot_json,created_at,expires_at,status)
               VALUES (?,?,?,?,?,?,'ready')""",
            (
                preview_id,
                dataset.source_revision,
                _canonical_json(solver_result),
                _canonical_json(snapshot),
                created_at,
                expires_at,
            ),
        )
        db.commit()
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise


def generate_schedule(
    db: sqlite3.Connection,
    config: Mapping[str, Any],
) -> dict[str, Any]:
    dataset = read_scheduling_dataset(db)
    solver_result = run_solver(dataset.solver_payload, SolverConfig.from_mapping(config))
    if solver_result["status"] == "unsatisfiable":
        return {
            "status": "unsatisfiable",
            "message": "Tidak ditemukan jadwal yang memenuhi seluruh aturan.",
            "assignments": [],
        }

    display_assignments, snapshot_assignments = _build_assignments(
        dataset, solver_result["assignments"]
    )
    generated = _utc_now()
    created_at = _timestamp(generated)
    expires_at = _timestamp(generated + dt.timedelta(minutes=30))
    preview_id = str(uuid.uuid4())
    snapshot = _provisional_snapshot(dataset, snapshot_assignments, created_at)
    _persist_preview(
        db,
        dataset,
        solver_result,
        snapshot,
        preview_id,
        created_at,
        expires_at,
    )
    return {
        "status": "success",
        "preview_id": preview_id,
        "preview_status": "ready",
        "source_revision": dataset.source_revision,
        "created_at": created_at,
        "expires_at": expires_at,
        "summary": {
            "total_praktikum": len(dataset.source_snapshot["praktikum"]),
            "total_assignment": len(display_assignments),
        },
        "assignments": display_assignments,
    }
