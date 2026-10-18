"""
test_schema.py — Automated tests untuk TASK 08: SQLite Foundation

Menguji seluruh constraint, integritas, dan trigger sesuai:
- DATA-MODEL.md §11 (pengujian minimum skema)
- DEC-001–DEC-059

Jalankan:
    python -m pytest backend/tests/test_schema.py -v
    atau
    python -m pytest backend/tests/test_schema.py -v --tb=short

Setiap test menggunakan database in-memory yang bersih (:memory:)
sehingga tes terisolasi dan tidak saling bergantung.
Setiap exception assertion memverifikasi bahwa penolakan terjadi karena
constraint atau trigger spesifik yang memang sedang diuji.
"""

import json
import os
import sqlite3
import sys
import unittest

# Tambahkan root proyek ke path agar import relatif berfungsi
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.db.init_db import get_connection

_SCHEMA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "db", "schema.sql"
)


# =============================================================================
# Helpers
# =============================================================================

def make_db() -> sqlite3.Connection:
    """Buat koneksi :memory: bersih dengan schema diterapkan."""
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.row_factory = sqlite3.Row

    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    conn.executescript(schema_sql)
    return conn


def ts(suffix: str = "000") -> str:
    """Kembalikan timestamp RFC 3339 UTC valid."""
    return f"2026-10-18T08:30:00.{suffix}Z"


def minimal_snapshot() -> str:
    """Snapshot JSON valid minimal untuk versi_jadwal."""
    return json.dumps({
        "schema_version": 1,
        "source_revision": 0,
        "generated_at": ts(),
        "saved_at": ts("001"),
        "mata_praktikum": [],
        "kelompok": [],
        "asisten": [],
        "laboratorium": [],
        "slot_waktu": [],
        "praktikum": [],
        "assignments": [],
    })


def minimal_hasil() -> str:
    """hasil_json valid minimal untuk preview_jadwal."""
    return json.dumps({"status": "success", "assignments": []})


# =============================================================================
# 1. Inisialisasi & Seed
# =============================================================================

class TestInitialization(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_12_tables_exist(self):
        """12 tabel wajib ada setelah init."""
        expected = {
            "mata_praktikum", "kelompok", "asisten", "laboratorium",
            "slot_waktu", "praktikum", "ketersediaan_kelompok",
            "ketersediaan_asisten", "versi_jadwal", "detail_jadwal",
            "preview_jadwal", "system_metadata",
        }
        cur = self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        actual = {row[0] for row in cur.fetchall()}
        self.assertEqual(expected, actual, f"Tabel kurang/lebih: {expected ^ actual}")

    def test_seed_source_revision_zero(self):
        """source_revision harus di-seed dengan nilai 0 (DEC-022)."""
        cur = self.conn.execute(
            "SELECT value FROM system_metadata WHERE key='source_revision'"
        )
        row = cur.fetchone()
        self.assertIsNotNone(row, "Baris source_revision tidak ada")
        self.assertEqual(0, row[0])

    def test_seed_idempoten(self):
        """INSERT OR IGNORE: re-init tidak menimpa revision yang sudah dinaikkan."""
        self.conn.execute(
            "UPDATE system_metadata SET value=5 WHERE key='source_revision'"
        )
        self.conn.commit()
        # Re-apply schema (INSERT OR IGNORE)
        with open(_SCHEMA_PATH, encoding="utf-8") as f:
            self.conn.executescript(f.read())
        cur = self.conn.execute(
            "SELECT value FROM system_metadata WHERE key='source_revision'"
        )
        self.assertEqual(5, cur.fetchone()[0], "Seed menimpa nilai yang sudah ada")

    def test_foreign_keys_active(self):
        """PRAGMA foreign_keys harus ON pada setiap koneksi."""
        cur = self.conn.execute("PRAGMA foreign_keys")
        self.assertEqual(1, cur.fetchone()[0])

    def test_triggers_exist(self):
        """Semua 5 trigger wajib ada."""
        expected_triggers = {
            "trg_slot_no_overlap_insert",
            "trg_slot_no_overlap_update",
            "trg_versi_jadwal_immutable",
            "trg_detail_jadwal_immutable",
            "trg_preview_immutable",
        }
        cur = self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='trigger'"
        )
        actual = {row[0] for row in cur.fetchall()}
        missing = expected_triggers - actual
        self.assertFalse(missing, f"Trigger tidak ditemukan: {missing}")

    def test_27_indexes_exist(self):
        """Semua 18 index eksplisit dan total 27 index (termasuk auto-indexes) wajib ada."""
        expected_explicit_indexes = {
            "idx_mata_praktikum_aktif",
            "idx_kelompok_aktif",
            "idx_asisten_nama",
            "idx_asisten_aktif",
            "idx_laboratorium_aktif",
            "idx_slot_waktu_hari_aktif",
            "idx_praktikum_mata",
            "idx_praktikum_kelompok",
            "idx_praktikum_asisten",
            "idx_praktikum_aktif",
            "idx_ketersediaan_kelompok_slot",
            "idx_ketersediaan_asisten_slot",
            "uq_versi_jadwal_satu_active",
            "idx_versi_jadwal_created",
            "idx_detail_jadwal_versi",
            "idx_detail_jadwal_slot_lab",
            "idx_preview_status_expiry",
            "idx_preview_terminal_cleanup",
        }
        cur = self.conn.execute("SELECT name FROM sqlite_master WHERE type='index'")
        actual = {row[0] for row in cur.fetchall()}
        missing = expected_explicit_indexes - actual
        self.assertFalse(missing, f"Index eksplisit kurang: {missing}")
        self.assertEqual(27, len(actual), f"Total index tidak 27: {len(actual)}")


# =============================================================================
# 2. Check Constraints — Boolean (is_active)
# =============================================================================

