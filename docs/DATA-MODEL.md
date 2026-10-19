# DATA-MODEL.md

**Smart Lab Scheduling System**  
**Versi:** 2.0-draft-finalisasi-dokumentasi  
**Tanggal:** 18 Oktober 2026  
**Status:** Skema dokumentasi berdasarkan DEC-001–DEC-065; fondasi dan migrasi DEC-060 telah tersedia, sedangkan keputusan backend TASK 10A.1 belum merupakan implementasi endpoint.

## 1. Otoritas dan prinsip data

- `DECISIONS.md` adalah sumber kebenaran keputusan desain.
- Database menggunakan SQLite. Setiap koneksi wajib menjalankan `PRAGMA foreign_keys = ON`.
- Rekomendasi koneksi: `PRAGMA busy_timeout = 5000`. Mode WAL direkomendasikan untuk diuji pada lingkungan demo sebelum dipakai; WAL bukan pengganti transaksi yang benar.
- Primary key entitas operasional menggunakan `INTEGER PRIMARY KEY`, kecuali UUID preview yang menggunakan `TEXT`.
- Semua foreign key operasional memakai `ON UPDATE RESTRICT ON DELETE RESTRICT`.
- Tidak ada hard delete data master atau kegiatan melalui UI MVP. Soft delete memakai `is_active`.
- Boolean SQLite direpresentasikan dengan `INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))`.
- Nama kelompok, laboratorium, dan mata praktikum unik secara case-insensitive. Nama asisten tidak wajib unik sesuai DEC-025.
- Semua timestamp backend menggunakan RFC 3339 UTC fixed-width dengan milidetik, misalnya `2026-10-18T08:30:00.000Z`. Backend adalah sumber waktu.
- Setiap kolom timestamp wajib memiliki validasi bentuk fixed-width di backend dan CHECK SQLite ekuivalen (`length(value)=24`, karakter pemisah pada posisi RFC 3339 yang tetap, digit/rentang komponen valid, dan akhiran `Z`). Perbandingan leksikografis aman karena semua nilai memakai bentuk UTC yang sama.
- Sesuai DEC-060 dan perincian DEC-063, enam entitas master (`mata_praktikum`, `kelompok`, `asisten`, `laboratorium`, `slot_waktu`, `praktikum`) memiliki kolom `created_at` dan `updated_at` fixed-width RFC 3339 UTC. `created_at` immutable setelah insert (dilindungi trigger). Setiap mutasi efektif memperbarui `updated_at`, termasuk pada entity nonaktif; `source_revision` hanya naik bila perubahan memengaruhi dataset aktif menurut matriks. Permintaan no-op tidak mengubah `updated_at` maupun `source_revision`.
- Setiap kolom timestamp (`created_at`, `updated_at`, dan kolom waktu pada versi/preview) divalidasi oleh CHECK constraint SQLite yang ketat: panjang tepat 24 karakter, format canonical `YYYY-MM-DDTHH:MM:SS.sssZ`, validitas kalender Gregorian (menolak tanggal fiktif seperti 31 April atau 29 Februari non-kabisat), dan tanpa evaluasi NULL yang lolos secara tidak sengaja.
- Hari memakai integer 1=Senin sampai 5=Jumat. Waktu slot memakai `HH:MM` 24 jam dan interval half-open `[mulai, selesai)`.
- Setiap kolom jam wajib memiliki validasi bentuk `HH:MM` di backend dan CHECK SQLite ekuivalen: panjang 5, pemisah `:`, jam `00`–`23`, dan menit `00`–`59`.
- Baris ketersediaan adalah allowlist: ada baris berarti tersedia; tidak ada baris berarti tidak tersedia.
- Satu kegiatan `praktikum` adalah satu variabel CSP yang dijadwalkan tepat sekali setiap siklus mingguan.
- Aturan C01–C09 diputuskan oleh Prolog, bukan direplikasi sebagai solver Python.

## 2. Ringkasan 12 tabel

| No. | Tabel | Fungsi |
|---:|---|---|
| 1 | `mata_praktikum` | Katalog jenis praktikum. |
| 2 | `kelompok` | Master kelompok dan jumlah peserta. |
| 3 | `asisten` | Master asisten. |
| 4 | `laboratorium` | Master laboratorium dan kapasitas. |
| 5 | `slot_waktu` | Kandidat waktu mingguan berdurasi 120 menit. |
| 6 | `praktikum` | Kegiatan yang menjadi variabel CSP. |
| 7 | `ketersediaan_kelompok` | Allowlist slot untuk kelompok. |
| 8 | `ketersediaan_asisten` | Allowlist slot untuk asisten. |
| 9 | `versi_jadwal` | Versi jadwal tersimpan dan snapshot canonical. |
| 10 | `detail_jadwal` | Indeks relasional assignment historis. |
| 11 | `preview_jadwal` | Hasil solver sementara, single-use, TTL 30 menit. |
| 12 | `system_metadata` | Counter `source_revision`. |

