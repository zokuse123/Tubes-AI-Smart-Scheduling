-- =============================================================================
-- Smart Lab Scheduling System — SQLite Schema
-- Berdasarkan DATA-MODEL.md versi 2.0-draft-finalisasi-dokumentasi
-- Keputusan: DEC-001 s/d DEC-060
-- Tanggal: 18 Oktober 2026
-- Catatan: Jalankan melalui init_db.py yang menangani PRAGMA dan idempoten.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PRAGMA wajib (dijalankan oleh koneksi, bukan oleh script ini secara langsung)
-- PRAGMA foreign_keys = ON;
-- PRAGMA busy_timeout = 5000;
-- ---------------------------------------------------------------------------

-- =============================================================================
-- TABEL 1: mata_praktikum
-- Fungsi: katalog jenis praktikum; bukan unit yang dijadwalkan (DEC-013).
-- =============================================================================
CREATE TABLE IF NOT EXISTS mata_praktikum (
    id         INTEGER PRIMARY KEY,
    nama       TEXT    COLLATE NOCASE NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT chk_mata_nama_notempty  CHECK (trim(nama) <> ''),
    CONSTRAINT chk_mata_is_active      CHECK (is_active IN (0, 1)),
    CONSTRAINT uq_mata_nama            UNIQUE (nama),
    CONSTRAINT chk_mata_created_fmt CHECK (
        length(created_at) = 24
                AND substr(created_at, 5, 1) = '-'
                AND substr(created_at, 8, 1) = '-'
                AND substr(created_at, 11, 1) = 'T'
                AND substr(created_at, 14, 1) = ':'
                AND substr(created_at, 17, 1) = ':'
                AND substr(created_at, 20, 1) = '.'
                AND substr(created_at, 24, 1) = 'Z'
                AND substr(created_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(created_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(created_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(created_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(created_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) = substr(created_at, 1, 19)
    ),
    CONSTRAINT chk_mata_updated_fmt CHECK (
        length(updated_at) = 24
                AND substr(updated_at, 5, 1) = '-'
                AND substr(updated_at, 8, 1) = '-'
                AND substr(updated_at, 11, 1) = 'T'
                AND substr(updated_at, 14, 1) = ':'
                AND substr(updated_at, 17, 1) = ':'
                AND substr(updated_at, 20, 1) = '.'
                AND substr(updated_at, 24, 1) = 'Z'
                AND substr(updated_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(updated_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(updated_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(updated_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(updated_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) = substr(updated_at, 1, 19)
    )
);

CREATE INDEX IF NOT EXISTS idx_mata_praktikum_aktif
    ON mata_praktikum (is_active)
    WHERE is_active = 1;

CREATE TRIGGER IF NOT EXISTS trg_mata_created_at_immutable
BEFORE UPDATE OF created_at ON mata_praktikum
BEGIN
    SELECT RAISE(ABORT, 'MATA_IMMUTABLE: created_at tidak dapat diubah')
    WHERE NEW.created_at <> OLD.created_at;
END;

-- =============================================================================
-- TABEL 2: kelompok
-- Fungsi: master kelompok peserta.
-- =============================================================================
CREATE TABLE IF NOT EXISTS kelompok (
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
    CONSTRAINT chk_kelompok_created_fmt CHECK (
        length(created_at) = 24
                AND substr(created_at, 5, 1) = '-'
                AND substr(created_at, 8, 1) = '-'
                AND substr(created_at, 11, 1) = 'T'
                AND substr(created_at, 14, 1) = ':'
                AND substr(created_at, 17, 1) = ':'
                AND substr(created_at, 20, 1) = '.'
                AND substr(created_at, 24, 1) = 'Z'
                AND substr(created_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(created_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(created_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(created_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(created_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) = substr(created_at, 1, 19)
    ),
    CONSTRAINT chk_kelompok_updated_fmt CHECK (
        length(updated_at) = 24
                AND substr(updated_at, 5, 1) = '-'
                AND substr(updated_at, 8, 1) = '-'
                AND substr(updated_at, 11, 1) = 'T'
                AND substr(updated_at, 14, 1) = ':'
                AND substr(updated_at, 17, 1) = ':'
                AND substr(updated_at, 20, 1) = '.'
                AND substr(updated_at, 24, 1) = 'Z'
                AND substr(updated_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(updated_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(updated_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(updated_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(updated_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) = substr(updated_at, 1, 19)
    )
);

CREATE INDEX IF NOT EXISTS idx_kelompok_aktif
    ON kelompok (is_active)
    WHERE is_active = 1;

CREATE TRIGGER IF NOT EXISTS trg_kelompok_created_at_immutable
BEFORE UPDATE OF created_at ON kelompok
BEGIN
    SELECT RAISE(ABORT, 'KELOMPOK_IMMUTABLE: created_at tidak dapat diubah')
    WHERE NEW.created_at <> OLD.created_at;
END;

-- =============================================================================
-- TABEL 3: asisten
-- Fungsi: master asisten; nama TIDAK wajib unik (DEC-025).
-- =============================================================================
CREATE TABLE IF NOT EXISTS asisten (
    id         INTEGER PRIMARY KEY,
    nama       TEXT    NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT chk_asisten_nama_notempty CHECK (trim(nama) <> ''),
    CONSTRAINT chk_asisten_is_active     CHECK (is_active IN (0, 1)),
    CONSTRAINT chk_asisten_created_fmt CHECK (
        length(created_at) = 24
                AND substr(created_at, 5, 1) = '-'
                AND substr(created_at, 8, 1) = '-'
                AND substr(created_at, 11, 1) = 'T'
                AND substr(created_at, 14, 1) = ':'
                AND substr(created_at, 17, 1) = ':'
                AND substr(created_at, 20, 1) = '.'
                AND substr(created_at, 24, 1) = 'Z'
                AND substr(created_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(created_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(created_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(created_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(created_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) = substr(created_at, 1, 19)
    ),
    CONSTRAINT chk_asisten_updated_fmt CHECK (
        length(updated_at) = 24
                AND substr(updated_at, 5, 1) = '-'
                AND substr(updated_at, 8, 1) = '-'
                AND substr(updated_at, 11, 1) = 'T'
                AND substr(updated_at, 14, 1) = ':'
                AND substr(updated_at, 17, 1) = ':'
                AND substr(updated_at, 20, 1) = '.'
                AND substr(updated_at, 24, 1) = 'Z'
                AND substr(updated_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(updated_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(updated_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(updated_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(updated_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) = substr(updated_at, 1, 19)
    )
);

CREATE INDEX IF NOT EXISTS idx_asisten_nama
    ON asisten (nama);

CREATE INDEX IF NOT EXISTS idx_asisten_aktif
    ON asisten (is_active)
    WHERE is_active = 1;

CREATE TRIGGER IF NOT EXISTS trg_asisten_created_at_immutable
BEFORE UPDATE OF created_at ON asisten
BEGIN
    SELECT RAISE(ABORT, 'ASISTEN_IMMUTABLE: created_at tidak dapat diubah')
    WHERE NEW.created_at <> OLD.created_at;
END;

-- =============================================================================
-- TABEL 4: laboratorium
-- Fungsi: master ruang laboratorium dan kapasitas.
-- =============================================================================
CREATE TABLE IF NOT EXISTS laboratorium (
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
    CONSTRAINT chk_lab_created_fmt CHECK (
        length(created_at) = 24
                AND substr(created_at, 5, 1) = '-'
                AND substr(created_at, 8, 1) = '-'
                AND substr(created_at, 11, 1) = 'T'
                AND substr(created_at, 14, 1) = ':'
                AND substr(created_at, 17, 1) = ':'
                AND substr(created_at, 20, 1) = '.'
                AND substr(created_at, 24, 1) = 'Z'
                AND substr(created_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(created_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(created_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(created_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(created_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) = substr(created_at, 1, 19)
    ),
    CONSTRAINT chk_lab_updated_fmt CHECK (
        length(updated_at) = 24
                AND substr(updated_at, 5, 1) = '-'
                AND substr(updated_at, 8, 1) = '-'
                AND substr(updated_at, 11, 1) = 'T'
                AND substr(updated_at, 14, 1) = ':'
                AND substr(updated_at, 17, 1) = ':'
                AND substr(updated_at, 20, 1) = '.'
                AND substr(updated_at, 24, 1) = 'Z'
                AND substr(updated_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(updated_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(updated_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(updated_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(updated_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) = substr(updated_at, 1, 19)
    )
);

CREATE INDEX IF NOT EXISTS idx_laboratorium_aktif
    ON laboratorium (is_active)
    WHERE is_active = 1;

CREATE TRIGGER IF NOT EXISTS trg_lab_created_at_immutable
BEFORE UPDATE OF created_at ON laboratorium
BEGIN
    SELECT RAISE(ABORT, 'LAB_IMMUTABLE: created_at tidak dapat diubah')
    WHERE NEW.created_at <> OLD.created_at;
END;

-- =============================================================================
-- TABEL 5: slot_waktu
-- Fungsi: kandidat slot mingguan global, durasi tepat 120 menit (DEC-006).
-- DEC-023: slot aktif pada hari sama tidak boleh overlap.
-- =============================================================================
CREATE TABLE IF NOT EXISTS slot_waktu (
    id          INTEGER PRIMARY KEY,
    hari        INTEGER NOT NULL,
    jam_mulai   TEXT    NOT NULL,
    jam_selesai TEXT    NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- Hari Senin=1 s/d Jumat=5
    CONSTRAINT chk_slot_hari          CHECK (hari BETWEEN 1 AND 5),
    -- Format HH:MM: panjang 5, pemisah ':', jam 00-23, menit 00-59
    CONSTRAINT chk_slot_mulai_format  CHECK (
        length(jam_mulai) = 5
        AND substr(jam_mulai, 3, 1) = ':'
        AND CAST(substr(jam_mulai, 1, 2) AS INTEGER) BETWEEN 0 AND 23
        AND CAST(substr(jam_mulai, 4, 2) AS INTEGER) BETWEEN 0 AND 59
    ),
    CONSTRAINT chk_slot_selesai_format CHECK (
        length(jam_selesai) = 5
        AND substr(jam_selesai, 3, 1) = ':'
        AND CAST(substr(jam_selesai, 1, 2) AS INTEGER) BETWEEN 0 AND 23
        AND CAST(substr(jam_selesai, 4, 2) AS INTEGER) BETWEEN 0 AND 59
    ),
    -- Durasi tepat 120 menit:
    -- jam_selesai = jam_mulai + 120 menit
    -- Dihitung sebagai (H_selesai*60 + M_selesai) - (H_mulai*60 + M_mulai) = 120
    CONSTRAINT chk_slot_durasi_120 CHECK (
        (CAST(substr(jam_selesai, 1, 2) AS INTEGER) * 60 + CAST(substr(jam_selesai, 4, 2) AS INTEGER))
        - (CAST(substr(jam_mulai, 1, 2) AS INTEGER) * 60 + CAST(substr(jam_mulai, 4, 2) AS INTEGER))
        = 120
    ),
    CONSTRAINT chk_slot_is_active     CHECK (is_active IN (0, 1)),
    CONSTRAINT uq_slot_hari_waktu     UNIQUE (hari, jam_mulai, jam_selesai),
    CONSTRAINT chk_slot_created_fmt CHECK (
        length(created_at) = 24
                AND substr(created_at, 5, 1) = '-'
                AND substr(created_at, 8, 1) = '-'
                AND substr(created_at, 11, 1) = 'T'
                AND substr(created_at, 14, 1) = ':'
                AND substr(created_at, 17, 1) = ':'
                AND substr(created_at, 20, 1) = '.'
                AND substr(created_at, 24, 1) = 'Z'
                AND substr(created_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(created_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(created_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(created_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(created_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) = substr(created_at, 1, 19)
    ),
    CONSTRAINT chk_slot_updated_fmt CHECK (
        length(updated_at) = 24
                AND substr(updated_at, 5, 1) = '-'
                AND substr(updated_at, 8, 1) = '-'
                AND substr(updated_at, 11, 1) = 'T'
                AND substr(updated_at, 14, 1) = ':'
                AND substr(updated_at, 17, 1) = ':'
                AND substr(updated_at, 20, 1) = '.'
                AND substr(updated_at, 24, 1) = 'Z'
                AND substr(updated_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(updated_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(updated_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(updated_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(updated_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) = substr(updated_at, 1, 19)
    )
);

-- Index untuk query kandidat solver per hari (aktif saja)
CREATE INDEX IF NOT EXISTS idx_slot_waktu_hari_aktif
    ON slot_waktu (hari, jam_mulai, jam_selesai)
    WHERE is_active = 1;

CREATE TRIGGER IF NOT EXISTS trg_slot_created_at_immutable
BEFORE UPDATE OF created_at ON slot_waktu
BEGIN
    SELECT RAISE(ABORT, 'SLOT_IMMUTABLE: created_at tidak dapat diubah')
    WHERE NEW.created_at <> OLD.created_at;
END;

-- =============================================================================
-- TRIGGER: cegah overlap slot aktif pada hari yang sama (DEC-023)
-- Overlap: lama.jam_mulai < baru.jam_selesai AND baru.jam_mulai < lama.jam_selesai
-- Slot bersebelahan DIPERBOLEHKAN.
-- Tiga trigger: INSERT, UPDATE hari/jam, reaktivasi (is_active 0→1).
-- =============================================================================

-- Trigger INSERT: tolak slot baru aktif yang overlap dengan slot aktif lain
CREATE TRIGGER IF NOT EXISTS trg_slot_no_overlap_insert
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
END;

-- Trigger UPDATE: tolak perubahan hari/jam yang menyebabkan overlap
CREATE TRIGGER IF NOT EXISTS trg_slot_no_overlap_update
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
END;

-- =============================================================================
-- TABEL 6: praktikum
-- Fungsi: kegiatan yang dijadwalkan; satu baris = satu variabel CSP (DEC-013).
-- =============================================================================
CREATE TABLE IF NOT EXISTS praktikum (
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

    CONSTRAINT chk_praktikum_created_fmt CHECK (
        length(created_at) = 24
                AND substr(created_at, 5, 1) = '-'
                AND substr(created_at, 8, 1) = '-'
                AND substr(created_at, 11, 1) = 'T'
                AND substr(created_at, 14, 1) = ':'
                AND substr(created_at, 17, 1) = ':'
                AND substr(created_at, 20, 1) = '.'
                AND substr(created_at, 24, 1) = 'Z'
                AND substr(created_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(created_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(created_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(created_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(created_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) = substr(created_at, 1, 19)
    ),
    CONSTRAINT chk_praktikum_updated_fmt CHECK (
        length(updated_at) = 24
                AND substr(updated_at, 5, 1) = '-'
                AND substr(updated_at, 8, 1) = '-'
                AND substr(updated_at, 11, 1) = 'T'
                AND substr(updated_at, 14, 1) = ':'
                AND substr(updated_at, 17, 1) = ':'
                AND substr(updated_at, 20, 1) = '.'
                AND substr(updated_at, 24, 1) = 'Z'
                AND substr(updated_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(updated_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(updated_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(updated_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(updated_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(updated_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(updated_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19)) = substr(updated_at, 1, 19)
    )
);

CREATE INDEX IF NOT EXISTS idx_praktikum_mata
    ON praktikum (mata_praktikum_id);

CREATE INDEX IF NOT EXISTS idx_praktikum_kelompok
    ON praktikum (kelompok_id);

CREATE INDEX IF NOT EXISTS idx_praktikum_asisten
    ON praktikum (asisten_id);

CREATE INDEX IF NOT EXISTS idx_praktikum_aktif
    ON praktikum (id)
    WHERE is_active = 1;

CREATE TRIGGER IF NOT EXISTS trg_praktikum_created_at_immutable
BEFORE UPDATE OF created_at ON praktikum
BEGIN
    SELECT RAISE(ABORT, 'PRAKTIKUM_IMMUTABLE: created_at tidak dapat diubah')
    WHERE NEW.created_at <> OLD.created_at;
END;

-- =============================================================================
-- TABEL 7: ketersediaan_kelompok
-- Fungsi: allowlist ketersediaan kelompok per slot (DEC-034).
-- =============================================================================
CREATE TABLE IF NOT EXISTS ketersediaan_kelompok (
    kelompok_id INTEGER NOT NULL,
    slot_id     INTEGER NOT NULL,

    CONSTRAINT pk_ketersediaan_kelompok
        PRIMARY KEY (kelompok_id, slot_id),

    CONSTRAINT fk_kk_kelompok
        FOREIGN KEY (kelompok_id) REFERENCES kelompok (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    CONSTRAINT fk_kk_slot
        FOREIGN KEY (slot_id) REFERENCES slot_waktu (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- Index balik untuk lookup slot → kelompok mana saja yang tersedia
CREATE INDEX IF NOT EXISTS idx_ketersediaan_kelompok_slot
    ON ketersediaan_kelompok (slot_id, kelompok_id);

-- =============================================================================
-- TABEL 8: ketersediaan_asisten
-- Fungsi: allowlist ketersediaan asisten per slot (DEC-034).
-- =============================================================================
CREATE TABLE IF NOT EXISTS ketersediaan_asisten (
    asisten_id INTEGER NOT NULL,
    slot_id    INTEGER NOT NULL,

    CONSTRAINT pk_ketersediaan_asisten
        PRIMARY KEY (asisten_id, slot_id),

    CONSTRAINT fk_ka_asisten
        FOREIGN KEY (asisten_id) REFERENCES asisten (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    CONSTRAINT fk_ka_slot
        FOREIGN KEY (slot_id) REFERENCES slot_waktu (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- Index balik untuk lookup slot → asisten mana saja yang tersedia
CREATE INDEX IF NOT EXISTS idx_ketersediaan_asisten_slot
    ON ketersediaan_asisten (slot_id, asisten_id);

-- =============================================================================
-- TABEL 9: versi_jadwal
-- Fungsi: versi jadwal tersimpan dan snapshot historis canonical (DEC-016, DEC-019).
-- State machine: active → invalid | archived. Invalid dan archived terminal.
-- =============================================================================
CREATE TABLE IF NOT EXISTS versi_jadwal (
    id              INTEGER PRIMARY KEY,
    status          TEXT    NOT NULL,
    source_revision INTEGER NOT NULL,
    created_at      TEXT    NOT NULL,
    invalidated_at  TEXT,
    archived_at     TEXT,
    snapshot_json   TEXT    NOT NULL,

    CONSTRAINT chk_vj_status CHECK (status IN ('active', 'invalid', 'archived')),
    CONSTRAINT chk_vj_src_rev CHECK (source_revision >= 0),

    -- Validasi format timestamp RFC 3339 UTC fixed-width (DEC-018)
    -- Format: YYYY-MM-DDTHH:MM:SS.sssZ (panjang 24)
    CONSTRAINT chk_vj_created_at_fmt CHECK (
        length(created_at) = 24
                AND substr(created_at, 5, 1) = '-'
                AND substr(created_at, 8, 1) = '-'
                AND substr(created_at, 11, 1) = 'T'
                AND substr(created_at, 14, 1) = ':'
                AND substr(created_at, 17, 1) = ':'
                AND substr(created_at, 20, 1) = '.'
                AND substr(created_at, 24, 1) = 'Z'
                AND substr(created_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(created_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(created_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(created_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(created_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) = substr(created_at, 1, 19)
    ),
    CONSTRAINT chk_vj_invalidated_at_fmt CHECK (
        invalidated_at IS NULL
        OR (
            length(invalidated_at) = 24
            AND substr(invalidated_at, 5, 1) = '-'
            AND substr(invalidated_at, 8, 1) = '-'
            AND substr(invalidated_at, 11, 1) = 'T'
            AND substr(invalidated_at, 14, 1) = ':'
            AND substr(invalidated_at, 17, 1) = ':'
            AND substr(invalidated_at, 20, 1) = '.'
            AND substr(invalidated_at, 24, 1) = 'Z'
            AND substr(invalidated_at, 1, 4) BETWEEN '0001' AND '9999'
            AND substr(invalidated_at, 6, 2) BETWEEN '01' AND '12'
            AND substr(invalidated_at, 9, 2) BETWEEN '01' AND '31'
            AND substr(invalidated_at, 12, 2) BETWEEN '00' AND '23'
            AND substr(invalidated_at, 15, 2) BETWEEN '00' AND '59'
            AND substr(invalidated_at, 18, 2) BETWEEN '00' AND '59'
            AND substr(invalidated_at, 21, 1) BETWEEN '0' AND '9'
            AND substr(invalidated_at, 22, 1) BETWEEN '0' AND '9'
            AND substr(invalidated_at, 23, 1) BETWEEN '0' AND '9'
            AND strftime('%Y-%m-%dT%H:%M:%S', substr(invalidated_at, 1, 19)) IS NOT NULL
            AND strftime('%Y-%m-%dT%H:%M:%S', substr(invalidated_at, 1, 19)) = substr(invalidated_at, 1, 19)
        )
    ),
    CONSTRAINT chk_vj_archived_at_fmt CHECK (
        archived_at IS NULL
        OR (
            length(archived_at) = 24
            AND substr(archived_at, 5, 1) = '-'
            AND substr(archived_at, 8, 1) = '-'
            AND substr(archived_at, 11, 1) = 'T'
            AND substr(archived_at, 14, 1) = ':'
            AND substr(archived_at, 17, 1) = ':'
            AND substr(archived_at, 20, 1) = '.'
            AND substr(archived_at, 24, 1) = 'Z'
            AND substr(archived_at, 1, 4) BETWEEN '0001' AND '9999'
            AND substr(archived_at, 6, 2) BETWEEN '01' AND '12'
            AND substr(archived_at, 9, 2) BETWEEN '01' AND '31'
            AND substr(archived_at, 12, 2) BETWEEN '00' AND '23'
            AND substr(archived_at, 15, 2) BETWEEN '00' AND '59'
            AND substr(archived_at, 18, 2) BETWEEN '00' AND '59'
            AND substr(archived_at, 21, 1) BETWEEN '0' AND '9'
            AND substr(archived_at, 22, 1) BETWEEN '0' AND '9'
            AND substr(archived_at, 23, 1) BETWEEN '0' AND '9'
            AND strftime('%Y-%m-%dT%H:%M:%S', substr(archived_at, 1, 19)) IS NOT NULL
            AND strftime('%Y-%m-%dT%H:%M:%S', substr(archived_at, 1, 19)) = substr(archived_at, 1, 19)
        )
    ),

    -- Koherensi status dan timestamp terminal
    -- active: tidak ada timestamp terminal
    -- invalid: hanya invalidated_at, archived_at NULL
    -- archived: hanya archived_at, invalidated_at NULL
    CONSTRAINT chk_vj_status_coherence CHECK (
        (status = 'active'   AND invalidated_at IS NULL AND archived_at IS NULL)
        OR (status = 'invalid'  AND invalidated_at IS NOT NULL AND archived_at IS NULL)
        OR (status = 'archived' AND archived_at IS NOT NULL AND invalidated_at IS NULL)
    ),

    CONSTRAINT chk_vj_snapshot_valid CHECK (json_valid(snapshot_json))
);

-- Partial unique index: maksimal SATU versi active sekaligus (DEC-021)
CREATE UNIQUE INDEX IF NOT EXISTS uq_versi_jadwal_satu_active
    ON versi_jadwal (status)
    WHERE status = 'active';

-- Index untuk daftar riwayat (urut terbaru dulu)
CREATE INDEX IF NOT EXISTS idx_versi_jadwal_created
    ON versi_jadwal (created_at DESC);

-- =============================================================================
-- TRIGGER: lindungi immutabilitas versi_jadwal (DEC-019)
-- Tolak perubahan source_revision, created_at, snapshot_json setelah commit.
-- Tolak transisi status yang tidak diizinkan.
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS trg_versi_jadwal_immutable
BEFORE UPDATE ON versi_jadwal
BEGIN
    -- Tolak perubahan field immutable
    SELECT RAISE(ABORT, 'VERSI_IMMUTABLE: source_revision tidak dapat diubah setelah commit')
    WHERE NEW.source_revision <> OLD.source_revision;

    SELECT RAISE(ABORT, 'VERSI_IMMUTABLE: created_at tidak dapat diubah setelah commit')
    WHERE NEW.created_at <> OLD.created_at;

    SELECT RAISE(ABORT, 'VERSI_IMMUTABLE: snapshot_json tidak dapat diubah setelah commit')
    WHERE NEW.snapshot_json <> OLD.snapshot_json;

    -- Tolak transisi status yang tidak diizinkan
    -- Hanya: active→invalid, active→archived
    SELECT RAISE(ABORT, 'VERSI_STATE: transisi status tidak diizinkan; hanya active→invalid atau active→archived')
    WHERE NOT (
        (OLD.status = 'active' AND NEW.status IN ('invalid', 'archived'))
        OR (OLD.status = NEW.status)  -- tidak berubah (update field lain, meski tidak ada)
    );

    -- Tolak perubahan pada versi yang sudah terminal
    SELECT RAISE(ABORT, 'VERSI_STATE: status terminal (invalid/archived) tidak dapat diubah')
    WHERE OLD.status IN ('invalid', 'archived') AND NEW.status <> OLD.status;
END;

-- =============================================================================
-- TABEL 10: detail_jadwal
-- Fungsi: indeks relasional assignment historis (DEC-020).
-- praktikum_id, slot_id, laboratorium_id adalah ID historis tanpa FK hidup.
-- =============================================================================
CREATE TABLE IF NOT EXISTS detail_jadwal (
    id             INTEGER PRIMARY KEY,
    versi_id       INTEGER NOT NULL,
    praktikum_id   INTEGER NOT NULL,
    slot_id        INTEGER NOT NULL,
    laboratorium_id INTEGER NOT NULL,

    CONSTRAINT uq_detail_versi_praktikum UNIQUE (versi_id, praktikum_id),

    CONSTRAINT fk_detail_versi
        FOREIGN KEY (versi_id) REFERENCES versi_jadwal (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    -- praktikum_id, slot_id, laboratorium_id SENGAJA tidak ada FK hidup (DEC-020)
);

CREATE INDEX IF NOT EXISTS idx_detail_jadwal_versi
    ON detail_jadwal (versi_id);

CREATE INDEX IF NOT EXISTS idx_detail_jadwal_slot_lab
    ON detail_jadwal (versi_id, slot_id, laboratorium_id);

-- =============================================================================
-- TRIGGER: lindungi immutabilitas detail_jadwal (DEC-019)
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_detail_jadwal_immutable
BEFORE UPDATE ON detail_jadwal
BEGIN
    SELECT RAISE(ABORT, 'DETAIL_IMMUTABLE: detail_jadwal tidak dapat diubah setelah commit')
    WHERE 1;  -- Tolak semua UPDATE tanpa pengecualian
END;

-- =============================================================================
-- TABEL 11: preview_jadwal
-- Fungsi: hasil solver sementara, single-use, TTL 30 menit (DEC-009, DEC-010, DEC-017).
-- PK: UUID TEXT dari backend.
-- =============================================================================
CREATE TABLE IF NOT EXISTS preview_jadwal (
    id              TEXT    PRIMARY KEY,
    source_revision INTEGER NOT NULL,
    hasil_json      TEXT    NOT NULL,
    snapshot_json   TEXT    NOT NULL,
    created_at      TEXT    NOT NULL,
    expires_at      TEXT    NOT NULL,
    consumed_at     TEXT,
    terminal_at     TEXT,
    status          TEXT    NOT NULL DEFAULT 'ready',

    CONSTRAINT chk_preview_src_rev   CHECK (source_revision >= 0),
    CONSTRAINT chk_preview_status    CHECK (status IN ('ready', 'consumed', 'expired', 'stale')),
    CONSTRAINT chk_preview_hasil     CHECK (json_valid(hasil_json)),
    CONSTRAINT chk_preview_snapshot  CHECK (json_valid(snapshot_json)),

    -- Format timestamp wajib RFC 3339 UTC fixed-width
    CONSTRAINT chk_preview_created_fmt CHECK (
        length(created_at) = 24
                AND substr(created_at, 5, 1) = '-'
                AND substr(created_at, 8, 1) = '-'
                AND substr(created_at, 11, 1) = 'T'
                AND substr(created_at, 14, 1) = ':'
                AND substr(created_at, 17, 1) = ':'
                AND substr(created_at, 20, 1) = '.'
                AND substr(created_at, 24, 1) = 'Z'
                AND substr(created_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(created_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(created_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(created_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(created_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(created_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(created_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(created_at, 1, 19)) = substr(created_at, 1, 19)
    ),
    CONSTRAINT chk_preview_expires_fmt CHECK (
        length(expires_at) = 24
                AND substr(expires_at, 5, 1) = '-'
                AND substr(expires_at, 8, 1) = '-'
                AND substr(expires_at, 11, 1) = 'T'
                AND substr(expires_at, 14, 1) = ':'
                AND substr(expires_at, 17, 1) = ':'
                AND substr(expires_at, 20, 1) = '.'
                AND substr(expires_at, 24, 1) = 'Z'
                AND substr(expires_at, 1, 4) BETWEEN '0001' AND '9999'
                AND substr(expires_at, 6, 2) BETWEEN '01' AND '12'
                AND substr(expires_at, 9, 2) BETWEEN '01' AND '31'
                AND substr(expires_at, 12, 2) BETWEEN '00' AND '23'
                AND substr(expires_at, 15, 2) BETWEEN '00' AND '59'
                AND substr(expires_at, 18, 2) BETWEEN '00' AND '59'
                AND substr(expires_at, 21, 1) BETWEEN '0' AND '9'
                AND substr(expires_at, 22, 1) BETWEEN '0' AND '9'
                AND substr(expires_at, 23, 1) BETWEEN '0' AND '9'
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(expires_at, 1, 19)) IS NOT NULL
                AND strftime('%Y-%m-%dT%H:%M:%S', substr(expires_at, 1, 19)) = substr(expires_at, 1, 19)
    ),
    CONSTRAINT chk_preview_consumed_fmt CHECK (
        consumed_at IS NULL
        OR (
            length(consumed_at) = 24
            AND substr(consumed_at, 5, 1) = '-'
            AND substr(consumed_at, 8, 1) = '-'
            AND substr(consumed_at, 11, 1) = 'T'
            AND substr(consumed_at, 14, 1) = ':'
            AND substr(consumed_at, 17, 1) = ':'
            AND substr(consumed_at, 20, 1) = '.'
            AND substr(consumed_at, 24, 1) = 'Z'
            AND substr(consumed_at, 1, 4) BETWEEN '0001' AND '9999'
            AND substr(consumed_at, 6, 2) BETWEEN '01' AND '12'
            AND substr(consumed_at, 9, 2) BETWEEN '01' AND '31'
            AND substr(consumed_at, 12, 2) BETWEEN '00' AND '23'
            AND substr(consumed_at, 15, 2) BETWEEN '00' AND '59'
            AND substr(consumed_at, 18, 2) BETWEEN '00' AND '59'
            AND substr(consumed_at, 21, 1) BETWEEN '0' AND '9'
            AND substr(consumed_at, 22, 1) BETWEEN '0' AND '9'
            AND substr(consumed_at, 23, 1) BETWEEN '0' AND '9'
            AND strftime('%Y-%m-%dT%H:%M:%S', substr(consumed_at, 1, 19)) IS NOT NULL
            AND strftime('%Y-%m-%dT%H:%M:%S', substr(consumed_at, 1, 19)) = substr(consumed_at, 1, 19)
        )
    ),
    CONSTRAINT chk_preview_terminal_fmt CHECK (
        terminal_at IS NULL
        OR (
            length(terminal_at) = 24
            AND substr(terminal_at, 5, 1) = '-'
            AND substr(terminal_at, 8, 1) = '-'
            AND substr(terminal_at, 11, 1) = 'T'
            AND substr(terminal_at, 14, 1) = ':'
            AND substr(terminal_at, 17, 1) = ':'
            AND substr(terminal_at, 20, 1) = '.'
            AND substr(terminal_at, 24, 1) = 'Z'
            AND substr(terminal_at, 1, 4) BETWEEN '0001' AND '9999'
            AND substr(terminal_at, 6, 2) BETWEEN '01' AND '12'
            AND substr(terminal_at, 9, 2) BETWEEN '01' AND '31'
            AND substr(terminal_at, 12, 2) BETWEEN '00' AND '23'
            AND substr(terminal_at, 15, 2) BETWEEN '00' AND '59'
            AND substr(terminal_at, 18, 2) BETWEEN '00' AND '59'
            AND substr(terminal_at, 21, 1) BETWEEN '0' AND '9'
            AND substr(terminal_at, 22, 1) BETWEEN '0' AND '9'
            AND substr(terminal_at, 23, 1) BETWEEN '0' AND '9'
            AND strftime('%Y-%m-%dT%H:%M:%S', substr(terminal_at, 1, 19)) IS NOT NULL
            AND strftime('%Y-%m-%dT%H:%M:%S', substr(terminal_at, 1, 19)) = substr(terminal_at, 1, 19)
        )
    ),

    -- expires_at harus setelah created_at (perbandingan leksikografis aman untuk UTC ISO-8601)
    CONSTRAINT chk_preview_expires_gt_created CHECK (expires_at > created_at),

    -- Koherensi status dan timestamp terminal (DEC-017)
    -- ready: consumed_at NULL, terminal_at NULL
    -- consumed: consumed_at NOT NULL, terminal_at NOT NULL, consumed_at = terminal_at
    -- expired: consumed_at NULL, terminal_at NOT NULL
    -- stale: consumed_at NULL, terminal_at NOT NULL
    CONSTRAINT chk_preview_state_coherence CHECK (
        (status = 'ready'    AND consumed_at IS NULL AND terminal_at IS NULL)
        OR (status = 'consumed' AND consumed_at IS NOT NULL AND terminal_at IS NOT NULL AND consumed_at = terminal_at)
        OR (status = 'expired'  AND consumed_at IS NULL AND terminal_at IS NOT NULL)
        OR (status = 'stale'    AND consumed_at IS NULL AND terminal_at IS NOT NULL)
    )
);

-- Index untuk pemeriksaan TTL dan cleanup
CREATE INDEX IF NOT EXISTS idx_preview_status_expiry
    ON preview_jadwal (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_preview_terminal_cleanup
    ON preview_jadwal (status, terminal_at);

-- =============================================================================
-- TRIGGER: lindungi immutabilitas payload preview dan state machine (DEC-017)
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_preview_immutable
BEFORE UPDATE ON preview_jadwal
BEGIN
    -- Payload immutable
    SELECT RAISE(ABORT, 'PREVIEW_IMMUTABLE: source_revision tidak dapat diubah')
    WHERE NEW.source_revision <> OLD.source_revision;

    SELECT RAISE(ABORT, 'PREVIEW_IMMUTABLE: hasil_json tidak dapat diubah')
    WHERE NEW.hasil_json <> OLD.hasil_json;

    SELECT RAISE(ABORT, 'PREVIEW_IMMUTABLE: snapshot_json tidak dapat diubah')
    WHERE NEW.snapshot_json <> OLD.snapshot_json;

    SELECT RAISE(ABORT, 'PREVIEW_IMMUTABLE: created_at tidak dapat diubah')
    WHERE NEW.created_at <> OLD.created_at;

    SELECT RAISE(ABORT, 'PREVIEW_IMMUTABLE: expires_at tidak dapat diubah')
    WHERE NEW.expires_at <> OLD.expires_at;

    -- Tolak perubahan dari status terminal
    SELECT RAISE(ABORT, 'PREVIEW_STATE: status terminal tidak dapat diubah kembali')
    WHERE OLD.status IN ('consumed', 'expired', 'stale') AND NEW.status <> OLD.status;

    -- Hanya transisi: ready→consumed, ready→expired, ready→stale
    SELECT RAISE(ABORT, 'PREVIEW_STATE: transisi status tidak diizinkan')
    WHERE OLD.status = 'ready'
      AND NEW.status NOT IN ('ready', 'consumed', 'expired', 'stale');
END;

-- =============================================================================
-- TABEL 12: system_metadata
-- Fungsi: counter global source_revision (DEC-022).
-- =============================================================================
CREATE TABLE IF NOT EXISTS system_metadata (
    key   TEXT    PRIMARY KEY,
    value INTEGER NOT NULL,

    CONSTRAINT chk_meta_key_notempty CHECK (trim(key) <> ''),
    CONSTRAINT chk_meta_value_int_ge0 CHECK (typeof(value) = 'integer' AND value >= 0)
);

-- =============================================================================
-- SEED: source_revision = 0 (DEC-022)
-- INSERT OR IGNORE agar idempoten: tidak menimpa nilai yang sudah ada.
-- =============================================================================
INSERT OR IGNORE INTO system_metadata (key, value)
VALUES ('source_revision', 0);
