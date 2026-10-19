"""Dua belas endpoint GET master resource untuk REST API v1."""

import math
import sqlite3
from dataclasses import dataclass

from flask import Blueprint, jsonify, request

from .db import get_db
from .errors import APIError
from .mutations import (
    SPECS,
    create_master,
    parse_json_object,
    set_master_status,
    update_master,
    validate_payload,
    validate_status_payload,
)

api = Blueprint("api_v1", __name__, url_prefix="/api/v1")


@dataclass(frozen=True)
class Resource:
    table: str
    path: str
    fields: tuple[str, ...]
    sort_fields: frozenset[str]
    search_field: str | None = None
    nested: bool = False


TIMESTAMP_FIELDS = ("created_at", "updated_at")
RESOURCES = (
    Resource("mata_praktikum", "mata-praktikum", ("id", "nama", "is_active", *TIMESTAMP_FIELDS), frozenset(("id", "nama", *TIMESTAMP_FIELDS)), "nama"),
    Resource("kelompok", "kelompok", ("id", "nama", "jumlah_peserta", "is_active", *TIMESTAMP_FIELDS), frozenset(("id", "nama", "jumlah_peserta", *TIMESTAMP_FIELDS)), "nama"),
    Resource("asisten", "asisten", ("id", "nama", "is_active", *TIMESTAMP_FIELDS), frozenset(("id", "nama", *TIMESTAMP_FIELDS)), "nama"),
    Resource("laboratorium", "laboratorium", ("id", "nama", "kapasitas", "is_active", *TIMESTAMP_FIELDS), frozenset(("id", "nama", "kapasitas", *TIMESTAMP_FIELDS)), "nama"),
    Resource("slot_waktu", "slot-waktu", ("id", "hari", "jam_mulai", "jam_selesai", "is_active", *TIMESTAMP_FIELDS), frozenset(("id", "hari", "jam_mulai", "jam_selesai", *TIMESTAMP_FIELDS))),
    Resource("praktikum", "praktikum", ("id", "mata_praktikum_id", "kelompok_id", "asisten_id", "is_active", *TIMESTAMP_FIELDS), frozenset(("id", "mata_praktikum_id", "kelompok_id", "asisten_id", *TIMESTAMP_FIELDS)), nested=True),
)

ALLOWED_QUERY = frozenset(("page", "page_size", "sort_by", "sort_order", "is_active", "search"))


def _invalid_query(message: str, field: str | None = None) -> APIError:
    return APIError("INVALID_QUERY", message, 400, {"field": field} if field else None)