## 3. Skema tabel final pada tingkat dokumentasi

### 3.1 `mata_praktikum`

**Fungsi:** katalog jenis praktikum; bukan unit yang dijadwalkan.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `id` | INTEGER | Tidak | — | PRIMARY KEY |
| `nama` | TEXT COLLATE NOCASE | Tidak | — | UNIQUE, CHECK `trim(nama) <> ''` |
| `is_active` | INTEGER | Tidak | 1 | CHECK `is_active IN (0,1)` |
| `created_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char, immutable |
| `updated_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char |

**Index:** unique index case-insensitive pada `nama`; index parsial daftar aktif `idx_mata_praktikum_aktif(is_active) WHERE is_active = 1`.
**Trigger:** `trg_mata_created_at_immutable` menolak perubahan `created_at` pada `UPDATE`.
**Relasi:** 1:N ke `praktikum`.
**Perubahan/penghapusan:** soft delete saja. Mata nonaktif tidak dapat dipilih untuk kegiatan baru. Kegiatan aktif yang masih merujuk mata nonaktif menyebabkan `DATA_NOT_READY`.

### 3.2 `kelompok`

**Fungsi:** master kelompok peserta.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `id` | INTEGER | Tidak | — | PRIMARY KEY |
| `nama` | TEXT COLLATE NOCASE | Tidak | — | UNIQUE, CHECK `trim(nama) <> ''` |
| `jumlah_peserta` | INTEGER | Tidak | — | CHECK `jumlah_peserta > 0` |
| `is_active` | INTEGER | Tidak | 1 | CHECK `is_active IN (0,1)` |
| `created_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char, immutable |
| `updated_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char |

**Index:** unique index case-insensitive pada `nama`; index parsial `idx_kelompok_aktif(is_active) WHERE is_active = 1`.
**Trigger:** `trg_kelompok_created_at_immutable` menolak perubahan `created_at` pada `UPDATE`.
**Relasi:** 1:N ke `praktikum`; N:M ke `slot_waktu` melalui `ketersediaan_kelompok`.
**Perubahan/penghapusan:** soft delete. Kelompok nonaktif yang dirujuk kegiatan aktif menyebabkan `DATA_NOT_READY`.

### 3.3 `asisten`

**Fungsi:** master asisten.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `id` | INTEGER | Tidak | — | PRIMARY KEY |
| `nama` | TEXT | Tidak | — | CHECK `trim(nama) <> ''`; tidak UNIQUE |
| `is_active` | INTEGER | Tidak | 1 | CHECK `is_active IN (0,1)` |
| `created_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char, immutable |
| `updated_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char |

**Index:** index `asisten(nama)` boleh ditambahkan untuk pencarian, tetapi bukan unique; index parsial `idx_asisten_aktif(is_active) WHERE is_active = 1`.
**Trigger:** `trg_asisten_created_at_immutable` menolak perubahan `created_at` pada `UPDATE`.
**Relasi:** 1:N ke `praktikum`; N:M ke `slot_waktu` melalui `ketersediaan_asisten`.
**Perubahan/penghapusan:** soft delete. Asisten nonaktif yang dirujuk kegiatan aktif menyebabkan `DATA_NOT_READY`.

### 3.4 `laboratorium`

**Fungsi:** master ruang laboratorium dan kapasitas.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `id` | INTEGER | Tidak | — | PRIMARY KEY |
| `nama` | TEXT COLLATE NOCASE | Tidak | — | UNIQUE, CHECK `trim(nama) <> ''` |
| `kapasitas` | INTEGER | Tidak | — | CHECK `kapasitas > 0` |
| `is_active` | INTEGER | Tidak | 1 | CHECK `is_active IN (0,1)` |
| `created_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char, immutable |
| `updated_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char |

**Index:** unique index case-insensitive pada `nama`; index parsial `idx_laboratorium_aktif(is_active) WHERE is_active = 1`.
**Trigger:** `trg_lab_created_at_immutable` menolak perubahan `created_at` pada `UPDATE`.
**Relasi:** menjadi kandidat assignment solver; ID historis disalin ke `detail_jadwal`.
**Perubahan/penghapusan:** soft delete. Laboratorium nonaktif dikeluarkan dari kandidat solver.