class TestBooleanConstraints(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_is_active_invalid_value_rejected(self):
        """is_active hanya boleh 0 atau 1; nilai lain ditolak oleh CHECK constraint."""
        cases = [
            ("INSERT INTO mata_praktikum (nama, is_active) VALUES ('MataA', 2)", "chk_mata_is_active"),
            ("INSERT INTO kelompok (nama, jumlah_peserta, is_active) VALUES ('KA', 10, -1)", "chk_kelompok_is_active"),
            ("INSERT INTO asisten (nama, is_active) VALUES ('AA', 99)", "chk_asisten_is_active"),
            ("INSERT INTO laboratorium (nama, kapasitas, is_active) VALUES ('LA', 10, 2)", "chk_lab_is_active"),
            ("INSERT INTO praktikum (mata_praktikum_id, kelompok_id, asisten_id, is_active) VALUES (1, 1, 1, 5)", "chk_praktikum_is_active"),
        ]
        # Seed dependencies untuk praktikum
        self.conn.execute("INSERT INTO mata_praktikum (id, nama) VALUES (1, 'M')")
        self.conn.execute("INSERT INTO kelompok (id, nama, jumlah_peserta) VALUES (1, 'K', 10)")
        self.conn.execute("INSERT INTO asisten (id, nama) VALUES (1, 'A')")
        self.conn.commit()

        for sql, chk_name in cases:
            with self.subTest(sql=sql):
                with self.assertRaises(sqlite3.IntegrityError) as ctx:
                    self.conn.execute(sql)
                err_msg = str(ctx.exception)
                self.assertIn("CHECK constraint failed", err_msg)
                self.assertIn(chk_name, err_msg)

    def test_is_active_valid_values_accepted(self):
        """is_active = 0 dan 1 harus diterima."""
        self.conn.execute(
            "INSERT INTO mata_praktikum (nama, is_active) VALUES ('MataA', 1)"
        )
        self.conn.execute(
            "INSERT INTO mata_praktikum (nama, is_active) VALUES ('MataB', 0)"
        )
        self.conn.commit()


# =============================================================================
# 3. Check Constraints — Kapasitas & Peserta
# =============================================================================

class TestCapacityConstraints(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_kapasitas_lab_zero_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO laboratorium (nama, kapasitas) VALUES ('Lab0', 0)"
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_lab_kapasitas_pos", err_msg)

    def test_kapasitas_lab_negative_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO laboratorium (nama, kapasitas) VALUES ('LabNeg', -5)"
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_lab_kapasitas_pos", err_msg)

    def test_kapasitas_lab_positive_accepted(self):
        self.conn.execute(
            "INSERT INTO laboratorium (nama, kapasitas) VALUES ('LabOK', 30)"
        )
        self.conn.commit()

    def test_jumlah_peserta_zero_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO kelompok (nama, jumlah_peserta) VALUES ('KA', 0)"
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_kelompok_peserta_pos", err_msg)

    def test_jumlah_peserta_negative_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO kelompok (nama, jumlah_peserta) VALUES ('KB', -1)"
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_kelompok_peserta_pos", err_msg)

    def test_jumlah_peserta_positive_accepted(self):
        self.conn.execute(
            "INSERT INTO kelompok (nama, jumlah_peserta) VALUES ('KC', 1)"
        )
        self.conn.commit()


# =============================================================================
# 4. Check Constraints — Hari slot_waktu
# =============================================================================

class TestSlotHariConstraint(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def _insert_slot(self, hari: int, mulai: str = "08:00", selesai: str = "10:00"):
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (?, ?, ?)",
            (hari, mulai, selesai),
        )

    def test_hari_valid_1_to_5(self):
        for hari in range(1, 6):
            mulai = f"{6 + hari * 2:02d}:00"
            selesai = f"{8 + hari * 2:02d}:00"
            with self.subTest(hari=hari):
                self._insert_slot(hari, mulai, selesai)
        self.conn.commit()

    def test_hari_0_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_slot(0)
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_slot_hari", err_msg)

    def test_hari_6_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_slot(6)
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_slot_hari", err_msg)

    def test_hari_negative_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_slot(-1)
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_slot_hari", err_msg)


# =============================================================================
# 5. Check Constraints — Format jam HH:MM dan durasi 120 menit
# =============================================================================

class TestSlotFormatConstraint(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def _insert_slot(self, mulai: str, selesai: str, hari: int = 1):
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (?, ?, ?)",
            (hari, mulai, selesai),
        )

    def test_valid_slot(self):
        self._insert_slot("08:00", "10:00")
        self.conn.commit()

    def test_valid_slot_late(self):
        self._insert_slot("20:00", "22:00")
        self.conn.commit()

    def test_invalid_mulai_format_short(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_slot("8:00", "10:00")
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_slot_mulai_format", err_msg)

    def test_invalid_mulai_format_no_colon(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_slot("0800", "1000")
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_slot_mulai_format", err_msg)

    def test_invalid_jam_out_of_range(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_slot("25:00", "27:00")
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_slot_mulai_format", err_msg)

    def test_invalid_menit_out_of_range(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_slot("08:60", "10:60")
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_slot_mulai_format", err_msg)

    def test_durasi_bukan_120_menit_rejected(self):
        """Slot 90 menit harus ditolak."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_slot("08:00", "09:30")
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_slot_durasi_120", err_msg)

    def test_durasi_180_menit_rejected(self):
        """Slot 180 menit harus ditolak."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_slot("08:00", "11:00")
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_slot_durasi_120", err_msg)

    def test_durasi_tepat_120_menit_diterima(self):
        """Berbagai kombinasi slot 120 menit harus diterima."""
        slots = [
            ("06:00", "08:00", 1),
            ("10:30", "12:30", 2),
            ("13:00", "15:00", 3),
        ]
        for mulai, selesai, hari in slots:
            with self.subTest(mulai=mulai, selesai=selesai):
                self._insert_slot(mulai, selesai, hari)
        self.conn.commit()


# =============================================================================
# 6. Trigger Overlap Slot (INSERT, UPDATE waktu, UPDATE hari, Reaktivasi)
# =============================================================================

class TestSlotOverlapTrigger(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()
        # Tambahkan slot dasar hari Senin 08:00–10:00 (aktif)
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai, is_active) VALUES (1, '08:00', '10:00', 1)"
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_overlap_full_rejected(self):
        """Slot yang sepenuhnya identik/overlap pada hari yang sama harus ditolak oleh trigger."""
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (1, '08:00', '10:00')"
            )
        self.assertIn("SLOT_OVERLAP", str(ctx.exception))

    def test_overlap_partial_start_rejected(self):
        """Slot yang mulainya di tengah slot aktif (09:00-11:00) harus ditolak."""
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (1, '09:00', '11:00')"
            )
        self.assertIn("SLOT_OVERLAP", str(ctx.exception))

    def test_overlap_partial_end_rejected(self):
        """Slot yang selesainya di tengah slot aktif (07:00-09:00) harus ditolak."""
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (1, '07:00', '09:00')"
            )
        self.assertIn("SLOT_OVERLAP", str(ctx.exception))

    def test_adjacent_after_accepted(self):
        """Slot bersebelahan setelah (10:00–12:00) harus DITERIMA."""
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (1, '10:00', '12:00')"
        )
        self.conn.commit()

    def test_adjacent_before_accepted(self):
        """Slot bersebelahan sebelum (06:00–08:00) harus DITERIMA."""
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (1, '06:00', '08:00')"
        )
        self.conn.commit()

    def test_different_day_accepted(self):
        """Slot pada hari berbeda (Selasa) yang sama waktunya harus DITERIMA."""
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (2, '08:00', '10:00')"
        )
        self.conn.commit()

    def test_inactive_slot_no_overlap_check(self):
        """Slot TIDAK aktif (is_active=0) tidak memicu cek overlap."""
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai, is_active) VALUES (1, '09:00', '11:00', 0)"
        )
        self.conn.commit()

    def test_update_waktu_causes_overlap_rejected(self):
        """UPDATE jam yang menyebabkan partial overlap harus ditolak (DEC-023)."""
        # Tambahkan slot adjacent 10:00-12:00
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (1, '10:00', '12:00')"
        )
        self.conn.commit()
        slot_id = self.conn.execute(
            "SELECT id FROM slot_waktu WHERE hari=1 AND jam_mulai='10:00'"
        ).fetchone()[0]

        # Geser mundur ke 09:00-11:00 (overlap dengan 08:00-10:00)
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE slot_waktu SET jam_mulai='09:00', jam_selesai='11:00' WHERE id=?",
                (slot_id,),
            )
        self.assertIn("SLOT_OVERLAP", str(ctx.exception))

    def test_update_waktu_exact_overlap_rejected(self):
        """UPDATE jam yang sama persis (full containment) dengan slot lain harus ditolak."""
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (1, '10:00', '12:00')"
        )
        self.conn.commit()
        slot_id = self.conn.execute(
            "SELECT id FROM slot_waktu WHERE hari=1 AND jam_mulai='10:00'"
        ).fetchone()[0]

        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE slot_waktu SET jam_mulai='08:00', jam_selesai='10:00' WHERE id=?",
                (slot_id,),
            )
        self.assertIn("SLOT_OVERLAP", str(ctx.exception))

    def test_update_waktu_non_overlapping_accepted(self):
        """UPDATE jam ke rentang non-overlapping harus diterima."""
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (1, '10:00', '12:00')"
        )
        self.conn.commit()
        slot_id = self.conn.execute(
            "SELECT id FROM slot_waktu WHERE hari=1 AND jam_mulai='10:00'"
        ).fetchone()[0]

        self.conn.execute(
            "UPDATE slot_waktu SET jam_mulai='12:00', jam_selesai='14:00' WHERE id=?",
            (slot_id,),
        )
        self.conn.commit()
        row = self.conn.execute("SELECT jam_mulai FROM slot_waktu WHERE id=?", (slot_id,)).fetchone()
        self.assertEqual("12:00", row[0])

    def test_update_waktu_self_no_change_accepted(self):
        """UPDATE slot diri sendiri tanpa mengubah rentang waktu tidak boleh tertolak."""
        slot_id = self.conn.execute("SELECT id FROM slot_waktu WHERE hari=1 AND jam_mulai='08:00'").fetchone()[0]
        self.conn.execute(
            "UPDATE slot_waktu SET jam_mulai='08:00', jam_selesai='10:00' WHERE id=?",
            (slot_id,),
        )
        self.conn.commit()

    def test_update_hari_causes_overlap_rejected(self):
        """UPDATE hari yang menyebabkan overlap di hari target harus ditolak (DEC-023)."""
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (2, '08:00', '10:00')"
        )
        self.conn.commit()
        slot_id = self.conn.execute(
            "SELECT id FROM slot_waktu WHERE hari=2 AND jam_mulai='08:00'"
        ).fetchone()[0]

        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE slot_waktu SET hari=1 WHERE id=?", (slot_id,)
            )
        self.assertIn("SLOT_OVERLAP", str(ctx.exception))

    def test_update_hari_non_overlapping_accepted(self):
        """UPDATE hari ke hari lain yang tidak memiliki slot overlap harus diterima."""
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (2, '08:00', '10:00')"
        )
        self.conn.commit()
        slot_id = self.conn.execute(
            "SELECT id FROM slot_waktu WHERE hari=2 AND jam_mulai='08:00'"
        ).fetchone()[0]

        self.conn.execute(
            "UPDATE slot_waktu SET hari=3 WHERE id=?", (slot_id,)
        )
        self.conn.commit()
        row = self.conn.execute("SELECT hari FROM slot_waktu WHERE id=?", (slot_id,)).fetchone()
        self.assertEqual(3, row[0])

    def test_reactivate_slot_causes_overlap_rejected(self):
        """Mengubah is_active dari 0 -> 1 pada slot yang overlap dengan slot aktif harus ditolak."""
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai, is_active) VALUES (1, '09:00', '11:00', 0)"
        )
        self.conn.commit()
        inactive_id = self.conn.execute(
            "SELECT id FROM slot_waktu WHERE hari=1 AND jam_mulai='09:00'"
        ).fetchone()[0]

        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE slot_waktu SET is_active=1 WHERE id=?", (inactive_id,)
            )
        self.assertIn("SLOT_OVERLAP", str(ctx.exception))

    def test_reactivate_slot_non_overlapping_accepted(self):
        """Mengubah is_active dari 0 -> 1 pada slot non-overlapping harus diterima."""
        self.conn.execute(
            "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai, is_active) VALUES (1, '12:00', '14:00', 0)"
        )
        self.conn.commit()
        inactive_id = self.conn.execute(
            "SELECT id FROM slot_waktu WHERE hari=1 AND jam_mulai='12:00'"
        ).fetchone()[0]

        self.conn.execute(
            "UPDATE slot_waktu SET is_active=1 WHERE id=?", (inactive_id,)
        )
        self.conn.commit()
        row = self.conn.execute("SELECT is_active FROM slot_waktu WHERE id=?", (inactive_id,)).fetchone()
        self.assertEqual(1, row[0])


