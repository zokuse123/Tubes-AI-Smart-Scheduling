"""
init_db.py — Inisialisasi dan migrasi database SQLite untuk Smart Lab Scheduling System.

Berdasarkan DATA-MODEL.md (DEC-001–DEC-060).
Script ini idempoten:
- Database baru: diinisialisasi langsung dari schema.sql (12 tabel, 11 trigger, 27 index).
- Database lama: dimigrasi secara transaksional menggunakan prosedur table rebuild SQLite
  secara atomik (BEGIN IMMEDIATE ... COMMIT/ROLLBACK) untuk menambahkan kolom created_at
  dan updated_at pada 6 tabel master tanpa kehilangan data lama, foreign key, index,
  trigger overlap, maupun source_revision.

Penggunaan:
    python backend/db/init_db.py [--db-path PATH]

Default path: backend/db/lab_scheduling.db
"""

import argparse
import datetime
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
    conn.row_factory = sqlite3.Row
    return conn


def get_current_utc_iso() -> str:
    """Kembalikan timestamp RFC 3339 UTC fixed-width 24 karakter dengan milidetik."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:23] + "Z"


def parse_sql_statements(sql_script: str) -> list[str]:
    """
    Memecah script SQL menjadi statement-statement individual yang utuh
    (termasuk blok TRIGGER dengan BEGIN...END;), tanpa menggunakan executescript()
    yang memicu implicit commit.
    """
    statements = []
    current: list[str] = []
    for line in sql_script.splitlines(True):
        current.append(line)
        stmt = "".join(current)
        if sqlite3.complete_statement(stmt):
            stripped = stmt.strip()
            if stripped:
                statements.append(stripped)
            current = []
    return statements


def _ts_check_expr(col: str) -> str:
    """
    Ekspresi CHECK ketat untuk memvalidasi timestamp RFC 3339 UTC (YYYY-MM-DDTHH:MM:SS.sssZ).
    Memvalidasi format fixed-width, digit separator, rentang jam/menit/detik,
    serta validitas kalender Gregorian SQLite tanpa evaluasi NULL yang lolos.
    """
    return f"""(
        length({col}) = 24
        AND substr({col}, 5, 1) = '-'
        AND substr({col}, 8, 1) = '-'
        AND substr({col}, 11, 1) = 'T'
        AND substr({col}, 14, 1) = ':'
        AND substr({col}, 17, 1) = ':'
        AND substr({col}, 20, 1) = '.'
        AND substr({col}, 24, 1) = 'Z'
        AND substr({col}, 1, 4) BETWEEN '0001' AND '9999'
        AND substr({col}, 6, 2) BETWEEN '01' AND '12'
        AND substr({col}, 9, 2) BETWEEN '01' AND '31'
        AND substr({col}, 12, 2) BETWEEN '00' AND '23'
        AND substr({col}, 15, 2) BETWEEN '00' AND '59'
        AND substr({col}, 18, 2) BETWEEN '00' AND '59'
        AND substr({col}, 21, 1) BETWEEN '0' AND '9'
        AND substr({col}, 22, 1) BETWEEN '0' AND '9'
        AND substr({col}, 23, 1) BETWEEN '0' AND '9'
        AND strftime('%Y-%m-%dT%H:%M:%S', substr({col}, 1, 19)) IS NOT NULL
        AND strftime('%Y-%m-%dT%H:%M:%S', substr({col}, 1, 19)) = substr({col}, 1, 19)
    )"""


# Definisi kolom dasar (sebelum DEC-060) pada 6 tabel master
BASE_COLUMNS = {
    "mata_praktikum": ["id", "nama", "is_active"],
    "kelompok": ["id", "nama", "jumlah_peserta", "is_active"],
    "asisten": ["id", "nama", "is_active"],
    "laboratorium": ["id", "nama", "kapasitas", "is_active"],
    "slot_waktu": ["id", "hari", "jam_mulai", "jam_selesai", "is_active"],
    "praktikum": ["id", "mata_praktikum_id", "kelompok_id", "asisten_id", "is_active"],
}

# DDL pembuatan tabel rebuild dengan skema target lengkap (termasuk CHECK kalender ketat)
REBUILD_DDLS = {
    "mata_praktikum": f"""CREATE TABLE _mig_mata_praktikum (
        id         INTEGER PRIMARY KEY,
        nama       TEXT    COLLATE NOCASE NOT NULL,
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT chk_mata_nama_notempty  CHECK (trim(nama) <> ''),
        CONSTRAINT chk_mata_is_active      CHECK (is_active IN (0, 1)),
        CONSTRAINT uq_mata_nama            UNIQUE (nama),
        CONSTRAINT chk_mata_created_fmt    CHECK {_ts_check_expr('created_at')},
        CONSTRAINT chk_mata_updated_fmt    CHECK {_ts_check_expr('updated_at')}
    )""",
    "kelompok": f"""CREATE TABLE _mig_kelompok (
        id             INTEGER PRIMARY KEY,
        nama           TEXT    COLLATE NOCASE NOT NULL,
        jumlah_peserta INTEGER NOT NULL,
        is_active      INTEGER NOT NULL DEFAULT 1,
        created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT chk_kelompok_nama_notempty   CHECK (trim(nama) <> ''),
        CONSTRAINT chk_kelompok_peserta_pos     CHECK (jumlah_peserta > 0),
        CONSTRAINT chk_kelompok_is_active       CHECK (is_active IN (0, 1)),
        CONSTRAINT uq_kelompok_nama             UNIQUE (nama),
        CONSTRAINT chk_kelompok_created_fmt     CHECK {_ts_check_expr('created_at')},
        CONSTRAINT chk_kelompok_updated_fmt     CHECK {_ts_check_expr('updated_at')}
    )""",
    "asisten": f"""CREATE TABLE _mig_asisten (
        id         INTEGER PRIMARY KEY,
        nama       TEXT    NOT NULL,
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT chk_asisten_nama_notempty CHECK (trim(nama) <> ''),
        CONSTRAINT chk_asisten_is_active     CHECK (is_active IN (0, 1)),
        CONSTRAINT chk_asisten_created_fmt   CHECK {_ts_check_expr('created_at')},
        CONSTRAINT chk_asisten_updated_fmt   CHECK {_ts_check_expr('updated_at')}
    )""",
    "laboratorium": f"""CREATE TABLE _mig_laboratorium (
        id         INTEGER PRIMARY KEY,
        nama       TEXT    COLLATE NOCASE NOT NULL,
        kapasitas  INTEGER NOT NULL,
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT chk_lab_nama_notempty CHECK (trim(nama) <> ''),
        CONSTRAINT chk_lab_kapasitas_pos  CHECK (kapasitas > 0),
        CONSTRAINT chk_lab_is_active      CHECK (is_active IN (0, 1)),
        CONSTRAINT uq_lab_nama            UNIQUE (nama),
        CONSTRAINT chk_lab_created_fmt    CHECK {_ts_check_expr('created_at')},
        CONSTRAINT chk_lab_updated_fmt    CHECK {_ts_check_expr('updated_at')}
    )""",
    "slot_waktu": f"""CREATE TABLE _mig_slot_waktu (
        id          INTEGER PRIMARY KEY,
        hari        INTEGER NOT NULL,
        jam_mulai   TEXT    NOT NULL,
        jam_selesai TEXT    NOT NULL,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT chk_slot_hari          CHECK (hari BETWEEN 1 AND 5),
        CONSTRAINT chk_slot_mulai_format  CHECK (
            length(jam_mulai) = 5 AND substr(jam_mulai, 3, 1) = ':'
            AND CAST(substr(jam_mulai, 1, 2) AS INTEGER) BETWEEN 0 AND 23
            AND CAST(substr(jam_mulai, 4, 2) AS INTEGER) BETWEEN 0 AND 59
        ),
        CONSTRAINT chk_slot_selesai_format CHECK (
            length(jam_selesai) = 5 AND substr(jam_selesai, 3, 1) = ':'
            AND CAST(substr(jam_selesai, 1, 2) AS INTEGER) BETWEEN 0 AND 23
            AND CAST(substr(jam_selesai, 4, 2) AS INTEGER) BETWEEN 0 AND 59
        ),
        CONSTRAINT chk_slot_durasi_120 CHECK (
            (CAST(substr(jam_selesai, 1, 2) AS INTEGER) * 60 + CAST(substr(jam_selesai, 4, 2) AS INTEGER))
            - (CAST(substr(jam_mulai, 1, 2) AS INTEGER) * 60 + CAST(substr(jam_mulai, 4, 2) AS INTEGER))
            = 120
        ),
        CONSTRAINT chk_slot_is_active     CHECK (is_active IN (0, 1)),
        CONSTRAINT uq_slot_hari_waktu     UNIQUE (hari, jam_mulai, jam_selesai),
        CONSTRAINT chk_slot_created_fmt   CHECK {_ts_check_expr('created_at')},
        CONSTRAINT chk_slot_updated_fmt   CHECK {_ts_check_expr('updated_at')}
    )""",
    "praktikum": f"""CREATE TABLE _mig_praktikum (
        id                INTEGER PRIMARY KEY,
        mata_praktikum_id INTEGER NOT NULL,
        kelompok_id       INTEGER NOT NULL,
        asisten_id        INTEGER NOT NULL,
        is_active         INTEGER NOT NULL DEFAULT 1,
        created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT chk_praktikum_is_active CHECK (is_active IN (0, 1)),
        CONSTRAINT fk_praktikum_mata
            FOREIGN KEY (mata_praktikum_id) REFERENCES mata_praktikum (id)
            ON UPDATE RESTRICT ON DELETE RESTRICT,
        CONSTRAINT fk_praktikum_kelompok
            FOREIGN KEY (kelompok_id) REFERENCES kelompok (id)
            ON UPDATE RESTRICT ON DELETE RESTRICT,
        CONSTRAINT fk_praktikum_asisten
            FOREIGN KEY (asisten_id) REFERENCES asisten (id)
            ON UPDATE RESTRICT ON DELETE RESTRICT,
        CONSTRAINT chk_praktikum_created_fmt CHECK {_ts_check_expr('created_at')},
        CONSTRAINT chk_praktikum_updated_fmt CHECK {_ts_check_expr('updated_at')}
    )""",
}

# Index dan trigger yang WAJIB dibangun kembali setelah table rebuild
REBUILD_POST_DDLS = {
    "mata_praktikum": [
        "CREATE INDEX IF NOT EXISTS idx_mata_praktikum_aktif ON mata_praktikum (is_active) WHERE is_active = 1",
        """CREATE TRIGGER IF NOT EXISTS trg_mata_created_at_immutable
        BEFORE UPDATE OF created_at ON mata_praktikum
        BEGIN
            SELECT RAISE(ABORT, 'MATA_IMMUTABLE: created_at tidak dapat diubah')
            WHERE NEW.created_at <> OLD.created_at;
        END""",
    ],
    "kelompok": [
        "CREATE INDEX IF NOT EXISTS idx_kelompok_aktif ON kelompok (is_active) WHERE is_active = 1",
        """CREATE TRIGGER IF NOT EXISTS trg_kelompok_created_at_immutable
        BEFORE UPDATE OF created_at ON kelompok
        BEGIN
            SELECT RAISE(ABORT, 'KELOMPOK_IMMUTABLE: created_at tidak dapat diubah')
            WHERE NEW.created_at <> OLD.created_at;
        END""",
    ],
    "asisten": [
        "CREATE INDEX IF NOT EXISTS idx_asisten_nama ON asisten (nama)",
        "CREATE INDEX IF NOT EXISTS idx_asisten_aktif ON asisten (is_active) WHERE is_active = 1",
        """CREATE TRIGGER IF NOT EXISTS trg_asisten_created_at_immutable
        BEFORE UPDATE OF created_at ON asisten
        BEGIN
            SELECT RAISE(ABORT, 'ASISTEN_IMMUTABLE: created_at tidak dapat diubah')
            WHERE NEW.created_at <> OLD.created_at;
        END""",
    ],
    "laboratorium": [
        "CREATE INDEX IF NOT EXISTS idx_laboratorium_aktif ON laboratorium (is_active) WHERE is_active = 1",
        """CREATE TRIGGER IF NOT EXISTS trg_lab_created_at_immutable
        BEFORE UPDATE OF created_at ON laboratorium
        BEGIN
            SELECT RAISE(ABORT, 'LAB_IMMUTABLE: created_at tidak dapat diubah')
            WHERE NEW.created_at <> OLD.created_at;
        END""",
    ],
    "slot_waktu": [
        "CREATE INDEX IF NOT EXISTS idx_slot_waktu_hari_aktif ON slot_waktu (hari, jam_mulai, jam_selesai) WHERE is_active = 1",
        """CREATE TRIGGER IF NOT EXISTS trg_slot_created_at_immutable
        BEFORE UPDATE OF created_at ON slot_waktu
        BEGIN
            SELECT RAISE(ABORT, 'SLOT_IMMUTABLE: created_at tidak dapat diubah')
            WHERE NEW.created_at <> OLD.created_at;
        END""",
        """CREATE TRIGGER IF NOT EXISTS trg_slot_no_overlap_insert
        BEFORE INSERT ON slot_waktu
        WHEN NEW.is_active = 1
        BEGIN
            SELECT RAISE(ABORT, 'SLOT_OVERLAP: slot aktif baru bertabrakan dengan slot aktif yang sudah ada pada hari yang sama')
            WHERE EXISTS (
                SELECT 1 FROM slot_waktu
                WHERE is_active = 1
                  AND hari = NEW.hari
                  AND jam_mulai < NEW.jam_selesai
                  AND NEW.jam_mulai < jam_selesai
            );
        END""",
        """CREATE TRIGGER IF NOT EXISTS trg_slot_no_overlap_update
        BEFORE UPDATE OF hari, jam_mulai, jam_selesai, is_active ON slot_waktu
        WHEN NEW.is_active = 1
        BEGIN
            SELECT RAISE(ABORT, 'SLOT_OVERLAP: perubahan slot menyebabkan tabrakan dengan slot aktif lain pada hari yang sama')
            WHERE EXISTS (
                SELECT 1 FROM slot_waktu
                WHERE is_active = 1
                  AND id <> NEW.id
                  AND hari = NEW.hari
                  AND jam_mulai < NEW.jam_selesai
                  AND NEW.jam_mulai < jam_selesai
            );
        END""",
    ],
    "praktikum": [
        "CREATE INDEX IF NOT EXISTS idx_praktikum_mata ON praktikum (mata_praktikum_id)",
        "CREATE INDEX IF NOT EXISTS idx_praktikum_kelompok ON praktikum (kelompok_id)",
        "CREATE INDEX IF NOT EXISTS idx_praktikum_asisten ON praktikum (asisten_id)",
        "CREATE INDEX IF NOT EXISTS idx_praktikum_aktif ON praktikum (id) WHERE is_active = 1",
        """CREATE TRIGGER IF NOT EXISTS trg_praktikum_created_at_immutable
        BEFORE UPDATE OF created_at ON praktikum
        BEGIN
            SELECT RAISE(ABORT, 'PRAKTIKUM_IMMUTABLE: created_at tidak dapat diubah')
            WHERE NEW.created_at <> OLD.created_at;
        END""",
    ],
}


def migrate_master_tables_if_needed(conn: sqlite3.Connection) -> bool:
    """
    Migrasi idempoten untuk database lama yang belum memiliki kolom created_at / updated_at
    pada 6 tabel master (DEC-060).

    Menggunakan prosedur table rebuild SQLite secara ATOMIK dalam satu transaksi utuh:
    1. Periksa PRAGMA table_info untuk mendeteksi ketiadaan created_at atau updated_at secara independen.
    2. Nonaktifkan foreign keys sebelum memulai transaksi (PRAGMA foreign_keys = OFF).
    3. Mulai transaksi eksplisit via BEGIN IMMEDIATE.
    4. Buat tabel sementara _mig_<tbl> dengan skema target lengkap dan CHECK kalender ketat.
    5. Salin data: pertahankan nilai asli jika kolom sudah ada; isi hanya kolom yang hilang dengan migration_ts.
    6. Drop tabel lama dan rename tabel sementara ke nama target.
    7. Bangun kembali seluruh index parsial dan trigger (termasuk pencegah overlap slot).
    8. Verifikasi tidak ada tabel sementara _mig_* yang tertinggal.
    9. Verifikasi PRAGMA foreign_key_check dan PRAGMA integrity_check.
    10. COMMIT seluruh transaksi. Jika terjadi kesalahan apapun, lakukan ROLLBACK menyeluruh.
    11. Pulihkan PRAGMA foreign_keys = ON pada blok finally.
    """
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = {row[0] for row in cur.fetchall()}

    master_tables = ["mata_praktikum", "kelompok", "asisten", "laboratorium", "slot_waktu", "praktikum"]
    if not any(tbl in existing_tables for tbl in master_tables):
        # Database baru: belum ada tabel master, biarkan schema.sql yang menginisialisasi
        return False
    tables_needing_migration = []

    for tbl in master_tables:
        if tbl in existing_tables:
            cur = conn.execute(f"PRAGMA table_info({tbl})")
            cols = {row[1] for row in cur.fetchall()}
            if "created_at" not in cols or "updated_at" not in cols:
                tables_needing_migration.append(tbl)

    if not tables_needing_migration:
        log.info("Semua tabel master sudah memiliki kolom created_at/updated_at. Migrasi tidak diperlukan.")
        return False

    log.info("Memulai migrasi DEC-060 (table rebuild) untuk tabel: %s", tables_needing_migration)
    migration_ts = get_current_utc_iso()

    # Atur PRAGMA foreign_keys sebelum memulai transaksi
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute("BEGIN IMMEDIATE")
        for tbl in tables_needing_migration:
            create_sql = REBUILD_DDLS[tbl]
            temp_table = f"_mig_{tbl}"
            conn.execute(f"DROP TABLE IF EXISTS {temp_table}")
            conn.execute(create_sql)

            # Deteksi kolom yang sudah ada pada tabel lama untuk migrasi parsial
            base = BASE_COLUMNS[tbl]
            cur = conn.execute(f"PRAGMA table_info({tbl})")
            existing_cols = {row[1] for row in cur.fetchall()}

            select_exprs = list(base)
            params = []

            # created_at: gunakan nilai lama jika sudah ada; jika belum, gunakan migration_ts
            if "created_at" in existing_cols:
                select_exprs.append("created_at")
            else:
                select_exprs.append("?")
                params.append(migration_ts)

            # updated_at: gunakan nilai lama jika sudah ada; jika belum, gunakan migration_ts
            if "updated_at" in existing_cols:
                select_exprs.append("updated_at")
            else:
                select_exprs.append("?")
                params.append(migration_ts)

            insert_sql = (
                f"INSERT INTO {temp_table} ({', '.join(base)}, created_at, updated_at) "
                f"SELECT {', '.join(select_exprs)} FROM {tbl}"
            )
            conn.execute(insert_sql, tuple(params))
            conn.execute(f"DROP TABLE {tbl}")
            conn.execute(f"ALTER TABLE {temp_table} RENAME TO {tbl}")

            # Buat kembali seluruh index dan trigger untuk tabel ini
            for post_ddl in REBUILD_POST_DDLS.get(tbl, []):
                conn.execute(post_ddl)

        # Pastikan tidak ada tabel sementara _mig_* tertinggal
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_mig_%'")
        leftover = cur.fetchall()
        if leftover:
            raise RuntimeError(f"Tabel sementara migrasi masih tertinggal: {leftover}")

        # Periksa integritas foreign key setelah table swap
        fk_violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        if fk_violations:
            raise RuntimeError(f"Foreign key check gagal setelah migrasi rebuild: {fk_violations}")

        # Periksa integritas fisik database secara menyeluruh
        integrity_violations = conn.execute("PRAGMA integrity_check").fetchall()
        if [r[0] for r in integrity_violations] != ["ok"]:
            raise RuntimeError(f"Integrity check gagal setelah migrasi rebuild: {[r[0] for r in integrity_violations]}")

        conn.execute("COMMIT")
        log.info("Migrasi DEC-060 berhasil diselesaikan secara atomik.")
        return True
    except Exception:
        conn.execute("ROLLBACK")
        log.exception("Migrasi DEC-060 gagal dan telah di-rollback.")
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def init_db(db_path: str) -> None:
    """
    Inisialisasi atau perbarui database dari schema.sql dan jalankan migrasi bila perlu.

    Idempoten:
    - Menjalankan migrasi DEC-060 secara atomik jika database lama belum memiliki created_at/updated_at.
    - Menjalankan statement schema.sql secara berurutan dalam transaksi eksplisit (BEGIN IMMEDIATE ... COMMIT)
      tanpa menggunakan executescript() yang memicu implicit commit.
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

    statements = parse_sql_statements(schema_sql)

    conn = get_connection(db_path)
    try:
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = {row[0] for row in cur.fetchall()}

        if "mata_praktikum" not in existing_tables:
            # Database baru: terapkan seluruh schema secara atomik
            conn.execute("BEGIN IMMEDIATE")
            try:
                for stmt in statements:
                    conn.execute(stmt)
                conn.execute("COMMIT")
                log.info("Schema database baru berhasil diterapkan.")
            except Exception:
                conn.execute("ROLLBACK")
                raise
        else:
            # Database lama: jalankan migrasi jika perlu
            migrate_master_tables_if_needed(conn)

            # Terapkan schema.sql secara idempoten (CREATE ... IF NOT EXISTS)
            conn.execute("BEGIN IMMEDIATE")
            try:
                for stmt in statements:
                    conn.execute(stmt)
                conn.execute("COMMIT")
                log.info("Schema berhasil diverifikasi/diperbarui secara idempoten.")
            except Exception:
                conn.execute("ROLLBACK")
                raise

        # Verifikasi seed source_revision
        cur = conn.execute(
            "SELECT value FROM system_metadata WHERE key = 'source_revision'"
        )
        row = cur.fetchone()
        if row is None:
            log.error("Seed source_revision tidak ditemukan setelah init!")
            sys.exit(1)
        log.info("source_revision saat ini: %d", row[0])

        # Verifikasi jumlah objek yang terbentuk
        cur = conn.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='table'"
        )
        tabel_count = cur.fetchone()[0]
        log.info("Jumlah tabel: %d (diharapkan 12)", tabel_count)

        cur = conn.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='trigger'"
        )
        trigger_count = cur.fetchone()[0]
        log.info("Jumlah trigger: %d (diharapkan 11)", trigger_count)

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
        description="Inisialisasi dan migrasi database SQLite Smart Lab Scheduling System"
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
