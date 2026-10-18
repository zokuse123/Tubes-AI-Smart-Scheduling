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

from backend.db.init_db import get_connection, migrate_master_tables_if_needed

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
        """Semua 11 trigger wajib ada (5 trigger operasional/riwayat + 6 trigger immutabilitas created_at)."""
        expected_triggers = {
            "trg_slot_no_overlap_insert",
            "trg_slot_no_overlap_update",
            "trg_versi_jadwal_immutable",
            "trg_detail_jadwal_immutable",
            "trg_preview_immutable",
            "trg_mata_created_at_immutable",
            "trg_kelompok_created_at_immutable",
            "trg_asisten_created_at_immutable",
            "trg_lab_created_at_immutable",
            "trg_slot_created_at_immutable",
            "trg_praktikum_created_at_immutable",
        }
        cur = self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='trigger'"
        )
        actual = {row[0] for row in cur.fetchall()}
        missing = expected_triggers - actual
        self.assertFalse(missing, f"Trigger tidak ditemukan: {missing}")
        self.assertEqual(11, len(actual), f"Total trigger tidak 11: {len(actual)}")

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
# 15. DEC-060: Timestamp Master, Immutabilitas, dan Migrasi Idempoten
# =============================================================================

class TestMasterTimestamps(unittest.TestCase):
    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_master_tables_default_timestamps(self):
        """Insert tanpa menyertakan created_at/updated_at harus otomatis terisi RFC 3339 UTC 24 karakter."""
        self.conn.execute("INSERT INTO mata_praktikum (nama) VALUES ('AI')")
        self.conn.execute("INSERT INTO kelompok (nama, jumlah_peserta) VALUES ('K1', 20)")
        self.conn.execute("INSERT INTO asisten (nama) VALUES ('A1')")
        self.conn.execute("INSERT INTO laboratorium (nama, kapasitas) VALUES ('L1', 30)")
        self.conn.execute("INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (1, '08:00', '10:00')")
        self.conn.execute("INSERT INTO praktikum (mata_praktikum_id, kelompok_id, asisten_id) VALUES (1, 1, 1)")
        self.conn.commit()

        tables = ["mata_praktikum", "kelompok", "asisten", "laboratorium", "slot_waktu", "praktikum"]
        for tbl in tables:
            with self.subTest(table=tbl):
                row = self.conn.execute(f"SELECT created_at, updated_at FROM {tbl} WHERE id=1").fetchone()
                c_at, u_at = row["created_at"], row["updated_at"]
                self.assertEqual(24, len(c_at), f"{tbl}.created_at length salah")
                self.assertEqual(24, len(u_at), f"{tbl}.updated_at length salah")
                self.assertEqual("T", c_at[10])
                self.assertEqual("Z", c_at[23])
                self.assertEqual("T", u_at[10])
                self.assertEqual("Z", u_at[23])

    def test_master_created_at_immutable(self):
        """created_at pada seluruh 6 tabel master tidak boleh dapat diubah (DEC-060)."""
        self.conn.execute("INSERT INTO mata_praktikum (id, nama) VALUES (1, 'AI')")
        self.conn.execute("INSERT INTO kelompok (id, nama, jumlah_peserta) VALUES (1, 'K1', 20)")
        self.conn.execute("INSERT INTO asisten (id, nama) VALUES (1, 'A1')")
        self.conn.execute("INSERT INTO laboratorium (id, nama, kapasitas) VALUES (1, 'L1', 30)")
        self.conn.execute("INSERT INTO slot_waktu (id, hari, jam_mulai, jam_selesai) VALUES (1, 1, '08:00', '10:00')")
        self.conn.execute("INSERT INTO praktikum (id, mata_praktikum_id, kelompok_id, asisten_id) VALUES (1, 1, 1, 1)")
        self.conn.commit()

        cases = [
            ("UPDATE mata_praktikum SET created_at='2026-10-18T00:00:00.000Z' WHERE id=1", "MATA_IMMUTABLE"),
            ("UPDATE kelompok SET created_at='2026-10-18T00:00:00.000Z' WHERE id=1", "KELOMPOK_IMMUTABLE"),
            ("UPDATE asisten SET created_at='2026-10-18T00:00:00.000Z' WHERE id=1", "ASISTEN_IMMUTABLE"),
            ("UPDATE laboratorium SET created_at='2026-10-18T00:00:00.000Z' WHERE id=1", "LAB_IMMUTABLE"),
            ("UPDATE slot_waktu SET created_at='2026-10-18T00:00:00.000Z' WHERE id=1", "SLOT_IMMUTABLE"),
            ("UPDATE praktikum SET created_at='2026-10-18T00:00:00.000Z' WHERE id=1", "PRAKTIKUM_IMMUTABLE"),
        ]
        for sql, expected_tag in cases:
            with self.subTest(sql=sql):
                with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
                    self.conn.execute(sql)
                self.assertIn(expected_tag, str(ctx.exception))

    def test_master_timestamp_format_invalid_rejected(self):
        """Format timestamp non-RFC-3339 atau panjang salah harus ditolak CHECK constraint."""
        bad_timestamps = [
            "2026-10-18 08:30:00",
            "2026-10-18T08:30:00Z",
            "2026-10-18T08:30:00.00Z",
            "not-a-timestamp",
            "2026-04-31T12:00:00.000Z",  # Tanggal fiktif: April hanya 30 hari
            "2026-02-29T12:00:00.000Z",  # 2026 bukan tahun kabisat
            "2026-00-01T12:00:00.000Z",  # Bulan 00
            "2026-13-01T12:00:00.000Z",  # Bulan 13
            "2026-05-00T12:00:00.000Z",  # Hari 00
            "2026-05-32T12:00:00.000Z",  # Hari 32
            "2026-05-01T24:00:00.000Z",  # Jam 24
            "2026-05-01T23:60:00.000Z",  # Menit 60
            "2026-05-01T23:00:60.000Z",  # Detik 60
            "2026-05-01T23:00:00.123+07:00",  # Offset selain Z
            "2026-05-01 23:00:00.000Z",  # Spasi bukan T
            "2026-05-01T23:00:00,000Z",  # Koma bukan titik
            "2026-05-01T23:00:00.ABCZ",  # Huruf pada milidetik
            "2026-5-1T23:0:0.0Z",        # Format non-canonical
            "ABCD-EF-GHTIJ:KL:MN.OPQZ",  # String huruf acak
        ]
        for bad_ts in bad_timestamps:
            with self.subTest(bad_ts=bad_ts):
                with self.assertRaises(sqlite3.IntegrityError) as ctx:
                    self.conn.execute(
                        "INSERT INTO mata_praktikum (nama, created_at, updated_at) VALUES (?, ?, ?)",
                        (f"Mata_{bad_ts[:5]}", bad_ts, ts()),
                    )
                self.assertIn("chk_mata_created_fmt", str(ctx.exception))

                with self.assertRaises(sqlite3.IntegrityError) as ctx:
                    self.conn.execute(
                        "INSERT INTO mata_praktikum (nama, created_at, updated_at) VALUES (?, ?, ?)",
                        (f"Mata2_{bad_ts[:5]}", ts(), bad_ts),
                    )
                self.assertIn("chk_mata_updated_fmt", str(ctx.exception))

    def test_migration_table_rebuild_from_old_schema(self):
        """Database lama tanpa created_at/updated_at dimigrasi transaksional via table rebuild tanpa kehilangan data."""
        # Buat database in-memory dengan tabel lama (tanpa created_at dan updated_at)
        old_conn = sqlite3.connect(":memory:")
        old_conn.execute("PRAGMA foreign_keys = ON")
        old_conn.row_factory = sqlite3.Row

        # Buat skema lama
        old_conn.execute("""CREATE TABLE mata_praktikum (
            id INTEGER PRIMARY KEY, nama TEXT COLLATE NOCASE NOT NULL UNIQUE, is_active INTEGER NOT NULL DEFAULT 1
        )""")
        old_conn.execute("""CREATE TABLE kelompok (
            id INTEGER PRIMARY KEY, nama TEXT COLLATE NOCASE NOT NULL UNIQUE, jumlah_peserta INTEGER NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
        )""")
        old_conn.execute("""CREATE TABLE asisten (
            id INTEGER PRIMARY KEY, nama TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
        )""")
        old_conn.execute("""CREATE TABLE laboratorium (
            id INTEGER PRIMARY KEY, nama TEXT COLLATE NOCASE NOT NULL UNIQUE, kapasitas INTEGER NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
        )""")
        old_conn.execute("""CREATE TABLE slot_waktu (
            id INTEGER PRIMARY KEY, hari INTEGER NOT NULL, jam_mulai TEXT NOT NULL, jam_selesai TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
            UNIQUE (hari, jam_mulai, jam_selesai)
        )""")
        old_conn.execute("""CREATE TABLE praktikum (
            id INTEGER PRIMARY KEY, mata_praktikum_id INTEGER NOT NULL REFERENCES mata_praktikum(id),
            kelompok_id INTEGER NOT NULL REFERENCES kelompok(id), asisten_id INTEGER NOT NULL REFERENCES asisten(id),
            is_active INTEGER NOT NULL DEFAULT 1
        )""")
        old_conn.execute("""CREATE TABLE ketersediaan_kelompok (
            kelompok_id INTEGER NOT NULL REFERENCES kelompok(id), slot_id INTEGER NOT NULL REFERENCES slot_waktu(id),
            PRIMARY KEY (kelompok_id, slot_id)
        )""")

        # Isi data lama
        old_conn.execute("INSERT INTO mata_praktikum (id, nama) VALUES (1, 'Old Mata')")
        old_conn.execute("INSERT INTO kelompok (id, nama, jumlah_peserta) VALUES (1, 'Old Kelompok', 25)")
        old_conn.execute("INSERT INTO asisten (id, nama) VALUES (1, 'Old Asisten')")
        old_conn.execute("INSERT INTO laboratorium (id, nama, kapasitas) VALUES (1, 'Old Lab', 35)")
        old_conn.execute("INSERT INTO slot_waktu (id, hari, jam_mulai, jam_selesai) VALUES (1, 1, '08:00', '10:00')")
        old_conn.execute("INSERT INTO praktikum (id, mata_praktikum_id, kelompok_id, asisten_id) VALUES (1, 1, 1, 1)")
        old_conn.execute("INSERT INTO ketersediaan_kelompok (kelompok_id, slot_id) VALUES (1, 1)")
        old_conn.commit()

        # Jalankan migrasi table rebuild
        migrated = migrate_master_tables_if_needed(old_conn)
        self.assertTrue(migrated, "Migrasi harus dijalankan untuk tabel lama")

        # Verifikasi seluruh data lama tetap utuh
        row_m = old_conn.execute("SELECT * FROM mata_praktikum WHERE id=1").fetchone()
        self.assertEqual("Old Mata", row_m["nama"])
        self.assertEqual(24, len(row_m["created_at"]))
        self.assertEqual(24, len(row_m["updated_at"]))

        row_k = old_conn.execute("SELECT * FROM kelompok WHERE id=1").fetchone()
        self.assertEqual("Old Kelompok", row_k["nama"])
        self.assertEqual(25, row_k["jumlah_peserta"])

        row_p = old_conn.execute("SELECT * FROM praktikum WHERE id=1").fetchone()
        self.assertEqual(1, row_p["mata_praktikum_id"])
        self.assertEqual(1, row_p["kelompok_id"])
        self.assertEqual(1, row_p["asisten_id"])

        # Verifikasi integritas relasi foreign key
        fk_check = old_conn.execute("PRAGMA foreign_key_check").fetchall()
        self.assertEqual([], fk_check, f"Ada pelanggaran foreign key: {fk_check}")

        # Verifikasi idempoten: jalankan ulang migrasi, harus mengembalikan False
        migrated_again = migrate_master_tables_if_needed(old_conn)
        self.assertFalse(migrated_again, "Migrasi kedua harus no-op (idempoten)")
        old_conn.close()

    def test_master_updated_at_can_be_updated(self):
        """updated_at dapat diperbarui (berbeda dengan created_at yang immutable)."""
        self.conn.execute("INSERT INTO mata_praktikum (id, nama) VALUES (1, 'AI')")
        self.conn.commit()

        new_updated_at = ts("999")
        self.conn.execute("UPDATE mata_praktikum SET updated_at=? WHERE id=1", (new_updated_at,))
        self.conn.commit()

        row = self.conn.execute("SELECT updated_at FROM mata_praktikum WHERE id=1").fetchone()
        self.assertEqual(new_updated_at, row[0])

    def test_strict_calendar_leap_year_valid_accepted(self):
        """Tanggal 29 Februari pada tahun kabisat (2024) harus diterima oleh CHECK constraint."""
        leap_ts = "2024-02-29T12:00:00.000Z"
        self.conn.execute(
            "INSERT INTO mata_praktikum (nama, created_at, updated_at) VALUES ('Kabisat Valid', ?, ?)",
            (leap_ts, leap_ts),
        )
        self.conn.commit()
        row = self.conn.execute("SELECT created_at FROM mata_praktikum WHERE nama='Kabisat Valid'").fetchone()
        self.assertEqual(leap_ts, row[0])

    def test_migration_preserves_indexes_and_triggers(self):
        """Migrasi table rebuild harus mempertahankan seluruh index dan trigger (termasuk trigger overlap)."""
        old_conn = sqlite3.connect(":memory:")
        old_conn.execute("PRAGMA foreign_keys = ON")
        old_conn.row_factory = sqlite3.Row

        old_conn.execute("""CREATE TABLE slot_waktu (
            id INTEGER PRIMARY KEY, hari INTEGER NOT NULL, jam_mulai TEXT NOT NULL, jam_selesai TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
            UNIQUE (hari, jam_mulai, jam_selesai)
        )""")
        old_conn.execute("INSERT INTO slot_waktu (id, hari, jam_mulai, jam_selesai) VALUES (1, 1, '08:00', '10:00')")
        old_conn.commit()

        # Jalankan migrasi
        migrate_master_tables_if_needed(old_conn)

        # 1. Verifikasi index idx_slot_waktu_hari_aktif ada
        cur = old_conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_slot_waktu_hari_aktif'")
        self.assertIsNotNone(cur.fetchone(), "Index idx_slot_waktu_hari_aktif harus ada setelah migrasi")

        # 2. Verifikasi trigger overlap aktif menolak INSERT slot overlap
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            old_conn.execute(
                "INSERT INTO slot_waktu (hari, jam_mulai, jam_selesai) VALUES (1, '09:00', '11:00')"
            )
        self.assertIn("SLOT_OVERLAP", str(ctx.exception))

        # 3. Verifikasi trigger immutability menolak perubahan created_at
        with self.assertRaises((sqlite3.OperationalError, sqlite3.IntegrityError)) as ctx:
            old_conn.execute(
                "UPDATE slot_waktu SET created_at='2026-01-01T00:00:00.000Z' WHERE id=1"
            )
        self.assertIn("SLOT_IMMUTABLE", str(ctx.exception))

        # 4. Pastikan tidak ada tabel sementara _mig_* yang tertinggal
        cur = old_conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_mig_%'")
        self.assertEqual([], cur.fetchall(), "Tidak boleh ada tabel _mig_* tertinggal")
        old_conn.close()

    def test_partial_migration_preserves_existing_created_at(self):
        """Jika tabel lama sudah memiliki created_at valid, migrasi tidak boleh menimpa nilainya dengan migration_ts."""
        old_conn = sqlite3.connect(":memory:")
        old_conn.execute("PRAGMA foreign_keys = ON")
        old_conn.row_factory = sqlite3.Row

        # Tabel dengan created_at tetapi TANPA updated_at
        old_conn.execute("""CREATE TABLE mata_praktikum (
            id INTEGER PRIMARY KEY, nama TEXT COLLATE NOCASE NOT NULL UNIQUE, is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )""")
        historical_ts = "2025-05-10T08:00:00.000Z"
        old_conn.execute("INSERT INTO mata_praktikum (id, nama, is_active, created_at) VALUES (1, 'Histori Mata', 1, ?)", (historical_ts,))
        old_conn.commit()

        # Jalankan migrasi
        migrated = migrate_master_tables_if_needed(old_conn)
        self.assertTrue(migrated, "Migrasi harus dijalankan untuk tabel parsial")

        row = old_conn.execute("SELECT * FROM mata_praktikum WHERE id=1").fetchone()
        self.assertEqual(historical_ts, row["created_at"], "created_at lama harus dipertahankan secara utuh")
        self.assertNotEqual(historical_ts, row["updated_at"], "updated_at harus diisi migration_ts")
        self.assertEqual(24, len(row["updated_at"]))
        old_conn.close()

    def test_partial_migration_preserves_existing_updated_at(self):
        """Jika tabel lama sudah memiliki updated_at valid tetapi tidak ada created_at, migrasi mempertahankannya."""
        old_conn = sqlite3.connect(":memory:")
        old_conn.execute("PRAGMA foreign_keys = ON")
        old_conn.row_factory = sqlite3.Row

        old_conn.execute("""CREATE TABLE kelompok (
            id INTEGER PRIMARY KEY, nama TEXT COLLATE NOCASE NOT NULL UNIQUE, jumlah_peserta INTEGER NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        )""")
        historical_updated = "2025-06-15T09:30:00.000Z"
        old_conn.execute("INSERT INTO kelompok (id, nama, jumlah_peserta, is_active, updated_at) VALUES (1, 'K-Histori', 30, 1, ?)", (historical_updated,))
        old_conn.commit()

        migrated = migrate_master_tables_if_needed(old_conn)
        self.assertTrue(migrated, "Migrasi harus dijalankan")

        row = old_conn.execute("SELECT * FROM kelompok WHERE id=1").fetchone()
        self.assertEqual(historical_updated, row["updated_at"], "updated_at lama harus dipertahankan")
        self.assertEqual(24, len(row["created_at"]), "created_at harus diisi migration_ts")
        old_conn.close()

    def test_migration_preserves_source_revision_and_historical_snapshots(self):
        """Migrasi tidak boleh mengubah nilai source_revision atau isi tabel snapshot versi/detail."""
        old_conn = sqlite3.connect(":memory:")
        old_conn.execute("PRAGMA foreign_keys = ON")
        old_conn.row_factory = sqlite3.Row

        # Setup skema lama dan metadata
        old_conn.execute("CREATE TABLE system_metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL)")
        old_conn.execute("INSERT INTO system_metadata VALUES ('source_revision', 42)")

        old_conn.execute("""CREATE TABLE mata_praktikum (
            id INTEGER PRIMARY KEY, nama TEXT COLLATE NOCASE NOT NULL UNIQUE, is_active INTEGER NOT NULL DEFAULT 1
        )""")
        old_conn.execute("INSERT INTO mata_praktikum VALUES (1, 'Mata 1', 1)")

        # Tabel snapshot historis
        old_conn.execute("""CREATE TABLE versi_jadwal (
            id INTEGER PRIMARY KEY, status TEXT, source_revision INTEGER, created_at TEXT, snapshot_json TEXT
        )""")
        snap_content = '{"schema_version": 1, "data": "histori"}'
        old_conn.execute(
            "INSERT INTO versi_jadwal VALUES (1, 'active', 42, '2025-01-01T00:00:00.000Z', ?)",
            (snap_content,),
        )
        old_conn.commit()

        # Jalankan migrasi
        migrate_master_tables_if_needed(old_conn)

        # Verifikasi source_revision tetap 42
        rev = old_conn.execute("SELECT value FROM system_metadata WHERE key='source_revision'").fetchone()[0]
        self.assertEqual(42, rev, "source_revision tidak boleh berubah setelah migrasi")

        # Verifikasi snapshot historis tetap utuh
        v_row = old_conn.execute("SELECT * FROM versi_jadwal WHERE id=1").fetchone()
        self.assertEqual(42, v_row["source_revision"])
        self.assertEqual(snap_content, v_row["snapshot_json"])
        old_conn.close()

    def test_migration_atomic_rollback_on_fk_violation(self):
        """Jika terjadi pelanggaran foreign key setelah rebuild, transaksi harus rollback tanpa meninggalkan _mig_*."""
        old_conn = sqlite3.connect(":memory:")
        old_conn.execute("PRAGMA foreign_keys = ON")
        old_conn.row_factory = sqlite3.Row

        old_conn.execute("""CREATE TABLE mata_praktikum (
            id INTEGER PRIMARY KEY, nama TEXT COLLATE NOCASE NOT NULL UNIQUE, is_active INTEGER NOT NULL DEFAULT 1
        )""")
        old_conn.execute("""CREATE TABLE kelompok (
            id INTEGER PRIMARY KEY, nama TEXT COLLATE NOCASE NOT NULL UNIQUE, jumlah_peserta INTEGER NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
        )""")
        old_conn.execute("""CREATE TABLE asisten (
            id INTEGER PRIMARY KEY, nama TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
        )""")
        old_conn.execute("""CREATE TABLE praktikum (
            id INTEGER PRIMARY KEY, mata_praktikum_id INTEGER NOT NULL REFERENCES mata_praktikum(id),
            kelompok_id INTEGER NOT NULL REFERENCES kelompok(id), asisten_id INTEGER NOT NULL REFERENCES asisten(id),
            is_active INTEGER NOT NULL DEFAULT 1
        )""")

        old_conn.execute("INSERT INTO mata_praktikum VALUES (1, 'Mata 1', 1)")
        old_conn.execute("INSERT INTO kelompok VALUES (1, 'Kelompok 1', 20, 1)")
        old_conn.execute("INSERT INTO asisten VALUES (1, 'Asisten 1', 1)")
        old_conn.commit()
        # Masukkan referensi rusak dengan mematikan FK sementara di luar transaksi
        old_conn.execute("PRAGMA foreign_keys = OFF")
        old_conn.execute("INSERT INTO praktikum VALUES (1, 999, 1, 1, 1)")
        old_conn.commit()
        old_conn.execute("PRAGMA foreign_keys = ON")

        # Migrasi harus gagal saat foreign_key_check dan melakukan rollback
        with self.assertRaises(RuntimeError) as ctx:
            migrate_master_tables_if_needed(old_conn)
        self.assertIn("Foreign key check gagal", str(ctx.exception))

        # Verifikasi tidak ada tabel _mig_* tertinggal
        cur = old_conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_mig_%'")
        self.assertEqual([], cur.fetchall())
    def test_migration_atomic_rollback_on_post_ddl_failure(self):
        """Jika pembuatan ulang index/trigger gagal setelah table swap, transaksi harus rollback dan memulihkan tabel lama."""
        import backend.db.init_db as init_db_module

        old_conn = sqlite3.connect(":memory:")
        old_conn.execute("PRAGMA foreign_keys = ON")
        old_conn.row_factory = sqlite3.Row

        old_conn.execute("CREATE TABLE mata_praktikum (id INTEGER PRIMARY KEY, nama TEXT, is_active INTEGER NOT NULL DEFAULT 1)")
        old_conn.execute("INSERT INTO mata_praktikum VALUES (1, 'Mata Asli', 1)")
        old_conn.commit()

        # Simulasikan kegagalan DDL index/trigger dengan memasukkan DDL sintaks rusak sementara
        original_ddls = list(init_db_module.REBUILD_POST_DDLS["mata_praktikum"])
        init_db_module.REBUILD_POST_DDLS["mata_praktikum"].append("CREATE TRIGGER trg_sengaja_rusak SINTAKS SALAH")
        try:
            with self.assertRaises(sqlite3.OperationalError):
                init_db_module.migrate_master_tables_if_needed(old_conn)
        finally:
            init_db_module.REBUILD_POST_DDLS["mata_praktikum"] = original_ddls

        # Verifikasi rollback sukses: tabel lama dan baris aslinya tetap utuh, kolom created_at belum ada
        cur = old_conn.execute("PRAGMA table_info(mata_praktikum)")
        cols = {row[1] for row in cur.fetchall()}
        self.assertNotIn("created_at", cols, "Kolom created_at tidak boleh ada karena transaksi di-rollback")

        row = old_conn.execute("SELECT * FROM mata_praktikum WHERE id=1").fetchone()
        self.assertEqual("Mata Asli", row["nama"], "Data lama harus tetap utuh sempurna setelah rollback")

        # Verifikasi tidak ada tabel temporary _mig_* tertinggal
        cur = old_conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_mig_%'")
        self.assertEqual([], cur.fetchall())
        old_conn.close()

    def test_migration_rollback_on_failure(self):
        """Jika terjadi error saat rebuild table, transaksi harus rollback tanpa merusak database."""
        old_conn = sqlite3.connect(":memory:")
        old_conn.execute("PRAGMA foreign_keys = ON")
        old_conn.execute("CREATE TABLE mata_praktikum (id INTEGER PRIMARY KEY, nama TEXT, is_active INTEGER NOT NULL DEFAULT 1)")
        old_conn.execute("INSERT INTO mata_praktikum (id, nama, is_active) VALUES (1, 'Mata 1', 1)")
        old_conn.commit()

        # Buat tabel temporary yang akan bentrok untuk memaksa error
        old_conn.execute("CREATE TABLE _mig_mata_praktikum (id INT)")

        # Jalankan migrasi yang sengaja digagalkan dengan mock/bentrok
        # Fungsi migrate_master_tables_if_needed melakukan DROP TABLE IF EXISTS _mig_...,
        # jadi mari kita uji penolakan jika tabel memiliki data tidak valid untuk constraint baru
        # misalnya kelompok dengan peserta 0 (melanggar CHECK jumlah_peserta > 0)
        old_conn.execute("CREATE TABLE kelompok (id INTEGER PRIMARY KEY, nama TEXT, jumlah_peserta INTEGER, is_active INTEGER)")
        old_conn.execute("INSERT INTO kelompok (id, nama, jumlah_peserta, is_active) VALUES (1, 'K_Bad', 0, 1)")
        old_conn.commit()

        with self.assertRaises(sqlite3.IntegrityError):
            migrate_master_tables_if_needed(old_conn)

        # Database harus kembali ke state sebelum migrasi
        cur = old_conn.execute("SELECT count(*) FROM kelompok WHERE id=1")
        self.assertEqual(1, cur.fetchone()[0])
        old_conn.close()


# =============================================================================
# Entry point
# =============================================================================

if __name__ == "__main__":
    unittest.main(verbosity=2)
