"""Lifecycle koneksi SQLite per request tanpa auto-init atau auto-migration."""

import sqlite3
from pathlib import Path

from flask import current_app, g


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        database = Path(current_app.config["DATABASE"])
        if not database.is_file():
            raise sqlite3.OperationalError("configured database is not initialized")

        uri = f"file:{database.resolve().as_posix()}?mode=rw"
        connection = sqlite3.connect(
            uri,
            uri=True,
            timeout=current_app.config["SQLITE_TIMEOUT_SECONDS"],
        )
        connection.row_factory = sqlite3.Row
        connection.create_function("CASEFOLD", 1, lambda value: value.casefold(), deterministic=True)
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(f"PRAGMA busy_timeout = {int(current_app.config['SQLITE_TIMEOUT_SECONDS'] * 1000)}")
        g.db = connection
    return g.db


def close_db(_error=None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_app(app) -> None:
    app.teardown_appcontext(close_db)