# =============================================================================
# 7. Unique Constraints — Nama case-insensitive
# =============================================================================

class TestUniqueNameConstraints(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_mata_praktikum_nama_unique_case_insensitive(self):
        self.conn.execute("INSERT INTO mata_praktikum (nama) VALUES ('Algoritma')")
        self.conn.commit()
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute("INSERT INTO mata_praktikum (nama) VALUES ('ALGORITMA')")
        err_msg = str(ctx.exception)
        self.assertIn("UNIQUE constraint failed", err_msg)
        self.assertIn("mata_praktikum.nama", err_msg)

    def test_kelompok_nama_unique_case_insensitive(self):
        self.conn.execute(
            "INSERT INTO kelompok (nama, jumlah_peserta) VALUES ('Kelompok A', 10)"
        )
        self.conn.commit()
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO kelompok (nama, jumlah_peserta) VALUES ('kelompok a', 10)"
            )
        err_msg = str(ctx.exception)
        self.assertIn("UNIQUE constraint failed", err_msg)
        self.assertIn("kelompok.nama", err_msg)

    def test_laboratorium_nama_unique_case_insensitive(self):
        self.conn.execute(
            "INSERT INTO laboratorium (nama, kapasitas) VALUES ('Lab AI', 30)"
        )
        self.conn.commit()
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO laboratorium (nama, kapasitas) VALUES ('LAB AI', 30)"
            )
        err_msg = str(ctx.exception)
        self.assertIn("UNIQUE constraint failed", err_msg)
        self.assertIn("laboratorium.nama", err_msg)

    def test_asisten_nama_duplikat_diterima(self):
        """Nama asisten tidak wajib unik (DEC-025)."""
        self.conn.execute("INSERT INTO asisten (nama) VALUES ('Budi')")
        self.conn.execute("INSERT INTO asisten (nama) VALUES ('Budi')")  # duplikat OK
        self.conn.commit()
        cur = self.conn.execute("SELECT count(*) FROM asisten WHERE nama='Budi'")
        self.assertEqual(2, cur.fetchone()[0])

    def test_nama_empty_rejected(self):
        """nama kosong atau hanya spasi harus ditolak."""
        cases = [
            ("INSERT INTO mata_praktikum (nama) VALUES ('')", "chk_mata_nama_notempty"),
            ("INSERT INTO mata_praktikum (nama) VALUES ('   ')", "chk_mata_nama_notempty"),
            ("INSERT INTO kelompok (nama, jumlah_peserta) VALUES ('', 10)", "chk_kelompok_nama_notempty"),
            ("INSERT INTO asisten (nama) VALUES ('')", "chk_asisten_nama_notempty"),
            ("INSERT INTO laboratorium (nama, kapasitas) VALUES ('', 10)", "chk_lab_nama_notempty"),
        ]
        for sql, chk_name in cases:
            with self.subTest(sql=sql):
                with self.assertRaises(sqlite3.IntegrityError) as ctx:
                    self.conn.execute(sql)
                err_msg = str(ctx.exception)
                self.assertIn("CHECK constraint failed", err_msg)
                self.assertIn(chk_name, err_msg)


