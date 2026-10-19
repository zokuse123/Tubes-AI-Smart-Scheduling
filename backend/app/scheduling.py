"""Generate scheduling previews through the validated SWI-Prolog adapter."""

import datetime as dt
import json
import sqlite3
import time
import uuid
from typing import Any, Mapping

from .errors import APIError
from .scheduling_dataset import SchedulingDataset, read_scheduling_dataset
from .solver_adapter import (
    SolverConfig,
    SolverExecution,
    run_solver,
    validate_solver_response,
)


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


def _elapsed_milliseconds(started_ns: int, finished_ns: int) -> int:
    """Convert monotonic nanoseconds to nearest nonnegative millisecond."""
    elapsed_ns = max(0, finished_ns - started_ns)
    return (elapsed_ns + 500_000) // 1_000_000


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _solver_diagnostics(
    result: dict[str, Any], wall_time_ms: int
) -> dict[str, Any]:
    expected_verification = {
        "success": "passed",
        "unsatisfiable": "not_applicable",
    }
    if (
        not isinstance(result, SolverExecution)
        or type(wall_time_ms) is not int
        or wall_time_ms < 0
        or not isinstance(result.get("status"), str)
        or result.get("status") not in expected_verification
        or result.verification_overall != expected_verification[result["status"]]
    ):
        raise APIError(
            "SOLVER_PROTOCOL_ERROR",
            "Mesin penjadwalan menghasilkan respons tidak valid.",
            502,
        )
    return {
        "wall_time_ms": wall_time_ms,
        "domain_candidates": [dict(item) for item in result.domain_candidates],
        "verification": {"overall": result.verification_overall},
    }


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
    solver_config = SolverConfig.from_mapping(config)
    solver_started_ns = time.monotonic_ns()
    try:
        solver_result = run_solver(dataset.solver_payload, solver_config)
    finally:
        solver_finished_ns = time.monotonic_ns()
        solver_wall_time_ms = _elapsed_milliseconds(
            solver_started_ns, solver_finished_ns
        )

    diagnostics = _solver_diagnostics(solver_result, solver_wall_time_ms)
    if solver_result["status"] == "unsatisfiable":
        return {
            "status": "unsatisfiable",
            "source_revision": dataset.source_revision,
            "message": "Tidak ditemukan jadwal yang memenuhi seluruh aturan.",
            "assignments": [],
            "solver_diagnostics": diagnostics,
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
        "solver_diagnostics": diagnostics,
    }


def validate_save_payload(payload: dict[str, Any]) -> str:
    for field in payload:
        if field != "preview_id":
            readonly = _GENERATE_READ_ONLY_FIELDS | {
                "updated_at", "is_active", "saved_at", "generated_at",
                "invalidated_at", "archived_at", "consumed_at", "terminal_at",
                "hasil_json", "snapshot_json",
            }
            code = "READ_ONLY_FIELD" if field in readonly else "UNKNOWN_FIELD"
            raise APIError(code, "Field tidak diizinkan.", 400, {"field": field})
    value = payload.get("preview_id")
    try:
        if not isinstance(value, str):
            raise ValueError
        parsed = uuid.UUID(value)
        if str(parsed) != value or parsed.variant != uuid.RFC_4122 or parsed.version not in range(1, 9):
            raise ValueError
    except ValueError:
        raise APIError("VALIDATION_ERROR", "preview_id harus UUID canonical yang valid.",
                       422, {"field": "preview_id"}) from None
    return value


def _strict_json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _reject_json_constant(_value):
    raise ValueError("invalid JSON constant")


_SOURCE_FIELDS = {
    "mata_praktikum": {"id", "nama"},
    "kelompok": {"id", "nama", "jumlah_peserta"},
    "asisten": {"id", "nama"},
    "laboratorium": {"id", "nama", "kapasitas"},
    "slot_waktu": {"id", "hari", "jam_mulai", "jam_selesai"},
    "praktikum": {"id", "mata_praktikum_id", "kelompok_id", "asisten_id"},
}


def _validate_source(snapshot: dict) -> None:
    for name, fields in _SOURCE_FIELDS.items():
        items = snapshot[name]
        if not isinstance(items, list) or not items:
            raise ValueError
        previous = 0
        for item in items:
            if not isinstance(item, dict) or set(item) != fields:
                raise ValueError
            for field, value in item.items():
                if field == "nama":
                    if not isinstance(value, str) or not value.strip():
                        raise ValueError
                elif field in ("jam_mulai", "jam_selesai"):
                    if not isinstance(value, str) or len(value) != 5:
                        raise ValueError
                    parsed = dt.datetime.strptime(value, "%H:%M")
                    if parsed.strftime("%H:%M") != value:
                        raise ValueError
                elif type(value) is not int or value <= 0:
                    raise ValueError
            if item["id"] <= previous:
                raise ValueError
            previous = item["id"]
            if name == "slot_waktu":
                start = dt.datetime.strptime(item["jam_mulai"], "%H:%M")
                end = dt.datetime.strptime(item["jam_selesai"], "%H:%M")
                if item["hari"] > 5 or end - start != dt.timedelta(minutes=120):
                    raise ValueError
    for item in snapshot["praktikum"]:
        for name in ("mata_praktikum", "kelompok", "asisten"):
            if item[name + "_id"] not in {row["id"] for row in snapshot[name]}:
                raise ValueError


