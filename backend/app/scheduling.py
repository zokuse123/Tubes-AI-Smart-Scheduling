"""Generate scheduling previews through the validated SWI-Prolog adapter."""

import datetime as dt
import json
import sqlite3
import uuid
from typing import Any, Mapping

from .errors import APIError
from .scheduling_dataset import SchedulingDataset, read_scheduling_dataset
from .solver_adapter import SolverConfig, run_solver, validate_solver_response


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
