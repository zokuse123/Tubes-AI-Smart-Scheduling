"""Error API terstruktur dan handler aman untuk REST v1."""

import logging
import sqlite3
from dataclasses import dataclass
from typing import Any

from flask import Flask, jsonify
from werkzeug.exceptions import BadRequest, NotFound, RequestEntityTooLarge, UnsupportedMediaType

log = logging.getLogger(__name__)


@dataclass
class APIError(Exception):
    code: str
    message: str
    status: int
    details: Any = None


def error_response(code: str, message: str, status: int, details: Any = None):
    return jsonify({"error": {"code": code, "message": message, "details": details}}), status


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(APIError)
    def handle_api_error(error: APIError):
        return error_response(error.code, error.message, error.status, error.details)

    @app.errorhandler(RequestEntityTooLarge)
    def handle_too_large(_error: RequestEntityTooLarge):
        return error_response("PAYLOAD_TOO_LARGE", "Ukuran request melebihi batas.", 413)

    @app.errorhandler(UnsupportedMediaType)
    def handle_media_type(_error: UnsupportedMediaType):
        return error_response("UNSUPPORTED_MEDIA_TYPE", "Content-Type harus application/json.", 415)

    @app.errorhandler(BadRequest)
    def handle_bad_request(_error: BadRequest):
        return error_response("INVALID_JSON", "Body request bukan JSON yang valid.", 400)

    @app.errorhandler(NotFound)
    def handle_not_found(_error: NotFound):
        return error_response("RESOURCE_NOT_FOUND", "Resource tidak ditemukan.", 404)

    @app.errorhandler(sqlite3.Error)
    def handle_database_error(error: sqlite3.Error):
        log.error("Database operation failed (%s)", type(error).__name__)
        message = str(error).lower()
        if "locked" in message or "busy" in message:
            return error_response("DATABASE_BUSY", "Database sedang sibuk. Coba kembali.", 503)
        return error_response("DATABASE_ERROR", "Operasi database gagal.", 500)

    @app.errorhandler(Exception)
    def handle_unexpected_error(error: Exception):
        log.error("Unexpected backend error (%s)", type(error).__name__)
        return error_response("INTERNAL_ERROR", "Terjadi kesalahan internal.", 500)