def _validated_preview(preview: sqlite3.Row) -> tuple[dict, dict, list[dict]]:
    """Validate persisted representations; never replace labels from live masters.

    Availability is not persisted in the snapshot. The generate verifier and the
    transaction's revision guard retain that guarantee; this is an integrity
    check, not a new solver invocation or a fabricated availability projection.
    """
    try:
        result, snapshot = (
            json.loads(preview[field], object_pairs_hook=_strict_json_object,
                       parse_constant=_reject_json_constant)
            for field in ("hasil_json", "snapshot_json")
        )
        validate_solver_response(result, 0, preview["source_revision"])
        if result["status"] != "success":
            raise ValueError
        expected = set(_SOURCE_FIELDS) | {
            "schema_version", "source_revision", "generated_at", "saved_at", "assignments",
        }
        if not isinstance(snapshot, dict) or set(snapshot) != expected:
            raise ValueError
        if (type(snapshot["schema_version"]) is not int or snapshot["schema_version"] != 1
                or type(snapshot["source_revision"]) is not int
                or snapshot["source_revision"] != preview["source_revision"]
                or snapshot["saved_at"] is not None
                or snapshot["generated_at"] != preview["created_at"]):
            raise ValueError
        created = dt.datetime.strptime(preview["created_at"], "%Y-%m-%dT%H:%M:%S.%fZ")
        expires = dt.datetime.strptime(preview["expires_at"], "%Y-%m-%dT%H:%M:%S.%fZ")
        if expires - created != dt.timedelta(minutes=30):
            raise ValueError
        _validate_source(snapshot)
        if [a["praktikum_id"] for a in result["assignments"]] != [p["id"] for p in snapshot["praktikum"]]:
            raise ValueError
        dataset = SchedulingDataset({}, snapshot, preview["source_revision"])
        display, expected_assignments = _build_assignments(dataset, result["assignments"])
        # JSON comparison distinguishes booleans/floats from strict integers.
        if _canonical_json(expected_assignments) != _canonical_json(snapshot["assignments"]):
            raise ValueError
        return result, snapshot, display
    except (ValueError, TypeError, KeyError, APIError, RecursionError, OverflowError):
        raise sqlite3.IntegrityError("persisted preview integrity failure") from None


def _preview_error(state: str) -> APIError:
    code, message = {
        "missing": ("PREVIEW_NOT_FOUND", "Preview tidak ditemukan."),
        "consumed": ("PREVIEW_CONSUMED", "Preview sudah pernah disimpan."),
        "stale": ("STALE_PREVIEW", "Preview tidak lagi sesuai dengan data terkini."),
        "expired": ("PREVIEW_EXPIRED", "Preview telah kedaluwarsa."),
    }[state]
    return APIError(code, message, 404 if state == "missing" else 409)


def _transition_preview(db: sqlite3.Connection, preview_id: str, state: str, now: str) -> None:
    cursor = db.execute(
        """UPDATE preview_jadwal SET status=?,terminal_at=?,consumed_at=?
           WHERE id=? AND status='ready'""",
        (state, now, now if state == "consumed" else None, preview_id),
    )
    if cursor.rowcount != 1:
        raise sqlite3.IntegrityError("preview transition affected unexpected row count")