### 3.5 `slot_waktu`

**Fungsi:** kandidat slot mingguan global.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `id` | INTEGER | Tidak | — | PRIMARY KEY |
| `hari` | INTEGER | Tidak | — | CHECK `hari BETWEEN 1 AND 5` |
| `jam_mulai` | TEXT | Tidak | — | Format tepat `HH:MM` |
| `jam_selesai` | TEXT | Tidak | — | Format tepat `HH:MM`; tepat 120 menit setelah mulai |
| `is_active` | INTEGER | Tidak | 1 | CHECK `is_active IN (0,1)` |
| `created_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char, immutable |
| `updated_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char |

**Unique:** `UNIQUE(hari, jam_mulai, jam_selesai)`.
**Index:** `idx_slot_waktu_hari_aktif(hari, jam_mulai, jam_selesai) WHERE is_active=1`.
**Check/trigger:** jam harus valid, selesai lebih besar dari mulai pada hari yang sama, dan durasi tepat 120 menit. Trigger SQLite wajib menolak overlap antar-slot aktif pada `INSERT`, perubahan hari/jam, dan reaktivasi. Trigger `trg_slot_created_at_immutable` menolak perubahan `created_at` pada `UPDATE`. Kondisi overlap: `lama.jam_mulai < baru.jam_selesai AND baru.jam_mulai < lama.jam_selesai` pada hari yang sama. Slot bersebelahan diperbolehkan. Flask melakukan validasi yang sama untuk pesan ramah.
**Perubahan/penghapusan:** soft delete; slot nonaktif dikeluarkan dari kandidat solver.

### 3.6 `praktikum`

