"""Mutation engine transaksional untuk empat master resource TASK 10C."""

import datetime as dt
import sqlite3
from dataclasses import dataclass
from typing import Any

from .errors import APIError


@dataclass(frozen=True)
class MutationSpec:
    table: str
    writable: frozenset[str]
    positive_integer_fields: frozenset[str] = frozenset()
    unique_name: bool = False


SPECS = {
    "mata_praktikum": MutationSpec("mata_praktikum", frozenset(("nama",)), unique_name=True),
    "kelompok": MutationSpec("kelompok", frozenset(("nama", "jumlah_peserta")), frozenset(("jumlah_peserta",)), True),
    "asisten": MutationSpec("asisten", frozenset(("nama",))),
    "laboratorium": MutationSpec("laboratorium", frozenset(("nama", "kapasitas")), frozenset(("kapasitas",)), True),
}

READ_ONLY_FIELDS = frozenset(("id", "is_active", "created_at", "updated_at", "source_revision"))


def utc_timestamp(previous: str | None = None) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    if previous is not None:
        old = dt.datetime.strptime(previous, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=dt.timezone.utc)
        if now <= old:
            now = old + dt.timedelta(milliseconds=1)
    return now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:23] + "Z"


def parse_json_object(request, *, operation: str) -> dict[str, Any]:
    if not request.is_json:
        raise APIError("UNSUPPORTED_MEDIA_TYPE", "Content-Type harus application/json.", 415)
    payload = request.get_json()
    if not isinstance(payload, dict):
        raise APIError("VALIDATION_ERROR", "Body request harus satu objek JSON.", 422)
    if operation == "status":
        allowed = frozenset(("is_active",))
    else:
        allowed = None
    if allowed is not None:
        _validate_fields(payload, allowed)
    return payload


def validate_payload(spec: MutationSpec, payload: dict[str, Any], *, partial: bool) -> dict[str, Any]:
    _validate_fields(payload, spec.writable)
    if not payload:
        raise APIError("VALIDATION_ERROR", "Minimal satu field writable wajib diberikan.", 422)
    if not partial and set(payload) != set(spec.writable):
        missing = sorted(spec.writable - set(payload))
        raise APIError("VALIDATION_ERROR", "Field wajib belum lengkap.", 422, {"fields": missing})

    cleaned: dict[str, Any] = {}
    for field, value in payload.items():
        if field == "nama":
            if not isinstance(value, str):
                raise _validation(field, "nama harus string.")
            value = value.strip()
            if not value:
                raise _validation(field, "nama tidak boleh kosong.")
        elif field in spec.positive_integer_fields:
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise _validation(field, f"{field} harus integer positif.")
        cleaned[field] = value
    return cleaned


def validate_status_payload(payload: dict[str, Any]) -> bool:
    _validate_fields(payload, frozenset(("is_active",)))
    if set(payload) != {"is_active"} or not isinstance(payload["is_active"], bool):
        raise _validation("is_active", "Body harus tepat memuat boolean is_active.")
    return payload["is_active"]


def _validate_fields(payload: dict[str, Any], writable: frozenset[str]) -> None:
    for field in payload:
        if field not in writable:
            if field in READ_ONLY_FIELDS:
                raise APIError("READ_ONLY_FIELD", "Field bersifat read-only.", 400, {"field": field})
            raise APIError("UNKNOWN_FIELD", "Field tidak dikenal.", 400, {"field": field})


def _validation(field: str, message: str) -> APIError:
    return APIError("VALIDATION_ERROR", message, 422, {"field": field})


def _transaction(db: sqlite3.Connection, operation):
    try:
        db.execute("BEGIN IMMEDIATE")
        result = operation()
        db.commit()
        return result
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise


def _increment_revision(db: sqlite3.Connection) -> None:
    cursor = db.execute("UPDATE system_metadata SET value = value + 1 WHERE key = 'source_revision'")
    if cursor.rowcount != 1:
        raise sqlite3.IntegrityError("source revision seed missing")


def _invalidate_active(db: sqlite3.Connection, timestamp: str) -> None:
    db.execute(
        "UPDATE versi_jadwal SET status='invalid', invalidated_at=? WHERE status='active'",
        (timestamp,),
    )