def _positive_int(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None:
        return default
    if not raw.isascii() or not raw.isdecimal() or int(raw) < 1:
        raise _invalid_query(f"{name} harus integer positif.", name)
    return int(raw)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _parse_query(resource: Resource):
    unknown = set(request.args) - ALLOWED_QUERY
    if unknown:
        raise _invalid_query("Query parameter tidak dikenal.", sorted(unknown)[0])
    for name in request.args:
        if len(request.args.getlist(name)) != 1:
            raise _invalid_query("Query parameter tidak boleh berulang.", name)

    page = _positive_int("page", 1)
    page_size = _positive_int("page_size", 20)
    if page_size > 100:
        raise _invalid_query("page_size maksimum 100.", "page_size")

    sort_by = request.args.get("sort_by", "id")
    if sort_by not in resource.sort_fields:
        raise _invalid_query("sort_by tidak diizinkan untuk resource ini.", "sort_by")
    sort_order = request.args.get("sort_order", "asc")
    if sort_order not in ("asc", "desc"):
        raise _invalid_query("sort_order harus asc atau desc.", "sort_order")

    active = request.args.get("is_active", "true")
    if active not in ("true", "false", "all"):
        raise _invalid_query("is_active harus true, false, atau all.", "is_active")

    search = request.args.get("search")
    if search is not None:
        if resource.search_field is None:
            raise _invalid_query("Search tidak didukung untuk resource ini.", "search")
        search = search.strip()
        if len(search) > 100:
            raise _invalid_query("Search maksimum 100 karakter setelah trim.", "search")
    return page, page_size, sort_by, sort_order, active, search


def _where_clause(resource: Resource, active: str, search: str | None):
    clauses: list[str] = []
    params: list[object] = []
    if active != "all":
        clauses.append("p.is_active = ?")
        params.append(1 if active == "true" else 0)
    if search is not None:
        clauses.append(f"CASEFOLD(p.{resource.search_field}) LIKE CASEFOLD(?) ESCAPE '\\'")
        params.append(f"%{_escape_like(search)}%")
    return (" WHERE " + " AND ".join(clauses)) if clauses else "", params


def _select_sql(resource: Resource) -> str:
    if not resource.nested:
        return "SELECT " + ", ".join(f"p.{field}" for field in resource.fields) + f" FROM {resource.table} p"
    return """SELECT p.id, p.mata_praktikum_id, p.kelompok_id, p.asisten_id,
                     p.is_active, p.created_at, p.updated_at,
                     m.id AS mata_id, m.nama AS mata_nama,
                     k.id AS kelompok_nested_id, k.nama AS kelompok_nama,
                     k.jumlah_peserta AS kelompok_jumlah_peserta,
                     a.id AS asisten_nested_id, a.nama AS asisten_nama
              FROM praktikum p
              JOIN mata_praktikum m ON m.id = p.mata_praktikum_id
              JOIN kelompok k ON k.id = p.kelompok_id
              JOIN asisten a ON a.id = p.asisten_id"""


def _serialize(resource: Resource, row: sqlite3.Row) -> dict:
    result = {field: (bool(row[field]) if field == "is_active" else row[field]) for field in resource.fields}
    if resource.nested:
        result["mata_praktikum"] = {"id": row["mata_id"], "nama": row["mata_nama"]}
        result["kelompok"] = {"id": row["kelompok_nested_id"], "nama": row["kelompok_nama"], "jumlah_peserta": row["kelompok_jumlah_peserta"]}
        result["asisten"] = {"id": row["asisten_nested_id"], "nama": row["asisten_nama"]}
    return result


def list_resource(resource: Resource):
    page, page_size, sort_by, sort_order, active, search = _parse_query(resource)
    where_sql, params = _where_clause(resource, active, search)
    db = get_db()
    total_items = db.execute(f"SELECT COUNT(*) FROM {resource.table} p{where_sql}", params).fetchone()[0]
    direction = sort_order.upper()
    order_sql = f"p.{sort_by} {direction}"
    if sort_by != "id":
        order_sql += f", p.id {direction}"
    rows = db.execute(
        f"{_select_sql(resource)}{where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
        (*params, page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify({"data": [_serialize(resource, row) for row in rows], "meta": {"page": page, "page_size": page_size, "total_items": total_items, "total_pages": math.ceil(total_items / page_size)}})


def detail_resource(resource: Resource, resource_id: int):
    if resource_id < 1:
        raise APIError("RESOURCE_NOT_FOUND", "Resource tidak ditemukan.", 404)
    row = get_db().execute(f"{_select_sql(resource)} WHERE p.id = ?", (resource_id,)).fetchone()
    if row is None:
        raise APIError("RESOURCE_NOT_FOUND", "Resource tidak ditemukan.", 404)
    return jsonify({"data": _serialize(resource, row)})


def _response_row(resource: Resource, resource_id: int) -> sqlite3.Row:
    row = get_db().execute(f"{_select_sql(resource)} WHERE p.id = ?", (resource_id,)).fetchone()
    if row is None:
        raise APIError("RESOURCE_NOT_FOUND", "Resource tidak ditemukan.", 404)
    return row


def create_resource(resource: Resource):
    spec = SPECS[resource.table]
    payload = parse_json_object(request, operation="create")
    values = validate_payload(spec, payload, partial=False)
    row = create_master(get_db(), spec, values)
    return jsonify({"data": _serialize(resource, _response_row(resource, row["id"]))}), 201


def update_resource(resource: Resource, resource_id: int):
    if resource_id < 1:
        raise APIError("RESOURCE_NOT_FOUND", "Resource tidak ditemukan.", 404)
    spec = SPECS[resource.table]
    payload = parse_json_object(request, operation="update")
    values = validate_payload(spec, payload, partial=True)
    row = update_master(get_db(), spec, resource_id, values)
    return jsonify({"data": _serialize(resource, _response_row(resource, row["id"]))})


def update_resource_status(resource: Resource, resource_id: int):
    if resource_id < 1:
        raise APIError("RESOURCE_NOT_FOUND", "Resource tidak ditemukan.", 404)
    spec = SPECS[resource.table]
    payload = parse_json_object(request, operation="status")
    is_active = validate_status_payload(payload)
    row = set_master_status(get_db(), spec, resource_id, is_active)
    return jsonify({"data": _serialize(resource, _response_row(resource, row["id"]))})


def _register_routes() -> None:
    for resource in RESOURCES:
        api.add_url_rule(f"/{resource.path}", endpoint=f"list_{resource.table}", view_func=lambda resource=resource: list_resource(resource), methods=("GET",))
        api.add_url_rule(f"/{resource.path}/<int:resource_id>", endpoint=f"detail_{resource.table}", view_func=lambda resource_id, resource=resource: detail_resource(resource, resource_id), methods=("GET",))
        if resource.table in SPECS:
            api.add_url_rule(f"/{resource.path}", endpoint=f"create_{resource.table}", view_func=lambda resource=resource: create_resource(resource), methods=("POST",))
            api.add_url_rule(f"/{resource.path}/<int:resource_id>", endpoint=f"update_{resource.table}", view_func=lambda resource_id, resource=resource: update_resource(resource, resource_id), methods=("PATCH",))
            api.add_url_rule(f"/{resource.path}/<int:resource_id>/status", endpoint=f"status_{resource.table}", view_func=lambda resource_id, resource=resource: update_resource_status(resource, resource_id), methods=("PATCH",))


_register_routes()