def save_schedule(db: sqlite3.Connection, preview_id: str) -> dict[str, Any]:
    """Consume a ready preview and create its immutable version atomically."""
    try:
        db.execute("BEGIN IMMEDIATE")
        preview = db.execute("SELECT * FROM preview_jadwal WHERE id=?", (preview_id,)).fetchone()
        if preview is None:
            raise _preview_error("missing")
        if preview["status"] in ("consumed", "stale", "expired"):
            raise _preview_error(preview["status"])
        if preview["status"] != "ready":
            raise sqlite3.IntegrityError("invalid preview state")
        # Sample time after acquiring the write lock, including any lock wait.
        now = _timestamp(_utc_now())
        terminal = None
        if now >= preview["expires_at"]:
            terminal = "expired"
        else:
            revision = db.execute("SELECT value FROM system_metadata WHERE key='source_revision'").fetchone()
            if revision is None or type(revision[0]) is not int or revision[0] < 0:
                raise sqlite3.IntegrityError("source revision seed invalid")
            if revision[0] != preview["source_revision"]:
                terminal = "stale"
        if terminal:
            _transition_preview(db, preview_id, terminal, now)
            db.commit()
            raise _preview_error(terminal)

        result, snapshot, display = _validated_preview(preview)
        snapshot["saved_at"] = now
        db.execute("UPDATE versi_jadwal SET status='archived',archived_at=? WHERE status='active'", (now,))
        cursor = db.execute(
            """INSERT INTO versi_jadwal(status,source_revision,created_at,snapshot_json)
               VALUES ('active',?,?,?)""",
            (preview["source_revision"], now, _canonical_json(snapshot)),
        )
        version_id = cursor.lastrowid
        db.executemany(
            """INSERT INTO detail_jadwal(versi_id,praktikum_id,slot_id,laboratorium_id)
               VALUES (?,?,?,?)""",
            [(version_id, a["praktikum_id"], a["slot_id"], a["laboratorium_id"])
             for a in result["assignments"]],
        )
        _transition_preview(db, preview_id, "consumed", now)
        response = {
            "id": version_id, "status": "active", "source_revision": preview["source_revision"],
            "created_at": now, "invalidated_at": None, "archived_at": None,
            "summary": {"total_praktikum": len(snapshot["praktikum"]), "total_assignment": len(display)},
            "assignments": display,
        }
        db.commit()
        return response
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise


def _canonical_timestamp(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        return False
    return parsed.strftime("%Y-%m-%dT%H:%M:%S.%f")[:23] + "Z" == value


def _validated_version(version: sqlite3.Row, detail_rows: list[sqlite3.Row]) -> tuple[dict, list[dict]]:
    """Read and cross-check an immutable schedule snapshot against detail indexes."""
    try:
        snapshot = json.loads(
            version["snapshot_json"],
            object_pairs_hook=_strict_json_object,
            parse_constant=_reject_json_constant,
        )
        expected_fields = set(_SOURCE_FIELDS) | {
            "schema_version", "source_revision", "generated_at", "saved_at", "assignments",
        }
        if not isinstance(snapshot, dict) or set(snapshot) != expected_fields:
            raise ValueError
        if (type(snapshot["schema_version"]) is not int or snapshot["schema_version"] != 1
                or type(snapshot["source_revision"]) is not int
                or snapshot["source_revision"] != version["source_revision"]
                or not _canonical_timestamp(snapshot["generated_at"])
                or not _canonical_timestamp(snapshot["saved_at"])
                or snapshot["saved_at"] != version["created_at"]
                or not _canonical_timestamp(version["created_at"])):
            raise ValueError
        if version["status"] not in ("active", "invalid", "archived"):
            raise ValueError
        invalidated, archived = version["invalidated_at"], version["archived_at"]
        if version["status"] == "active":
            if invalidated is not None or archived is not None:
                raise ValueError
        elif version["status"] == "invalid":
            if not _canonical_timestamp(invalidated) or archived is not None:
                raise ValueError
        elif not _canonical_timestamp(archived) or invalidated is not None:
            raise ValueError
        _validate_source(snapshot)
        flat = snapshot["assignments"]
        if not isinstance(flat, list):
            raise ValueError
        result_assignments = []
        for item in flat:
            if not isinstance(item, dict) or set(item) != {
                "praktikum_id", "slot_id", "laboratorium_id", "mata_praktikum_nama",
                "kelompok_nama", "jumlah_peserta", "asisten_nama", "laboratorium_nama",
                "laboratorium_kapasitas", "hari", "jam_mulai", "jam_selesai",
            }:
                raise ValueError
            for key in ("praktikum_id", "slot_id", "laboratorium_id", "jumlah_peserta",
                        "laboratorium_kapasitas", "hari"):
                if type(item[key]) is not int or item[key] <= 0:
                    raise ValueError
            for key in ("mata_praktikum_nama", "kelompok_nama", "asisten_nama", "laboratorium_nama"):
                if not isinstance(item[key], str) or not item[key].strip():
                    raise ValueError
            result_assignments.append({
                "praktikum_id": item["praktikum_id"],
                "slot_id": item["slot_id"],
                "laboratorium_id": item["laboratorium_id"],
            })
        if [item["praktikum_id"] for item in flat] != sorted(
            item["id"] for item in snapshot["praktikum"]
        ):
            raise ValueError
        dataset = SchedulingDataset({}, snapshot, version["source_revision"])
        display, expected_flat = _build_assignments(dataset, result_assignments)
        if _canonical_json(expected_flat) != _canonical_json(flat):
            raise ValueError
        detail_tuples = [(row["praktikum_id"], row["slot_id"], row["laboratorium_id"])
                         for row in detail_rows]
        expected_tuples = [(row["praktikum_id"], row["slot_id"], row["laboratorium_id"])
                           for row in result_assignments]
        if detail_tuples != expected_tuples:
            raise ValueError
        return snapshot, display
    except (ValueError, TypeError, KeyError, APIError, RecursionError, OverflowError):
        raise sqlite3.IntegrityError("persisted schedule integrity failure") from None


def _schedule_response(version: sqlite3.Row, detail_rows: list[sqlite3.Row]) -> dict[str, Any]:
    snapshot, assignments = _validated_version(version, detail_rows)
    count = len(assignments)
    return {
        "id": version["id"], "status": version["status"],
        "source_revision": version["source_revision"], "created_at": version["created_at"],
        "invalidated_at": version["invalidated_at"], "archived_at": version["archived_at"],
        "summary": {"total_praktikum": count, "total_assignment": count},
        "assignments": assignments,
    }


def _version_details(db: sqlite3.Connection, version_id: int) -> list[sqlite3.Row]:
    return db.execute(
        """SELECT praktikum_id,slot_id,laboratorium_id FROM detail_jadwal
           WHERE versi_id=? ORDER BY praktikum_id""",
        (version_id,),
    ).fetchall()


def read_active_schedule(db: sqlite3.Connection) -> dict[str, Any] | None:
    try:
        db.execute("BEGIN")
        version = db.execute(
            """SELECT id,status,source_revision,created_at,invalidated_at,archived_at,snapshot_json
               FROM versi_jadwal WHERE status='active'"""
        ).fetchone()
        if version is None:
            db.commit()
            return None
        response = _schedule_response(version, _version_details(db, version["id"]))
        db.commit()
        return response
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise


def _read_version(db: sqlite3.Connection, version_id: int) -> dict[str, Any]:
    try:
        db.execute("BEGIN")
        version = db.execute(
            """SELECT id,status,source_revision,created_at,invalidated_at,archived_at,snapshot_json
               FROM versi_jadwal WHERE id=?""",
            (version_id,),
        ).fetchone()
        if version is None:
            db.commit()
            raise APIError("RESOURCE_NOT_FOUND", "Resource tidak ditemukan.", 404)
        response = _schedule_response(version, _version_details(db, version_id))
        response["snapshot"] = {
            "schema_version": 1,
            "source_revision": version["source_revision"],
            "generated_at": json.loads(version["snapshot_json"])["generated_at"],
            "saved_at": json.loads(version["snapshot_json"])["saved_at"],
        }
        db.commit()
        return response
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise


def read_schedule_history(
    db: sqlite3.Connection,
    *,
    page: int,
    page_size: int,
    sort_by: str,
    sort_order: str,
    status: str,
) -> dict[str, Any]:
    direction = sort_order.upper()
    where = "" if status == "all" else " WHERE status=?"
    params: tuple[Any, ...] = () if status == "all" else (status,)
    order = f"created_at {direction},id {direction}" if sort_by == "created_at" else f"id {direction}"
    try:
        db.execute("BEGIN")
        total = db.execute(f"SELECT COUNT(*) FROM versi_jadwal{where}", params).fetchone()[0]
        versions = db.execute(
            f"""SELECT id,status,source_revision,created_at,invalidated_at,archived_at,snapshot_json
                FROM versi_jadwal{where} ORDER BY {order} LIMIT ? OFFSET ?""",
            (*params, page_size, (page - 1) * page_size),
        ).fetchall()
        details_by_version: dict[int, list[sqlite3.Row]] = {v["id"]: [] for v in versions}
        if versions:
            ids = tuple(details_by_version)
            placeholders = ",".join("?" for _ in ids)
            detail_rows = db.execute(
                f"""SELECT versi_id,praktikum_id,slot_id,laboratorium_id FROM detail_jadwal
                    WHERE versi_id IN ({placeholders}) ORDER BY versi_id,praktikum_id""",
                ids,
            ).fetchall()
            for row in detail_rows:
                details_by_version[row["versi_id"]].append(row)
        items = []
        for version in versions:
            snapshot, _ = _validated_version(version, details_by_version[version["id"]])
            count = len(snapshot["assignments"])
            items.append({
                "id": version["id"], "status": version["status"],
                "source_revision": version["source_revision"], "created_at": version["created_at"],
                "invalidated_at": version["invalidated_at"], "archived_at": version["archived_at"],
                "summary": {"total_praktikum": count, "total_assignment": count},
            })
        db.commit()
        return {
            "data": items,
            "meta": {
                "page": page, "page_size": page_size, "total_items": total,
                "total_pages": (total + page_size - 1) // page_size,
            },
        }
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise
