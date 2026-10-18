"""
init_db.py — Inisialisasi database SQLite untuk Smart Lab Scheduling System.

Berdasarkan DATA-MODEL.md (DEC-001–DEC-059).
Script ini idempoten: aman dijalankan ulang karena memakai CREATE TABLE IF NOT EXISTS
dan INSERT OR IGNORE untuk seed source_revision.

Penggunaan:
    python backend/db/init_db.py [--db-path PATH]

Default path: backend/db/lab_scheduling.db
"""

import argparse
import logging
import os
import sqlite3
import sys

# Path default database relatif terhadap root proyek
_DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(__file__), "lab_scheduling.db"
)
_SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


def get_connection(db_path: str) -> sqlite3.Connection:
    """Buat koneksi SQLite dengan PRAGMA wajib aktif (DEC-011, DATA-MODEL §1)."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA journal_mode = WAL")  # direkomendasikan DATA-MODEL §1
    # row_factory untuk akses kolom via nama
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str) -> None:
    """
    Inisialisasi atau perbarui database dari schema.sql.

    Idempoten: CREATE TABLE IF NOT EXISTS dan INSERT OR IGNORE mencegah
    penghapusan data yang sudah ada ketika dijalankan ulang.
    """
    log.info("Menginisialisasi database: %s", db_path)

    # Pastikan direktori ada
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    # Baca schema SQL
    if not os.path.exists(_SCHEMA_PATH):
        log.error("schema.sql tidak ditemukan: %s", _SCHEMA_PATH)
        sys.exit(1)

    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()

    conn = get_connection(db_path)
    try:
        with conn:
            # executescript menonaktifkan autocommit; jalankan dalam transaksi tunggal
            conn.executescript(schema_sql)
        log.info("Schema berhasil diterapkan.")

        # Verifikasi seed source_revision
        cur = conn.execute(
            "SELECT value FROM system_metadata WHERE key = 'source_revision'"
        )
        row = cur.fetchone()
        if row is None:
            # Seharusnya tidak terjadi karena INSERT OR IGNORE di schema.sql
            log.error("Seed source_revision tidak ditemukan setelah init!")
            sys.exit(1)
        log.info("source_revision saat ini: %d", row[0])

        # Verifikasi jumlah tabel yang terbentuk
        cur = conn.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='table'"
        )
        tabel_count = cur.fetchone()[0]
        log.info("Jumlah tabel: %d (diharapkan 12)", tabel_count)

        cur = conn.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='trigger'"
        )
        trigger_count = cur.fetchone()[0]
        log.info("Jumlah trigger: %d", trigger_count)

        cur = conn.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='index'"
        )
        index_count = cur.fetchone()[0]
        log.info("Jumlah index: %d", index_count)

    finally:
        conn.close()

    log.info("Inisialisasi selesai: %s", db_path)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inisialisasi database SQLite Smart Lab Scheduling System"
    )
    parser.add_argument(
        "--db-path",
        default=_DEFAULT_DB_PATH,
        help=f"Path file SQLite (default: {_DEFAULT_DB_PATH})",
    )
    args = parser.parse_args()
    init_db(args.db_path)


if __name__ == "__main__":
    main()