def _active_schedule_would_break(
    db: sqlite3.Connection,
    spec: MutationSpec,
    entity_id: int,
    changes: dict[str, Any],
    *,
    deactivating: bool = False,
) -> bool:
    active_version = db.execute("SELECT id FROM versi_jadwal WHERE status='active'").fetchone()
    if active_version is None:
        return False
    version_id = active_version["id"]

    if deactivating:
        if spec.table == "laboratorium":
            sql = "SELECT 1 FROM detail_jadwal WHERE versi_id=? AND laboratorium_id=? LIMIT 1"
        else:
            relation = {"mata_praktikum": "mata_praktikum_id", "kelompok": "kelompok_id", "asisten": "asisten_id"}[spec.table]
            sql = f"""SELECT 1 FROM detail_jadwal d
                      JOIN praktikum p ON p.id=d.praktikum_id
                      WHERE d.versi_id=? AND p.{relation}=? LIMIT 1"""
        return db.execute(sql, (version_id, entity_id)).fetchone() is not None

    if spec.table == "kelompok" and "jumlah_peserta" in changes:
        return db.execute(
            """SELECT 1 FROM detail_jadwal d
               JOIN praktikum p ON p.id=d.praktikum_id
               JOIN laboratorium l ON l.id=d.laboratorium_id
               WHERE d.versi_id=? AND p.kelompok_id=? AND l.kapasitas < ? LIMIT 1""",
            (version_id, entity_id, changes["jumlah_peserta"]),
        ).fetchone() is not None
    if spec.table == "laboratorium" and "kapasitas" in changes:
        return db.execute(
            """SELECT 1 FROM detail_jadwal d
               JOIN praktikum p ON p.id=d.praktikum_id
               JOIN kelompok k ON k.id=p.kelompok_id
               WHERE d.versi_id=? AND d.laboratorium_id=? AND k.jumlah_peserta > ? LIMIT 1""",
            (version_id, entity_id, changes["kapasitas"]),
        ).fetchone() is not None
    return False


def _fetch(db: sqlite3.Connection, spec: MutationSpec, entity_id: int) -> sqlite3.Row:
    row = db.execute(f"SELECT * FROM {spec.table} WHERE id=?", (entity_id,)).fetchone()
    if row is None:
        raise APIError("RESOURCE_NOT_FOUND", "Resource tidak ditemukan.", 404)
    return row


def _translate_integrity(error: sqlite3.IntegrityError, spec: MutationSpec) -> APIError:
    message = str(error).lower()
    if spec.unique_name and ("unique" in message or "uq_" in message):
        return APIError("DUPLICATE_NAME", "Nama sudah digunakan.", 409, {"field": "nama"})
    return APIError("VALIDATION_ERROR", "Data melanggar constraint database.", 422)


def create_master(db: sqlite3.Connection, spec: MutationSpec, values: dict[str, Any]) -> sqlite3.Row:
    def operation():
        timestamp = utc_timestamp()
        fields = tuple(values)
        placeholders = ",".join("?" for _ in fields)
        try:
            cursor = db.execute(
                f"INSERT INTO {spec.table} ({','.join(fields)},created_at,updated_at) VALUES ({placeholders},?,?)",
                (*[values[field] for field in fields], timestamp, timestamp),
            )
        except sqlite3.IntegrityError as error:
            raise _translate_integrity(error, spec) from None
        _increment_revision(db)
        return _fetch(db, spec, cursor.lastrowid)

    return _transaction(db, operation)


def update_master(db: sqlite3.Connection, spec: MutationSpec, entity_id: int, values: dict[str, Any]) -> sqlite3.Row:
    def operation():
        current = _fetch(db, spec, entity_id)
        changes = {field: value for field, value in values.items() if current[field] != value}
        if not changes:
            return current
        timestamp = utc_timestamp(current["updated_at"])
        assignments = ",".join(f"{field}=?" for field in changes)
        try:
            db.execute(
                f"UPDATE {spec.table} SET {assignments},updated_at=? WHERE id=?",
                (*changes.values(), timestamp, entity_id),
            )
        except sqlite3.IntegrityError as error:
            raise _translate_integrity(error, spec) from None

        if current["is_active"]:
            _increment_revision(db)
            if _active_schedule_would_break(db, spec, entity_id, changes):
                _invalidate_active(db, timestamp)
        return _fetch(db, spec, entity_id)

    return _transaction(db, operation)


def set_master_status(db: sqlite3.Connection, spec: MutationSpec, entity_id: int, is_active: bool) -> sqlite3.Row:
    def operation():
        current = _fetch(db, spec, entity_id)
        target = int(is_active)
        if current["is_active"] == target:
            return current
        timestamp = utc_timestamp(current["updated_at"])
        invalidates = bool(current["is_active"]) and _active_schedule_would_break(
            db, spec, entity_id, {}, deactivating=True
        )
        db.execute(
            f"UPDATE {spec.table} SET is_active=?,updated_at=? WHERE id=?",
            (target, timestamp, entity_id),
        )
        _increment_revision(db)
        if invalidates:
            _invalidate_active(db, timestamp)
        return _fetch(db, spec, entity_id)

    return _transaction(db, operation)