**Fungsi:** kegiatan yang dijadwalkan; satu baris adalah satu variabel CSP.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `id` | INTEGER | Tidak | — | PRIMARY KEY |
| `mata_praktikum_id` | INTEGER | Tidak | — | FK → `mata_praktikum.id` |
| `kelompok_id` | INTEGER | Tidak | — | FK → `kelompok.id` |
| `asisten_id` | INTEGER | Tidak | — | FK → `asisten.id` |
| `is_active` | INTEGER | Tidak | 1 | CHECK `is_active IN (0,1)` |
| `created_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char, immutable |
| `updated_at` | TEXT | Tidak | strftime UTC | RFC 3339 UTC fixed-width 24 char |

**FK:** seluruhnya `ON UPDATE RESTRICT ON DELETE RESTRICT`.
**Index:** `idx_praktikum_mata(mata_praktikum_id)`, `idx_praktikum_kelompok(kelompok_id)`, `idx_praktikum_asisten(asisten_id)`, dan index parsial `idx_praktikum_aktif(id) WHERE is_active=1`.
**Trigger:** `trg_praktikum_created_at_immutable` menolak perubahan `created_at` pada `UPDATE`.
**Unique:** tidak ada unique gabungan tiga FK; kebutuhan itu belum menjadi keputusan bisnis.
**Perubahan/penghapusan:** tidak memiliki `nama`; label mata diperoleh melalui FK. Soft delete saja. Pembuatan, pengubahan, atau reaktivasi kegiatan aktif harus menolak referensi master nonaktif.

### 3.7 `ketersediaan_kelompok`

**Fungsi:** allowlist ketersediaan kelompok.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `kelompok_id` | INTEGER | Tidak | — | FK → `kelompok.id` |
| `slot_id` | INTEGER | Tidak | — | FK → `slot_waktu.id` |

**Primary key:** `(kelompok_id, slot_id)`.  
**FK:** `ON UPDATE RESTRICT ON DELETE RESTRICT`.  
**Index:** PK melayani lookup per kelompok; tambah `idx_ketersediaan_kelompok_slot(slot_id, kelompok_id)` untuk lookup balik.  
**Perubahan/penghapusan:** bukan soft-delete master. Baris boleh ditambah/dihapus sebagai penggantian allowlist; hanya perubahan efektif memengaruhi revision.

### 3.8 `ketersediaan_asisten`

**Fungsi:** allowlist ketersediaan asisten.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `asisten_id` | INTEGER | Tidak | — | FK → `asisten.id` |
| `slot_id` | INTEGER | Tidak | — | FK → `slot_waktu.id` |

**Primary key:** `(asisten_id, slot_id)`.  
**FK:** `ON UPDATE RESTRICT ON DELETE RESTRICT`.  
**Index:** PK melayani lookup per asisten; tambah `idx_ketersediaan_asisten_slot(slot_id, asisten_id)`.  
**Perubahan/penghapusan:** sama dengan ketersediaan kelompok.

### 3.9 `versi_jadwal`

**Fungsi:** versi jadwal tersimpan dan snapshot historis canonical.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `id` | INTEGER | Tidak | — | PRIMARY KEY |
| `status` | TEXT | Tidak | — | CHECK `status IN ('active','invalid','archived')` |
| `source_revision` | INTEGER | Tidak | — | CHECK `source_revision >= 0` |
| `created_at` | TEXT | Tidak | — | RFC 3339 UTC fixed-width |
| `invalidated_at` | TEXT | Ya | NULL | RFC 3339 UTC fixed-width bila terisi |
| `archived_at` | TEXT | Ya | NULL | RFC 3339 UTC fixed-width bila terisi |
| `snapshot_json` | TEXT | Tidak | — | CHECK `json_valid(snapshot_json)` |

**Index:** partial unique index wajib `uq_versi_jadwal_satu_active ON versi_jadwal(status) WHERE status='active'`; index `idx_versi_jadwal_created(created_at DESC)`.  
**Check koherensi:** active tidak memiliki timestamp terminal; invalid hanya memiliki `invalidated_at`; archived hanya memiliki `archived_at`.  
**State:** versi baru dibuat active; hanya `active→invalid` atau `active→archived`; invalid dan archived terminal.  
**Perubahan/penghapusan:** `source_revision`, `created_at`, dan `snapshot_json` immutable. Trigger wajib menolak transisi terlarang dan perubahan payload historis. Tidak ada aktivasi ulang versi historis.

### 3.10 `detail_jadwal`

**Fungsi:** indeks relasional assignment; bukan sumber label historis.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `id` | INTEGER | Tidak | — | PRIMARY KEY |
| `versi_id` | INTEGER | Tidak | — | FK → `versi_jadwal.id` |
| `praktikum_id` | INTEGER | Tidak | — | ID historis, bukan FK hidup |
| `slot_id` | INTEGER | Tidak | — | ID historis, bukan FK hidup |
| `laboratorium_id` | INTEGER | Tidak | — | ID historis, bukan FK hidup |

**Unique:** `(versi_id, praktikum_id)`.  
**FK:** hanya `versi_id`, memakai `ON UPDATE RESTRICT ON DELETE RESTRICT`.  
**Index:** `idx_detail_jadwal_versi(versi_id)` dan `idx_detail_jadwal_slot_lab(versi_id, slot_id, laboratorium_id)`.  
**Perubahan/penghapusan:** dibuat bersama snapshot dari hasil yang sama; immutable setelah commit. ID assignment sengaja tidak memakai FK master agar riwayat tidak rusak oleh perubahan operasional.

### 3.11 `preview_jadwal`

**Fungsi:** hasil solver sementara, single-use, tersimpan di SQLite.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `id` | TEXT | Tidak | — | PRIMARY KEY; UUID acak dari backend |
| `source_revision` | INTEGER | Tidak | — | CHECK `source_revision >= 0` |
| `hasil_json` | TEXT | Tidak | — | CHECK `json_valid(hasil_json)` |
| `snapshot_json` | TEXT | Tidak | — | CHECK `json_valid(snapshot_json)`; snapshot provisional dari dataset solver |
| `created_at` | TEXT | Tidak | — | RFC 3339 UTC fixed-width |
| `expires_at` | TEXT | Tidak | — | Tepat 30 menit setelah `created_at` |
| `consumed_at` | TEXT | Ya | NULL | RFC 3339 UTC fixed-width bila consumed |
| `terminal_at` | TEXT | Ya | NULL | Waktu menjadi consumed/expired/stale |
| `status` | TEXT | Tidak | `'ready'` | CHECK `status IN ('ready','consumed','expired','stale')` |

**Index:** `idx_preview_status_expiry(status, expires_at)` dan `idx_preview_terminal_cleanup(status, terminal_at)`.  
**Check koherensi:** ready tidak memiliki `consumed_at`/`terminal_at`; consumed memiliki keduanya dan nilainya sama; expired/stale memiliki `terminal_at` tetapi `consumed_at` NULL; `expires_at > created_at`. Backend dan tes memastikan selisih tepat 30 menit.  
**State:** hanya `ready→consumed`, `ready→expired`, atau `ready→stale`; status terminal tidak kembali ready. Conditional consume wajib memengaruhi tepat satu baris.  
**Perubahan/penghapusan:** payload dan revision immutable; perubahan hanya mengikuti state machine. Preview terminal dapat di-hard-delete internal setelah 7 hari dari `terminal_at`. Cleanup manual/maintenance tidak menaikkan revision atau mengubah jadwal. Tidak ada background scheduler MVP.

### 3.12 `system_metadata`

**Fungsi:** menyimpan counter global dataset.

| Kolom | Tipe SQLite | Null | Default | Constraint |
|---|---|---:|---|---|
| `key` | TEXT | Tidak | — | PRIMARY KEY, CHECK `trim(key) <> ''` |
| `value` | INTEGER | Tidak | — | CHECK `typeof(value)='integer' AND value >= 0` |

**Seed wajib:** `('source_revision', 0)`.  
**Index:** primary key cukup.  
**Perubahan/penghapusan:** counter bertambah tepat satu kali per transaksi yang memengaruhi dataset aktif, bukan per baris. Mutasi efektif yang hanya menyentuh entity nonaktif dan belum relevan tidak menaikkan counter. Backend wajib memastikan update key `source_revision` memengaruhi tepat satu baris. Key seed tidak boleh dihapus melalui UI.

## 4. Relasi dan sumber kebenaran

- `mata_praktikum` 1:N `praktikum`.
- `kelompok` 1:N `praktikum`.
- `asisten` 1:N `praktikum`.
- `kelompok` N:M `slot_waktu` melalui `ketersediaan_kelompok`.
- `asisten` N:M `slot_waktu` melalui `ketersediaan_asisten`.
- `versi_jadwal` 1:N `detail_jadwal`.
- Satu `praktikum` mempunyai tepat satu assignment dalam satu versi.
- `versi_jadwal.snapshot_json` adalah sumber kebenaran historis.
- `detail_jadwal` hanya indeks relasional untuk pencarian assignment.
- Snapshot dan detail dibuat dari hasil yang sama dalam satu transaksi dan immutable setelah commit.

## 5. Sembilan hard constraint Prolog

1. **C01:** Setiap kegiatan praktikum mendapat tepat satu penempatan.
2. **C02:** Slot yang dipilih terdaftar.
3. **C03:** Laboratorium yang dipilih terdaftar.
4. **C04:** Kapasitas laboratorium ≥ jumlah peserta kelompok.
5. **C05:** Tidak ada dua praktikum kelompok sama yang waktunya bertabrakan.
6. **C06:** Tidak ada dua praktikum asisten sama yang waktunya bertabrakan.
7. **C07:** Tidak ada dua praktikum di lab sama yang waktunya bertabrakan.
8. **C08:** Kelompok tersedia pada slot yang dipilih.
9. **C09:** Asisten tersedia pada slot yang dipilih.

C05–C07 menggunakan semantik interval half-open. Karena slot aktif global tidak boleh overlap, ID slot dapat dipakai pada model saat ini, tetapi validasi interval tetap menjadi pertahanan desain.

## 6. Revision dan invalidation

### 6.1 Definisi

- **Perubahan kandidat solver:** perubahan himpunan lab/slot aktif atau data kandidat yang dapat dipilih solver.
- **Perubahan kegiatan wajib:** menambah, menghapus secara logis, mengaktifkan, menonaktifkan, atau mengubah relasi kegiatan aktif yang wajib dijadwalkan.
- **Perubahan label snapshot:** perubahan nama aktif yang tampil pada preview/snapshot tetapi tidak mengubah kelayakan assignment.
- **Memengaruhi jadwal active:** perubahan membuat assignment tersimpan tidak lagi valid, lengkap, atau layak menurut dataset baru.
- Revision naik sekali per transaksi bila ada setidaknya satu mutasi efektif yang memengaruhi dataset aktif. Mutasi efektif pada entity nonaktif yang belum relevan dan no-op tidak menaikkan revision; hanya mutasi efektif yang memperbarui `updated_at`.
- Invalidasi hanya dilakukan bila mutasi memengaruhi validitas, cakupan, atau kelayakan jadwal active.

### 6.2 Matriks mutasi

| Mutasi efektif | Kategori | Revision | Jadwal active | Catatan |
|---|---|---:|---|---|
| Ubah nama/label master aktif | B | +1 | Tetap | Preview lama menjadi stale; validitas assignment tidak berubah. |
| Ubah data master nonaktif selain status | C | Tetap | Tetap | Tidak masuk dataset solver/snapshot aktif. |
| Mutasi yang menghasilkan nilai identik/no-op | C | Tetap | Tetap | Termasuk PUT availability dengan himpunan identik. |
| Tambah mata/kelompok/asisten aktif yang belum dipakai kegiatan | B | +1 | Tetap | Dataset/snapshot aktif berubah, jadwal tersimpan tetap layak. |
| Ubah jumlah peserta kelompok yang dipakai jadwal active, seluruh assignment tetap cukup | B | +1 | Tetap | Input solver berubah tanpa merusak C04 pada assignment tersimpan. |
| Naikkan jumlah peserta hingga melampaui kapasitas lab assignment active | A | +1 | `invalid` | Assignment melanggar C04. |
| Ubah jumlah peserta kelompok aktif yang tidak dipakai jadwal active | B | +1 | Tetap | Dataset berubah tetapi assignment tersimpan tidak terdampak. |
| Tambah laboratorium atau slot aktif | B | +1 | Tetap | Kandidat bertambah; jadwal lama masih valid. |
| Naikkan kapasitas, atau turunkan kapasitas lab tetapi seluruh assignment tetap cukup | B | +1 | Tetap | Kandidat berubah, tetapi C04 assignment tersimpan tetap terpenuhi. |
| Turunkan kapasitas lab hingga assignment active tidak cukup | A | +1 | `invalid` | Assignment melanggar C04. |
| Nonaktifkan lab yang dipakai jadwal active | A | +1 | `invalid` | Assignment kehilangan kandidat aktif. |
| Ubah kapasitas/nonaktifkan lab aktif yang tidak dipakai jadwal active | B | +1 | Tetap | Kandidat berubah, assignment tersimpan tetap valid. |
| Ubah/nonaktifkan slot yang dipakai jadwal active | A | +1 | `invalid` | Assignment waktu berubah/hilang. |
| Ubah/nonaktifkan slot aktif yang tidak dipakai jadwal active | B | +1 | Tetap | Kandidat berubah saja. |
| Nonaktifkan mata/kelompok/asisten yang dirujuk kegiatan aktif | A | +1 | `invalid` bila jadwal active mencakup kegiatan itu | Relasi tidak dihapus; generate menghasilkan `DATA_NOT_READY`. |
| Reaktivasi master katalog/kandidat | B | +1 | Tetap | Kandidat aktif bertambah; versi invalid lama tetap terminal dan tidak dipulihkan. |
| Reaktivasi kegiatan | A | +1 | `invalid` bila ada active | Kegiatan kembali menjadi bagian cakupan wajib; tidak memulihkan versi lama. |
| Tambah/aktifkan kegiatan wajib | A | +1 | `invalid` | Cakupan jadwal active tidak lengkap. |
| Nonaktifkan kegiatan yang ada pada jadwal active | A | +1 | `invalid` | Cakupan berubah. |
| Ubah mata/kelompok/asisten kegiatan aktif | A | +1 | `invalid` | Constraint kegiatan berubah. |
| Tambah availability | B | +1 | Tetap | Domain kandidat meluas; assignment tersimpan tetap valid. |
| Hapus availability yang dipakai assignment active | A | +1 | `invalid` | Assignment melanggar C08/C09. |
| Hapus availability yang tidak dipakai assignment active | B | +1 | Tetap | Domain kandidat menyempit tanpa merusak assignment tersimpan. |
| Ubah availability kelompok/asisten nonaktif | C | Tetap | Tetap | Diizinkan untuk persiapan; dievaluasi ketika reaktivasi membuatnya relevan. |
| Buat/consume/expire/stale/cleanup preview | C | Tetap | Tetap | Preview bukan sumber solver. |
| Buat atau transisikan versi jadwal | C | Tetap | Sesuai state save | Riwayat bukan dataset solver. |

Kategori: **A** revision naik dan active invalid; **B** revision naik tetapi active tetap valid; **C** revision dan status active tidak berubah. Setiap kenaikan revision membuat preview `ready` lama stale secara semantik; status `stale` dipersistensikan ketika preview diperiksa, bukan lewat update massal. Sesuai DEC-063, setiap mutasi efektif pada enam entitas bertimestamp memperbarui `updated_at`. Karena kategori C juga mencakup mutasi efektif pada entity nonaktif, kategori C tidak selalu berarti no-op: mutasi tersebut mengubah `updated_at` tetapi tidak mengubah revision/status active. No-op murni tidak mengubah `updated_at`, `source_revision`, maupun status jadwal.

Kasus dengan beberapa mutasi dalam satu transaksi memakai dampak terkuat: bila satu mutasi kategori A, revision tetap hanya naik satu kali dan jadwal active diinvalidasi satu kali.

## 7. State machine

### 7.1 Versi jadwal

```text
baru disimpan ──► active ──► invalid   (data relevan berubah)
                         └─► archived  (versi baru disimpan)