# =============================================================================
# 8. Foreign Key Enforcement
# =============================================================================

class TestForeignKeys(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()
        # Seed master dasar
        self.conn.execute("INSERT INTO mata_praktikum (id, nama) VALUES (1, 'MatA')")
        self.conn.execute("INSERT INTO kelompok (id, nama, jumlah_peserta) VALUES (1, 'KA', 10)")
        self.conn.execute("INSERT INTO asisten (id, nama) VALUES (1, 'AsA')")
        self.conn.execute("INSERT INTO slot_waktu (id, hari, jam_mulai, jam_selesai) VALUES (1, 1, '08:00', '10:00')")
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_praktikum_fk_mata_invalid_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO praktikum (mata_praktikum_id, kelompok_id, asisten_id) VALUES (999, 1, 1)"
            )
        self.assertIn("FOREIGN KEY constraint failed", str(ctx.exception))

    def test_praktikum_fk_kelompok_invalid_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO praktikum (mata_praktikum_id, kelompok_id, asisten_id) VALUES (1, 999, 1)"
            )
        self.assertIn("FOREIGN KEY constraint failed", str(ctx.exception))

    def test_praktikum_fk_asisten_invalid_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO praktikum (mata_praktikum_id, kelompok_id, asisten_id) VALUES (1, 1, 999)"
            )
        self.assertIn("FOREIGN KEY constraint failed", str(ctx.exception))

    def test_ketersediaan_kelompok_fk_slot_invalid_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO ketersediaan_kelompok (kelompok_id, slot_id) VALUES (1, 999)"
            )
        self.assertIn("FOREIGN KEY constraint failed", str(ctx.exception))

    def test_ketersediaan_asisten_fk_slot_invalid_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO ketersediaan_asisten (asisten_id, slot_id) VALUES (1, 999)"
            )
        self.assertIn("FOREIGN KEY constraint failed", str(ctx.exception))

    def test_valid_praktikum_accepted(self):
        self.conn.execute(
            "INSERT INTO praktikum (mata_praktikum_id, kelompok_id, asisten_id) VALUES (1, 1, 1)"
        )
        self.conn.commit()

    def test_valid_ketersediaan_accepted(self):
        self.conn.execute(
            "INSERT INTO ketersediaan_kelompok (kelompok_id, slot_id) VALUES (1, 1)"
        )
        self.conn.execute(
            "INSERT INTO ketersediaan_asisten (asisten_id, slot_id) VALUES (1, 1)"
        )
        self.conn.commit()

    def test_fk_restrict_delete_rejected(self):
        """ON DELETE RESTRICT: tidak bisa hapus master yang masih dirujuk."""
        self.conn.execute(
            "INSERT INTO praktikum (mata_praktikum_id, kelompok_id, asisten_id) VALUES (1, 1, 1)"
        )
        self.conn.commit()
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute("DELETE FROM kelompok WHERE id=1")
        self.assertIn("FOREIGN KEY constraint failed", str(ctx.exception))