```

- Invalid dan archived terminal.
- Versi invalid tetap invalid ketika versi baru disimpan.
- Tidak ada pemulihan otomatis maupun manual pada MVP.
- Reaktivasi master tidak memulihkan versi invalid.
- Partial unique index menjamin maksimal satu active.

### 7.2 Preview

```text
solver success ──► ready ──► consumed
                         ├─► expired
                         └─► stale
```

- Preview tidak dibuat untuk `unsatisfiable`, timeout, atau error.
- Expired ketika `now >= expires_at`.
- Stale ketika revision terkini berbeda dari `source_revision` preview.
- Semua status selain ready terminal.
- TTL 30 menit dihitung oleh backend dari `created_at`.

## 8. Snapshot historis versioned

### 8.1 Aturan

- Format awal memakai `schema_version: 1`.
- Snapshot versi tersimpan dibangun hanya dari dataset dan hasil yang sama dengan preview solver; save tidak membaca ulang label master untuk mengganti isi preview.
- `generated_at` adalah waktu solver selesai dan preview diterbitkan; `saved_at` adalah waktu versi berhasil disimpan.
- Snapshot menyimpan label dan atribut yang diperlukan untuk menampilkan riwayat tanpa JOIN master aktif.
- Tidak menyimpan data sensitif yang tidak diperlukan.
- Urutan array harus kanonis, direkomendasikan menaik berdasarkan ID, agar pengujian dan perbandingan stabil.

### 8.2 Contoh lengkap

```json
{
  "schema_version": 1,
  "source_revision": 7,
  "generated_at": "2026-10-18T08:00:00.000Z",
  "saved_at": "2026-10-18T08:05:00.000Z",
  "mata_praktikum": [
    {"id": 1, "nama": "Pemrograman Logika"}
  ],
  "kelompok": [
    {"id": 1, "nama": "Kelompok A", "jumlah_peserta": 28}
  ],
  "asisten": [
    {"id": 1, "nama": "Asisten Satu"}
  ],
  "laboratorium": [
    {"id": 1, "nama": "Lab AI", "kapasitas": 30}
  ],
  "slot_waktu": [
    {"id": 1, "hari": 1, "jam_mulai": "08:00", "jam_selesai": "10:00"}
  ],
  "praktikum": [
    {"id": 1, "mata_praktikum_id": 1, "kelompok_id": 1, "asisten_id": 1}
  ],
  "assignments": [
    {
      "praktikum_id": 1,
      "slot_id": 1,
      "laboratorium_id": 1,
      "mata_praktikum_nama": "Pemrograman Logika",
      "kelompok_nama": "Kelompok A",
      "jumlah_peserta": 28,
      "asisten_nama": "Asisten Satu",
      "laboratorium_nama": "Lab AI",
      "laboratorium_kapasitas": 30,
      "hari": 1,
      "jam_mulai": "08:00",
      "jam_selesai": "10:00"
    }
  ]
}
```

Snapshot provisional di `preview_jadwal` memakai struktur yang sama, tetapi `saved_at` bernilai `null`. Saat save, backend mengisi `saved_at` tanpa mengganti dataset, label, atau assignment lain.

## 9. Transaksi wajib

### 9.1 Mutasi dataset

Gunakan satu transaksi tulis. Jika mutasi efektif: ubah data dan `updated_at`; increment `source_revision` tepat satu kali hanya bila perubahan memengaruhi dataset aktif; lalu invalidasi active bila kategori A. Kegagalan apa pun rollback seluruh langkah. Mutasi efektif entity nonaktif yang tidak memengaruhi dataset aktif tidak menaikkan counter. Mutasi no-op tidak mengubah data, timestamp, atau counter.

### 9.2 Siklus hidup database

Inisialisasi dan migrasi database hanya dijalankan melalui perintah CLI maintenance yang eksplisit. Flask tidak menjalankan migrasi otomatis saat startup ataupun saat menangani request. Startup boleh memeriksa koneksi, versi/schema yang diharapkan, serta dependency, kemudian gagal dengan pesan aman bila database belum siap; pemeriksaan ini tidak boleh mengubah schema.

### 9.3 Generate

1. Buka transaksi baca singkat dan baca revision serta dataset secara konsisten.
2. Tutup transaksi.
3. Jalankan Prolog di luar transaksi database, maksimum 30 detik.
4. Setelah success lolos verifier, buka transaksi write singkat dengan locking SQLite yang mencegah race mutasi; baca revision terkini di dalam transaksi.
5. Jika berbeda, jangan insert preview; tutup transaksi dan kembalikan `STALE_GENERATION`.
6. Jika sama, insert preview ready dengan TTL 30 menit, hasil, dan snapshot provisional, lalu commit dalam transaksi yang sama.
7. Tidak ada retry otomatis dan tidak ada write lock selama solver berjalan.

Eksekusi Prolog mengikuti kontrak subprocess dan JSON versi 1 pada `API-CONTRACT.md`: satu proses per generate, stdin/stdout UTF-8, bounded stream capture, serta kode kegagalan adapter DEC-028–DEC-042. Snapshot source dan solver projection berasal dari transaksi baca yang sama.

### 9.3 Save preview

Gunakan `BEGIN IMMEDIATE` dan satu transaksi:

1. Muat preview berdasarkan UUID; bila tidak ada, `PREVIEW_NOT_FOUND`.
2. Terapkan prioritas status terminal: consumed, stale, lalu expired, tanpa mengubah status terminal yang sudah tercatat.
3. Untuk preview ready, periksa TTL dahulu; bila `now >= expires_at`, lakukan conditional transition `ready→expired`, commit hanya transisi terminal itu, lalu `PREVIEW_EXPIRED`.
4. Baru bandingkan revision; bila berbeda, lakukan conditional transition `ready→stale`, commit hanya transisi terminal itu, lalu `STALE_PREVIEW`. Jika TTL dan revision sama-sama gagal, expiry menang.
5. Validasi integritas hasil.
6. Ubah versi active lama menjadi archived bila masih ada.
7. Buat `versi_jadwal` active dengan snapshot canonical.
8. Buat seluruh `detail_jadwal` dari assignment yang sama.
9. Conditional update preview dari ready menjadi consumed.
10. Pastikan conditional update memengaruhi tepat satu baris.
11. Commit. Setiap kegagalan database atau validasi integritas pada jalur save menyebabkan rollback; penolakan expired/stale adalah transisi terminal yang berhasil dicatat, bukan save parsial.

## 10. Kesiapan data sebelum solver

Backend mengembalikan `DATA_NOT_READY` sebelum memanggil Prolog bila:

- tidak ada kegiatan praktikum aktif;
- kegiatan aktif merujuk mata praktikum, kelompok, atau asisten nonaktif/tidak ada;
- tidak ada kandidat laboratorium aktif atau slot aktif yang diperlukan;
- availability referensial tidak konsisten;
- data struktural tidak lengkap atau melanggar constraint format.

Laboratorium dan slot nonaktif cukup dikeluarkan dari kandidat. Backend tidak boleh diam-diam menghapus kegiatan aktif yang referensinya nonaktif dari input solver.

Availability kosong bukan referensi rusak: baris yang tidak ada berarti tidak tersedia. Dataset tersebut tetap boleh dikirim ke Prolog dan dapat menghasilkan `unsatisfiable` sesuai DEC-034.

## 11. Pengujian minimum skema

- FK benar-benar aktif pada setiap koneksi.
- Check boolean, kapasitas, peserta, hari, format jam, dan durasi bekerja.
- Trigger menolak overlap saat insert, update, dan reaktivasi, tetapi menerima slot bersebelahan.
- Nama unik case-insensitive bekerja; nama asisten duplikat diterima.
- Maksimal satu versi active dijamin oleh database.
- State terminal versi/preview tidak dapat dibalik.
- Snapshot dan detail tidak dapat diedit setelah commit.
- Preview expired, stale, dan consumed tidak dapat disimpan.
- Dua save bersamaan hanya menghasilkan satu versi.
- Rollback tidak meninggalkan revision, invalidation, versi, detail, atau consumed state parsial.
- Mutasi no-op tidak menaikkan revision.
- Satu transaksi multi-baris yang memengaruhi dataset aktif menaikkan revision tepat satu kali.
- Reaktivasi tidak memulihkan jadwal invalid.
- Cleanup preview terminal lebih tua dari 7 hari tidak mengubah revision atau status jadwal.

## 12. Hal yang masih OPEN

- Kebijakan penghapusan manual versi jadwal historis. Aktivasi ulang sudah dilarang oleh DEC-027.
- Hasil uji WAL pada lingkungan demo.
- Batas maksimal dataset berdasarkan benchmark DEC-012.

Dokumen ini tidak membuat database, migrasi, endpoint, atau implementasi aplikasi.