# =============================================================================
# 9. versi_jadwal — Partial Unique Index & State Machine
# =============================================================================

class TestVersiJadwal(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def _insert_versi(self, status: str, src_rev: int = 0,
                       invalidated_at=None, archived_at=None) -> int:
        snap = minimal_snapshot()
        cur = self.conn.execute(
            """INSERT INTO versi_jadwal
               (status, source_revision, created_at, invalidated_at, archived_at, snapshot_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (status, src_rev, ts(), invalidated_at, archived_at, snap),
        )
        self.conn.commit()
        return cur.lastrowid

    def test_insert_active_version(self):
        vid = self._insert_versi("active")
        self.assertIsNotNone(vid)

    def test_only_one_active_version_allowed(self):
        """Partial unique index: maksimal satu active (DEC-021)."""
        self._insert_versi("active")
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_versi("active")
        self.assertIn("UNIQUE constraint failed", str(ctx.exception))

    def test_multiple_invalid_allowed(self):
        """Bisa ada banyak invalid."""
        self._insert_versi("invalid", invalidated_at=ts("001"))
        self._insert_versi("invalid", invalidated_at=ts("002"))
        cur = self.conn.execute(
            "SELECT count(*) FROM versi_jadwal WHERE status='invalid'"
        )
        self.assertEqual(2, cur.fetchone()[0])

    def test_multiple_archived_allowed(self):
        """Bisa ada banyak archived."""
        self._insert_versi("archived", archived_at=ts("001"))
        self._insert_versi("archived", archived_at=ts("002"))
        cur = self.conn.execute(
            "SELECT count(*) FROM versi_jadwal WHERE status='archived'"
        )
        self.assertEqual(2, cur.fetchone()[0])

    def test_active_to_invalid_transition_allowed(self):
        """active -> invalid harus diizinkan."""
        vid = self._insert_versi("active")
        self.conn.execute(
            "UPDATE versi_jadwal SET status='invalid', invalidated_at=? WHERE id=?",
            (ts("005"), vid),
        )
        self.conn.commit()
        row = self.conn.execute(
            "SELECT status FROM versi_jadwal WHERE id=?", (vid,)
        ).fetchone()
        self.assertEqual("invalid", row[0])

    def test_active_to_archived_transition_allowed(self):
        """active -> archived harus diizinkan."""
        vid = self._insert_versi("active")
        self.conn.execute(
            "UPDATE versi_jadwal SET status='archived', archived_at=? WHERE id=?",
            (ts("006"), vid),
        )
        self.conn.commit()
        row = self.conn.execute(
            "SELECT status FROM versi_jadwal WHERE id=?", (vid,)
        ).fetchone()
        self.assertEqual("archived", row[0])

    def test_invalid_to_active_rejected(self):
        """invalid -> active harus ditolak (terminal state)."""
        vid = self._insert_versi("invalid", invalidated_at=ts("001"))
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE versi_jadwal SET status='active', invalidated_at=NULL WHERE id=?",
                (vid,),
            )
        self.assertIn("VERSI_STATE", str(ctx.exception))

    def test_archived_to_active_rejected(self):
        """archived -> active harus ditolak (terminal state)."""
        vid = self._insert_versi("archived", archived_at=ts("001"))
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE versi_jadwal SET status='active', archived_at=NULL WHERE id=?",
                (vid,),
            )
        self.assertIn("VERSI_STATE", str(ctx.exception))

    def test_snapshot_json_immutable(self):
        """snapshot_json tidak dapat diubah setelah commit (DEC-019)."""
        vid = self._insert_versi("active")
        new_snap = json.dumps({"schema_version": 2, "source_revision": 99,
                               "generated_at": ts(), "saved_at": ts("001"),
                               "mata_praktikum": [], "kelompok": [], "asisten": [],
                               "laboratorium": [], "slot_waktu": [], "praktikum": [],
                               "assignments": []})
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE versi_jadwal SET snapshot_json=? WHERE id=?",
                (new_snap, vid),
            )
        self.assertIn("VERSI_IMMUTABLE", str(ctx.exception))

    def test_source_revision_immutable(self):
        """source_revision tidak dapat diubah setelah commit."""
        vid = self._insert_versi("active")
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE versi_jadwal SET source_revision=99 WHERE id=?", (vid,)
            )
        self.assertIn("VERSI_IMMUTABLE", str(ctx.exception))

    def test_created_at_immutable(self):
        """created_at tidak dapat diubah setelah commit."""
        vid = self._insert_versi("active")
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE versi_jadwal SET created_at=? WHERE id=?", (ts("999"), vid)
            )
        self.assertIn("VERSI_IMMUTABLE", str(ctx.exception))

    def test_status_coherence_active_no_terminal_timestamps(self):
        """active tidak boleh punya invalidated_at atau archived_at."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                """INSERT INTO versi_jadwal
                   (status, source_revision, created_at, invalidated_at, snapshot_json)
                   VALUES ('active', 0, ?, ?, ?)""",
                (ts(), ts("001"), minimal_snapshot()),
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_vj_status_coherence", err_msg)

    def test_status_coherence_invalid_needs_invalidated_at(self):
        """invalid harus punya invalidated_at (tidak boleh NULL)."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                """INSERT INTO versi_jadwal
                   (status, source_revision, created_at, snapshot_json)
                   VALUES ('invalid', 0, ?, ?)""",
                (ts(), minimal_snapshot()),
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_vj_status_coherence", err_msg)

    def test_snapshot_json_invalid_json_rejected(self):
        """snapshot_json harus JSON valid."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                """INSERT INTO versi_jadwal
                   (status, source_revision, created_at, snapshot_json)
                   VALUES ('active', 0, ?, 'bukan json')""",
                (ts(),),
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_vj_snapshot_valid", err_msg)

    def test_timestamp_format_invalid_rejected(self):
        """Timestamp dengan format salah harus ditolak."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                """INSERT INTO versi_jadwal
                   (status, source_revision, created_at, snapshot_json)
                   VALUES ('active', 0, '2026-10-18 08:30:00', ?)""",
                (minimal_snapshot(),),
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_vj_created_at_fmt", err_msg)


# =============================================================================
# 10. detail_jadwal — Immutabilitas dan Unique (versi_id, praktikum_id)
# =============================================================================

class TestDetailJadwal(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()
        # Buat versi_jadwal active
        self.conn.execute(
            """INSERT INTO versi_jadwal
               (id, status, source_revision, created_at, snapshot_json)
               VALUES (1, 'active', 0, ?, ?)""",
            (ts(), minimal_snapshot()),
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def _insert_detail(self, versi_id=1, praktikum_id=1, slot_id=10, lab_id=20) -> int:
        cur = self.conn.execute(
            """INSERT INTO detail_jadwal (versi_id, praktikum_id, slot_id, laboratorium_id)
               VALUES (?, ?, ?, ?)""",
            (versi_id, praktikum_id, slot_id, lab_id),
        )
        self.conn.commit()
        return cur.lastrowid

    def test_insert_detail_valid(self):
        did = self._insert_detail()
        self.assertIsNotNone(did)

    def test_unique_versi_praktikum(self):
        """(versi_id, praktikum_id) harus unik: satu kegiatan satu assignment per versi."""
        self._insert_detail(praktikum_id=1)
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_detail(praktikum_id=1, slot_id=11, lab_id=21)
        self.assertIn("UNIQUE constraint failed", str(ctx.exception))

    def test_immutable_after_insert(self):
        """detail_jadwal tidak dapat diubah setelah commit (DEC-019)."""
        did = self._insert_detail()
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE detail_jadwal SET slot_id=999 WHERE id=?", (did,)
            )
        self.assertIn("DETAIL_IMMUTABLE", str(ctx.exception))

    def test_fk_versi_invalid_rejected(self):
        """FK ke versi_jadwal harus valid."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                """INSERT INTO detail_jadwal (versi_id, praktikum_id, slot_id, laboratorium_id)
                   VALUES (9999, 1, 10, 20)"""
            )
        self.assertIn("FOREIGN KEY constraint failed", str(ctx.exception))

    def test_praktikum_id_bukan_fk_hidup(self):
        """praktikum_id bukan FK hidup — ID tidak ada di tabel praktikum harus DITERIMA."""
        self._insert_detail(praktikum_id=9999, slot_id=10, lab_id=20)


# =============================================================================
# 11. preview_jadwal — State Machine & Immutabilitas
# =============================================================================

class TestPreviewJadwal(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def _insert_preview(self, status: str = "ready",
                         consumed_at=None, terminal_at=None,
                         preview_id: str = "uuid-001",
                         src_rev: int = 0) -> str:
        created = "2026-10-18T08:00:00.000Z"
        expires = "2026-10-18T08:30:00.000Z"
        self.conn.execute(
            """INSERT INTO preview_jadwal
               (id, source_revision, hasil_json, snapshot_json,
                created_at, expires_at, consumed_at, terminal_at, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                preview_id, src_rev, minimal_hasil(), minimal_snapshot(),
                created, expires, consumed_at, terminal_at, status,
            ),
        )
        self.conn.commit()
        return preview_id

    def test_insert_ready_preview(self):
        pid = self._insert_preview("ready")
        self.assertIsNotNone(pid)

    def test_ready_to_consumed(self):
        pid = self._insert_preview("ready")
        t = ts("010")
        self.conn.execute(
            "UPDATE preview_jadwal SET status='consumed', consumed_at=?, terminal_at=? WHERE id=?",
            (t, t, pid),
        )
        self.conn.commit()

    def test_ready_to_expired(self):
        pid = self._insert_preview("ready")
        self.conn.execute(
            "UPDATE preview_jadwal SET status='expired', terminal_at=? WHERE id=?",
            (ts("011"), pid),
        )
        self.conn.commit()

    def test_ready_to_stale(self):
        pid = self._insert_preview("ready")
        self.conn.execute(
            "UPDATE preview_jadwal SET status='stale', terminal_at=? WHERE id=?",
            (ts("012"), pid),
        )
        self.conn.commit()

    def test_consumed_not_reversible(self):
        """consumed -> ready harus ditolak."""
        t = ts("010")
        pid = self._insert_preview("consumed", consumed_at=t, terminal_at=t)
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE preview_jadwal SET status='ready', consumed_at=NULL, terminal_at=NULL WHERE id=?",
                (pid,),
            )
        self.assertIn("PREVIEW_STATE", str(ctx.exception))

    def test_expired_not_reversible(self):
        pid = self._insert_preview("expired", terminal_at=ts("010"), preview_id="uuid-exp")
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE preview_jadwal SET status='ready', terminal_at=NULL WHERE id=?",
                (pid,),
            )
        self.assertIn("PREVIEW_STATE", str(ctx.exception))

    def test_stale_not_reversible(self):
        pid = self._insert_preview("stale", terminal_at=ts("010"), preview_id="uuid-stl")
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE preview_jadwal SET status='ready', terminal_at=NULL WHERE id=?",
                (pid,),
            )
        self.assertIn("PREVIEW_STATE", str(ctx.exception))

    def test_source_revision_immutable(self):
        pid = self._insert_preview("ready", preview_id="uuid-pay")
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE preview_jadwal SET source_revision=99 WHERE id=?", (pid,)
            )
        self.assertIn("PREVIEW_IMMUTABLE", str(ctx.exception))

    def test_hasil_json_immutable(self):
        pid = self._insert_preview("ready", preview_id="uuid-hsj")
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE preview_jadwal SET hasil_json=? WHERE id=?",
                ('{"status":"stale"}', pid),
            )
        self.assertIn("PREVIEW_IMMUTABLE", str(ctx.exception))

    def test_snapshot_json_immutable(self):
        pid = self._insert_preview("ready", preview_id="uuid-snp")
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE preview_jadwal SET snapshot_json=? WHERE id=?",
                ('{}', pid),
            )
        self.assertIn("PREVIEW_IMMUTABLE", str(ctx.exception))

    def test_created_at_immutable(self):
        pid = self._insert_preview("ready", preview_id="uuid-crt")
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE preview_jadwal SET created_at=? WHERE id=?",
                (ts("999"), pid),
            )
        self.assertIn("PREVIEW_IMMUTABLE", str(ctx.exception))

    def test_expires_at_immutable(self):
        pid = self._insert_preview("ready", preview_id="uuid-exp-imm")
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            self.conn.execute(
                "UPDATE preview_jadwal SET expires_at=? WHERE id=?",
                (ts("999"), pid),
            )
        self.assertIn("PREVIEW_IMMUTABLE", str(ctx.exception))

    def test_state_coherence_consumed_needs_both_timestamps(self):
        """consumed harus punya consumed_at = terminal_at."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_preview(
                "consumed", consumed_at=ts("001"), terminal_at=None, preview_id="uuid-bad"
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_preview_state_coherence", err_msg)

    def test_state_coherence_ready_no_terminal(self):
        """ready tidak boleh punya terminal_at."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self._insert_preview(
                "ready", terminal_at=ts("001"), preview_id="uuid-bad2"
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_preview_state_coherence", err_msg)

    def test_expires_gt_created(self):
        """expires_at harus setelah created_at."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                """INSERT INTO preview_jadwal
                   (id, source_revision, hasil_json, snapshot_json,
                    created_at, expires_at, status)
                   VALUES ('uuid-bad3', 0, ?, ?, ?, ?, 'ready')""",
                (
                    minimal_hasil(), minimal_snapshot(),
                    "2026-10-18T08:30:00.000Z",  # created
                    "2026-10-18T08:00:00.000Z",  # expires BEFORE created
                ),
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_preview_expires_gt_created", err_msg)

    def test_invalid_json_rejected(self):
        """hasil_json harus JSON valid."""
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                """INSERT INTO preview_jadwal
                   (id, source_revision, hasil_json, snapshot_json,
                    created_at, expires_at, status)
                   VALUES ('uuid-bad4', 0, 'bukan-json', ?, ?, ?, 'ready')""",
                (
                    minimal_snapshot(),
                    "2026-10-18T08:00:00.000Z",
                    "2026-10-18T08:30:00.000Z",
                ),
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_preview_hasil", err_msg)


# =============================================================================
# 12. system_metadata — Constraint & Idempoten
# =============================================================================

class TestSystemMetadata(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_key_empty_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute("INSERT INTO system_metadata (key, value) VALUES ('', 0)")
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_meta_key_notempty", err_msg)

    def test_key_whitespace_only_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO system_metadata (key, value) VALUES ('   ', 0)"
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_meta_key_notempty", err_msg)

    def test_value_negative_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError) as ctx:
            self.conn.execute(
                "INSERT INTO system_metadata (key, value) VALUES ('other_key', -1)"
            )
        err_msg = str(ctx.exception)
        self.assertIn("CHECK constraint failed", err_msg)
        self.assertIn("chk_meta_value_int_ge0", err_msg)

    def test_value_zero_accepted(self):
        self.conn.execute(
            "INSERT INTO system_metadata (key, value) VALUES ('other_counter', 0)"
        )
        self.conn.commit()

    def test_source_revision_seeded(self):
        cur = self.conn.execute(
            "SELECT value FROM system_metadata WHERE key='source_revision'"
        )
        self.assertEqual(0, cur.fetchone()[0])

    def test_no_op_does_not_change_revision(self):
        """UPDATE ke nilai yang sama tidak seharusnya mengubah revision."""
        self.conn.execute(
            "UPDATE system_metadata SET value=0 WHERE key='source_revision'"
        )
        self.conn.commit()
        cur = self.conn.execute(
            "SELECT value FROM system_metadata WHERE key='source_revision'"
        )
        self.assertEqual(0, cur.fetchone()[0])


# =============================================================================
# 13. Skenario integrasi — Alur data lengkap
# =============================================================================

class TestIntegrationScenarios(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def _seed_master(self):
        """Seed satu set data master aktif."""
        self.conn.execute("INSERT INTO mata_praktikum (id, nama) VALUES (1, 'Pemrograman Logika')")
        self.conn.execute(
            "INSERT INTO kelompok (id, nama, jumlah_peserta) VALUES (1, 'Kelompok A', 28)"
        )
        self.conn.execute("INSERT INTO asisten (id, nama) VALUES (1, 'Asisten Satu')")
        self.conn.execute(
            "INSERT INTO laboratorium (id, nama, kapasitas) VALUES (1, 'Lab AI', 30)"
        )
        self.conn.execute(
            "INSERT INTO slot_waktu (id, hari, jam_mulai, jam_selesai) VALUES (1, 1, '08:00', '10:00')"
        )
        self.conn.execute(
            "INSERT INTO praktikum (id, mata_praktikum_id, kelompok_id, asisten_id) VALUES (1, 1, 1, 1)"
        )
        self.conn.execute(
            "INSERT INTO ketersediaan_kelompok (kelompok_id, slot_id) VALUES (1, 1)"
        )
        self.conn.execute(
            "INSERT INTO ketersediaan_asisten (asisten_id, slot_id) VALUES (1, 1)"
        )
        self.conn.commit()

    def test_full_master_insertion(self):
        """Semua data master dapat dimasukkan tanpa error."""
        self._seed_master()
        for tbl in ["mata_praktikum", "kelompok", "asisten", "laboratorium",
                    "slot_waktu", "praktikum"]:
            cur = self.conn.execute(f"SELECT count(*) FROM {tbl}")
            self.assertEqual(1, cur.fetchone()[0], f"Tabel {tbl} tidak punya 1 baris")

    def test_save_schedule_flow(self):
        """Alur simpan jadwal: buat versi active dengan detail."""
        self._seed_master()

        snap = minimal_snapshot()
        # 1. Sisipkan versi active
        self.conn.execute(
            """INSERT INTO versi_jadwal
               (id, status, source_revision, created_at, snapshot_json)
               VALUES (1, 'active', 0, ?, ?)""",
            (ts(), snap),
        )
        # 2. Sisipkan detail (ID historis, tidak perlu FK hidup)
        self.conn.execute(
            """INSERT INTO detail_jadwal (versi_id, praktikum_id, slot_id, laboratorium_id)
               VALUES (1, 1, 1, 1)"""
        )
        self.conn.commit()

        # 3. Periksa satu active
        cur = self.conn.execute("SELECT count(*) FROM versi_jadwal WHERE status='active'")
        self.assertEqual(1, cur.fetchone()[0])

    def test_save_second_version_archives_first(self):
        """Menyimpan versi baru harus mengarsipkan versi active lama."""
        self._seed_master()
        snap = minimal_snapshot()

        # Versi pertama
        self.conn.execute(
            """INSERT INTO versi_jadwal (id, status, source_revision, created_at, snapshot_json)
               VALUES (1, 'active', 0, ?, ?)""", (ts("001"), snap),
        )
        self.conn.commit()

        # Archive versi pertama -> buat versi kedua
        self.conn.execute(
            "UPDATE versi_jadwal SET status='archived', archived_at=? WHERE id=1",
            (ts("002"),),
        )
        self.conn.execute(
            """INSERT INTO versi_jadwal (id, status, source_revision, created_at, snapshot_json)
               VALUES (2, 'active', 1, ?, ?)""", (ts("003"), snap),
        )
        self.conn.commit()

        cur = self.conn.execute("SELECT count(*) FROM versi_jadwal WHERE status='active'")
        self.assertEqual(1, cur.fetchone()[0])
        cur = self.conn.execute("SELECT count(*) FROM versi_jadwal WHERE status='archived'")
        self.assertEqual(1, cur.fetchone()[0])

    def test_invalid_version_stays_invalid_after_new_save(self):
        """Versi invalid tidak berubah ketika ada versi baru disimpan (DEC-016)."""
        snap = minimal_snapshot()
        self.conn.execute(
            """INSERT INTO versi_jadwal (id, status, source_revision, created_at, invalidated_at, snapshot_json)
               VALUES (1, 'invalid', 0, ?, ?, ?)""",
            (ts("001"), ts("002"), snap),
        )
        self.conn.execute(
            """INSERT INTO versi_jadwal (id, status, source_revision, created_at, snapshot_json)
               VALUES (2, 'active', 1, ?, ?)""",
            (ts("003"), snap),
        )
        self.conn.commit()

        cur = self.conn.execute(
            "SELECT status FROM versi_jadwal WHERE id=1"
        )
        self.assertEqual("invalid", cur.fetchone()[0])

    def test_source_revision_increment(self):
        """Simulasi increment source_revision tepat satu kali per transaksi."""
        cur = self.conn.execute(
            "SELECT value FROM system_metadata WHERE key='source_revision'"
        )
        self.assertEqual(0, cur.fetchone()[0])

        # Increment
        self.conn.execute(
            "UPDATE system_metadata SET value=value+1 WHERE key='source_revision'"
        )
        self.conn.commit()

        cur = self.conn.execute(
            "SELECT value FROM system_metadata WHERE key='source_revision'"
        )
        self.assertEqual(1, cur.fetchone()[0])

    def test_ketersediaan_allowlist_semantics(self):
        """Tidak ada baris ketersediaan = tidak tersedia; ada baris = tersedia."""
        self._seed_master()
        # Kelompok 1 tersedia di slot 1 (sudah di-seed)
        cur = self.conn.execute(
            "SELECT count(*) FROM ketersediaan_kelompok WHERE kelompok_id=1 AND slot_id=1"
        )
        self.assertEqual(1, cur.fetchone()[0])
        # Kelompok 1 tidak tersedia di slot 99 (tidak ada baris)
        cur = self.conn.execute(
            "SELECT count(*) FROM ketersediaan_kelompok WHERE kelompok_id=1 AND slot_id=99"
        )
        self.assertEqual(0, cur.fetchone()[0])


# =============================================================================
# 14. Rollback integritas transaksi
# =============================================================================

class TestTransactionRollback(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_rollback_does_not_leave_partial_state(self):
        """Jika salah satu insert dalam transaksi gagal, seluruhnya rollback."""
        snap = minimal_snapshot()
        try:
            with self.conn:  # context manager auto-rollback on exception
                # Insert versi valid
                self.conn.execute(
                    """INSERT INTO versi_jadwal
                       (id, status, source_revision, created_at, snapshot_json)
                       VALUES (1, 'active', 0, ?, ?)""",
                    (ts(), snap),
                )
                # Insert versi KEDUA dengan status 'active' — harus gagal
                self.conn.execute(
                    """INSERT INTO versi_jadwal
                       (id, status, source_revision, created_at, snapshot_json)
                       VALUES (2, 'active', 0, ?, ?)""",
                    (ts("001"), snap),
                )
        except Exception:
            pass  # rollback terjadi

        # Tidak ada baris versi_jadwal setelah rollback
        cur = self.conn.execute("SELECT count(*) FROM versi_jadwal")
        self.assertEqual(0, cur.fetchone()[0])


# =============================================================================
# Entry point
# =============================================================================

if __name__ == "__main__":
    unittest.main(verbosity=2)
