# API-CONTRACT.md

**Versi 1.0-final-dokumentasi | 18 Oktober 2026**  
**Status:** kontrak REST v1 dan Flask–SWI-Prolog telah difinalisasi pada tingkat dokumentasi melalui DEC-028–DEC-065; belum merupakan implementasi Flask.

## 1. Prinsip antarkomponen

- Alur: React ⇄ Flask REST JSON ⇄ SWI-Prolog; Flask ⇄ SQLite.
- Hanya Prolog mencari dan menentukan solusi penjadwalan.
- Flask memvalidasi data, menjalankan subprocess, memverifikasi assignment konkret, mengelola transaksi, dan menyimpan preview/versi. Flask tidak mencari jadwal alternatif.
- REST memakai base path `/api/v1`, field `snake_case`, ID integer positif, waktu `HH:MM`, dan timestamp RFC 3339 UTC fixed-width dengan milidetik.
- Setiap generate memakai satu subprocess baru. Tidak ada solver persisten atau temporary file sebagai transport utama pada MVP.

## 2. Kontrak REST v1

### 2.1 Envelope dan aturan umum

- Sukses: `{"data": ...}`. Daftar: `{"data":[...],"meta":{"page":1,"page_size":20,"total_items":0,"total_pages":0}}`.
- Error: `{"error":{"code":"...","message":"...","details":null}}`. Kode stabil; pesan aman; details boleh object, array, atau null dan tidak memuat traceback, SQL, stderr, path, atau konfigurasi.
- POST, PATCH, dan PUT wajib `Content-Type: application/json`, satu objek JSON, maksimum 256 KiB. GET tidak mempunyai body.
- Integer dan boolean divalidasi strict. Unknown field dan read-only field ditolak. SQL wajib terparameterisasi, sort memakai whitelist, dan tidak ada mass assignment.
- CORS hanya untuk origin Vite lokal yang dikonfigurasi. CORS bukan authentication; MVP lokal tidak memakai authentication.

### 2.2 Resource, writable field, dan query

| Resource | Writable create/PATCH | Read-only utama | Validasi khusus | Sort whitelist | Search |
|---|---|---|---|---|---|
| `mata-praktikum` | `nama` | `id,is_active,created_at,updated_at` | nama trim nonkosong dan unik case-insensitive | `id,nama,created_at,updated_at` | `nama` |
| `kelompok` | `nama,jumlah_peserta` | field sistem | nama unik; peserta integer positif | `id,nama,jumlah_peserta,created_at,updated_at` | `nama` |
| `asisten` | `nama` | field sistem | nama trim nonkosong; tidak harus unik | `id,nama,created_at,updated_at` | `nama` |
| `laboratorium` | `nama,kapasitas` | field sistem | nama unik; kapasitas integer positif | `id,nama,kapasitas,created_at,updated_at` | `nama` |
| `slot-waktu` | `hari,jam_mulai,jam_selesai` | field sistem | hari 1–5; waktu valid; 120 menit; slot aktif tidak overlap | `id,hari,jam_mulai,jam_selesai,created_at,updated_at` | tidak ada |
| `praktikum` | `mata_praktikum_id,kelompok_id,asisten_id` | field sistem dan nested summary | FK positif, ada, dan aktif ketika ditulis | `id,mata_praktikum_id,kelompok_id,asisten_id,created_at,updated_at` | tidak ada pada MVP |

Field sistem meliputi `id`, `is_active`, timestamp, revision, snapshot, nested summary, dan assignment solver. Create selalu aktif. `is_active` hanya diubah melalui endpoint status dengan body tepat `{"is_active":true}` atau `{"is_active":false}`. PATCH detail bersifat parsial, wajib memiliki minimal satu field writable, menolak null untuk field non-nullable, dan nilai identik adalah no-op.

List master memakai default `page=1`, `page_size=20` (maksimum 100), `sort_by=id`, `sort_order=asc`, dan `is_active=true`; query opsional adalah `sort_by`, `search`, serta `is_active=true|false|all`. Sorting selalu stabil: setelah field pilihan dan arah yang diminta, backend memakai `id` sebagai tie-breaker terakhir dengan arah yang sama. Search adalah case-insensitive contains pada kolom yang diizinkan tabel di atas; nilai di-trim, panjang setelah trim maksimum 100 karakter, dan karakter `%` serta `_` dari pengguna diperlakukan literal, bukan wildcard SQL. Page di luar total menghasilkan data kosong. History tetap memakai default `sort_by=created_at`, `sort_order=desc`, `status=all`, dengan `id` sebagai tie-breaker stabil; status hanya `active|invalid|archived|all`.

### 2.3 Legenda inventaris

Kolom R/I/P berarti efek revision / active schedule / preview. Kategori A = revision +1 dan active invalid; B = revision +1 dan active tetap; C = keduanya tetap. Penentuan A/B mengikuti dampak aktual pada matriks §11. Setiap revision +1 membuat preview ready lama gagal save sebagai stale; statusnya dipersistensikan saat diperiksa, bukan melalui update massal. Error `umum` mencakup error parsing/media/ukuran/field/validasi/database yang relevan dari §2.6. Semua response memakai envelope §2.1.

### 2.4 Inventaris final 40 operasi

| OP | Method dan path relatif `/api/v1` | Request → response | Sukses | Error/validasi khusus | R/I/P | Frontend |
|---:|---|---|---:|---|---|---|
| 01 | GET `/mata-praktikum` | tanpa body → list | 200 | INVALID_QUERY; query §2.2 | C/C/none | tabel |
| 02 | GET `/mata-praktikum/{id}` | tanpa body → entity | 200 | RESOURCE_NOT_FOUND; ID positif | C/C/none | form |
| 03 | POST `/mata-praktikum` | writable → entity | 201 | umum, DUPLICATE_NAME | B/C/stale | form |
| 04 | PATCH `/mata-praktikum/{id}` | partial → entity | 200 | umum, DUPLICATE_NAME, no-op | B atau C/C/stale atau none | form |
| 05 | PATCH `/mata-praktikum/{id}/status` | `is_active` → entity | 200 | umum; referensi kegiatan aktif | A/B/C §11 | toggle |
| 06 | GET `/kelompok` | tanpa body → list | 200 | INVALID_QUERY | C/C/none | tabel |
| 07 | GET `/kelompok/{id}` | tanpa body → entity | 200 | RESOURCE_NOT_FOUND | C/C/none | form |
| 08 | POST `/kelompok` | writable → entity | 201 | umum, DUPLICATE_NAME | B/C/stale | form |
| 09 | PATCH `/kelompok/{id}` | partial → entity | 200 | umum, DUPLICATE_NAME; dampak kapasitas | A/B/C §11 | form |
| 10 | PATCH `/kelompok/{id}/status` | `is_active` → entity | 200 | umum; referensi kegiatan aktif | A/B/C §11 | toggle |
| 11 | GET `/asisten` | tanpa body → list | 200 | INVALID_QUERY | C/C/none | tabel |
| 12 | GET `/asisten/{id}` | tanpa body → entity | 200 | RESOURCE_NOT_FOUND | C/C/none | form |
| 13 | POST `/asisten` | writable → entity | 201 | umum | B/C/stale | form |
| 14 | PATCH `/asisten/{id}` | partial → entity | 200 | umum, no-op | B atau C/C/stale atau none | form |
| 15 | PATCH `/asisten/{id}/status` | `is_active` → entity | 200 | umum; referensi kegiatan aktif | A/B/C §11 | toggle |
| 16 | GET `/laboratorium` | tanpa body → list | 200 | INVALID_QUERY | C/C/none | tabel |
| 17 | GET `/laboratorium/{id}` | tanpa body → entity | 200 | RESOURCE_NOT_FOUND | C/C/none | form |
| 18 | POST `/laboratorium` | writable → entity | 201 | umum, DUPLICATE_NAME | B/C/stale | form |
| 19 | PATCH `/laboratorium/{id}` | partial → entity | 200 | umum, DUPLICATE_NAME; dampak kapasitas | A/B/C §11 | form |
| 20 | PATCH `/laboratorium/{id}/status` | `is_active` → entity | 200 | umum; dipakai assignment active | A/B/C §11 | toggle |
| 21 | GET `/slot-waktu` | tanpa body → list | 200 | INVALID_QUERY | C/C/none | tabel |
| 22 | GET `/slot-waktu/{id}` | tanpa body → entity | 200 | RESOURCE_NOT_FOUND | C/C/none | form |
| 23 | POST `/slot-waktu` | writable → entity | 201 | umum; overlap/durasi | B/C/stale | form |
| 24 | PATCH `/slot-waktu/{id}` | partial → entity | 200 | umum; overlap/durasi/dampak | A/B/C §11 | form |
| 25 | PATCH `/slot-waktu/{id}/status` | `is_active` → entity | 200 | umum; dampak assignment | A/B/C §11 | toggle |
| 26 | GET `/praktikum` | tanpa body → list + nested | 200 | INVALID_QUERY; tanpa relational search | C/C/none | tabel |
| 27 | GET `/praktikum/{id}` | tanpa body → entity + nested | 200 | RESOURCE_NOT_FOUND | C/C/none | form |
| 28 | POST `/praktikum` | tiga FK → entity | 201 | umum, INVALID_REFERENCE, INACTIVE_REFERENCE | A jika ada active; selain itu B/stale | form |
| 29 | PATCH `/praktikum/{id}` | partial FK → entity | 200 | umum, INVALID_REFERENCE, INACTIVE_REFERENCE | A/B/C §11 | form |
| 30 | PATCH `/praktikum/{id}/status` | `is_active` → entity | 200 | umum; cakupan kegiatan | A/B/C §11 | toggle |
| 31 | GET `/kelompok/{id}/ketersediaan` | tanpa body → availability | 200 | RESOURCE_NOT_FOUND | C/C/none | availability |
| 32 | PUT `/kelompok/{id}/ketersediaan` | `slot_ids` → availability | 200 | umum, INVALID_REFERENCE, INACTIVE_REFERENCE | A/B/C §11 | availability |
| 33 | GET `/asisten/{id}/ketersediaan` | tanpa body → availability | 200 | RESOURCE_NOT_FOUND | C/C/none | availability |
| 34 | PUT `/asisten/{id}/ketersediaan` | `slot_ids` → availability | 200 | umum, INVALID_REFERENCE, INACTIVE_REFERENCE | A/B/C §11 | availability |
| 35 | POST `/jadwal/generate` | `{}` → success/unsatisfiable | 200 | solver/DB §2.6; wajib kosong | C/C/ready hanya success | jadwal |
| 36 | POST `/jadwal/simpan` | hanya `preview_id` → jadwal | 201 | preview/DB §2.6; UUID | C/archive active lama/consumed | jadwal |
| 37 | GET `/jadwal/aktif` | tanpa body → jadwal/null | 200 | DATABASE_BUSY/ERROR | C/C/none | jadwal |
| 38 | GET `/jadwal/riwayat` | tanpa body → list versi | 200 | INVALID_QUERY, DB | C/C/none | riwayat |
| 39 | GET `/jadwal/riwayat/{id}` | tanpa body → snapshot jadwal | 200 | RESOURCE_NOT_FOUND, DB | C/C/none | riwayat |
| 40 | GET `/health` | tanpa body → health | 200/503 | dependency unavailable | C/C/none | diagnostik |

Enam resource × lima operasi = 30, availability = 4, scheduling = 5, health = 1; total tepat 40. Tidak ada DELETE.

### 2.5 Availability dan nested praktikum

PUT availability adalah full replacement dengan body tepat `{"slot_ids":[1,2,3]}`. Array kosong valid; ID harus integer positif; duplikat ditolak; urutan diabaikan. Slot hilang menghasilkan INVALID_REFERENCE dan slot nonaktif INACTIVE_REFERENCE. GET/PUT owner nonaktif diizinkan; perubahan efektifnya kategori C sampai reaktivasi relevan mengevaluasi dataset.

Nested summary pada list/detail praktikum bersifat read-only dan berasal dari master terkini dengan bentuk tepat berikut:

- `mata_praktikum`: `{"id": integer, "nama": string}`
- `kelompok`: `{"id": integer, "nama": string, "jumlah_peserta": integer}`
- `asisten`: `{"id": integer, "nama": string}`

Object `praktikum` tetap memuat field utamanya (`id`, `mata_praktikum_id`, `kelompok_id`, `asisten_id`) serta metadata (`is_active`, `created_at`, `updated_at`) sesuai kontrak resource. Write tetap memakai tiga FK integer; nested summary dan metadata bukan input writable. Riwayat selalu memakai snapshot immutable.

### 2.6 Mapping HTTP error final

| HTTP | Kode |
|---:|---|
| 400 | `INVALID_JSON`, `INVALID_QUERY`, `UNKNOWN_FIELD`, `READ_ONLY_FIELD` |
| 404 | `RESOURCE_NOT_FOUND`, `PREVIEW_NOT_FOUND` |
| 409 | `DUPLICATE_NAME`, `INACTIVE_REFERENCE`, `DATA_NOT_READY`, `STALE_GENERATION`, `STALE_PREVIEW`, `PREVIEW_EXPIRED`, `PREVIEW_CONSUMED` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `VALIDATION_ERROR`, `INVALID_REFERENCE` |
| 502 | `SOLVER_PROTOCOL_ERROR`, `SOLVER_PROCESS_ERROR`, `SOLVER_INTERNAL_ERROR`, `SOLVER_INVALID_INPUT` |
| 503 | `SOLVER_UNAVAILABLE`, `DATABASE_BUSY` |
| 504 | `SOLVER_TIMEOUT` |
| 500 | `DATABASE_ERROR`, `INTERNAL_ERROR` |

`STALE_GENERATION` hanya untuk perubahan revision sebelum insert preview; `STALE_PREVIEW` hanya saat save. Timeout tidak pernah menjadi unsatisfiable.

## 3. Kontrak proses Flask–SWI-Prolog

### 3.1 Entrypoint dan command konseptual

Entrypoint: `solver_cli:main/0`.  
Lokasi implementasi yang direncanakan: `prolog/solver_cli.pl`.

Contoh PowerShell Windows 11 setelah file implementasi tersedia:

```powershell
& "C:\Program Files\swipl\bin\swipl.exe" `
  -q `
  -f none `
  -s "D:\path\to\project\prolog\solver_cli.pl" `
  -g "solver_cli:main" `
  -t halt
```

Path executable dan solver tidak boleh di-hardcode seperti contoh. Backend membaca executable dari konfigurasi, memilih absolute path bila tersedia, dan melakukan pemeriksaan startup/health check.

Argumen subprocess Python berbentuk list:

```text
[
  <absolute-swipl-executable>,
  "-q",
  "-f", "none",
  "-s", <absolute-solver-cli-path>,
  "-g", "solver_cli:main",
  "-t", "halt"
]
```

Python wajib memakai `shell=False`. Tidak ada input pengguna, nama, ID, atau JSON yang disisipkan ke goal, command string, maupun klausa Prolog.

### 3.2 Stream dan encoding

| Stream | Kontrak |
|---|---|
| stdin | Tepat satu dokumen JSON UTF-8 tanpa BOM, lalu EOF. |
| stdout | Tepat satu objek JSON UTF-8; satu newline akhir opsional. Tidak boleh ada byte non-whitespace lain. |
| stderr | Diagnostik teknis saja; bukan bagian protokol dan tidak ditampilkan mentah kepada pengguna. |

Aturan:

- Banner, progress, warning, debug, stack trace, dan representasi term Prolog dilarang di stdout.
- Seluruh logging eksplisit menuju stderr/`user_error`.
- Dataset lengkap dan data sensitif tidak dicetak pada log normal.
- Boundary CLI menangkap exception bila memungkinkan dan menghasilkan respons terstruktur.
- Output kosong, JSON ganda, prefix/suffix non-whitespace, JSON rusak, atau shape yang salah adalah `SOLVER_PROTOCOL_ERROR`.

### 3.3 Exit code

| Exit code | Status JSON yang sah |
|---:|---|
| 0 | `success` atau `unsatisfiable` |
| 2 | `invalid_input` |
| 3 | `internal_error` |
| Lainnya | Tidak ada status yang dipercaya; `SOLVER_PROCESS_ERROR` |

Flask wajib memvalidasi pasangan exit code dan status. Timeout/crash tidak boleh diterjemahkan menjadi `unsatisfiable`.

### 3.4 Timeout, output limit, dan cleanup

- Timeout proses: 30 detik.
- stdout maksimum 1 MiB.
- stderr maksimum 256 KiB.
- Batas dihitung pada byte UTF-8 ketika stream dibaca, bukan setelah seluruh stream terkumpul.
- stdout dan stderr harus dikuras secara konkuren agar salah satu pipe yang penuh tidak menimbulkan deadlock.
- Reader menyimpan data hanya sampai batas; ketika batas terlampaui, adapter menandai pelanggaran, menghentikan proses, tetap menyelesaikan drain/close yang diperlukan, menunggu proses berakhir, lalu mengembalikan protocol/process error.
- Pada timeout, hentikan proses tunggal SWI-Prolog, tunggu benar-benar berakhir, drain/tutup pipe dengan aman, dan kembalikan `SOLVER_TIMEOUT`.
- MVP melarang solver membuat child process. Jika ini berubah, terminasi process tree Windows harus didesain ulang.
- Tidak ada preview untuk timeout, output limit, crash, process error, atau protocol error.

### 3.5 Pengujian standalone

Contoh konseptual PowerShell 7:

```powershell
$solverInput = Get-Content -Raw -Encoding UTF8 .\fixtures\solver-valid.json
$solverInput | & <absolute-swipl-executable> `
  -q -f none `
  -s <absolute-solver-cli-path> `
  -g "solver_cli:main" `
  -t halt
```

Fixture fisik belum dibuat. Pengujian harus memeriksa stdout byte-level, stderr terpisah, exit code, timeout, dan batas stream.

## 4. JSON input solver versi 1

### 4.1 Contoh valid lengkap

```json
{
  "schema_version": 1,
  "source_revision": 7,
  "mata_praktikum": [
    {"id": 1}
  ],
  "kelompok": [
    {"id": 1, "jumlah_peserta": 20},
    {"id": 2, "jumlah_peserta": 18}
  ],
  "asisten": [
    {"id": 1}
  ],
  "laboratorium": [
    {"id": 1, "kapasitas": 25}
  ],
  "slot_waktu": [
    {"id": 1, "hari": 1, "jam_mulai": "08:00", "jam_selesai": "10:00"},
    {"id": 2, "hari": 1, "jam_mulai": "10:00", "jam_selesai": "12:00"}
  ],
  "praktikum": [
    {"id": 1, "mata_praktikum_id": 1, "kelompok_id": 1, "asisten_id": 1},
    {"id": 2, "mata_praktikum_id": 1, "kelompok_id": 2, "asisten_id": 1}
  ],
  "ketersediaan_kelompok": [
    {"kelompok_id": 1, "slot_id": 1},
    {"kelompok_id": 1, "slot_id": 2},
    {"kelompok_id": 2, "slot_id": 1},
    {"kelompok_id": 2, "slot_id": 2}
  ],
  "ketersediaan_asisten": [
    {"asisten_id": 1, "slot_id": 1},
    {"asisten_id": 1, "slot_id": 2}
  ]
}
```

### 4.2 Field wajib

| Field | Tipe/nullability | Constraint |
|---|---|---|
| `schema_version` | integer, non-null | Harus `1` |
| `source_revision` | integer, non-null | `>= 0` |
| `mata_praktikum` | array, non-null | Item `{id}`; ID unik positif |
| `kelompok` | array, non-null | ID unik positif; `jumlah_peserta > 0` |
| `asisten` | array, non-null | Item `{id}`; ID unik positif |
| `laboratorium` | array, non-null | ID unik positif; `kapasitas > 0` |
| `slot_waktu` | array, non-null | ID unik; hari 1–5; `HH:MM`; durasi 120 menit |
| `praktikum` | array, non-null | ID unik; tepat satu FK mata, kelompok, asisten |
| `ketersediaan_kelompok` | array, non-null | Pasangan ID unik dan referensial valid |
| `ketersediaan_asisten` | array, non-null | Pasangan ID unik dan referensial valid |

Semua ID dan FK adalah integer positif; boolean, string angka, float, dan null ditolak. Unknown top-level atau item field direkomendasikan ditolak pada schema version 1 agar typo tidak diabaikan.

### 4.3 Proyeksi aktif dan urutan

- Flask hanya mengirim entitas aktif yang lolos preflight.
- `is_active`, nama, dan label presentasi tidak dikirim.
- Mata praktikum hanya referensi; bukan variabel CSP.
- Entitas diurutkan menaik berdasarkan `id`.
- Availability diurutkan berdasarkan ID pemilik lalu `slot_id`.
- Flask wajib memakai `ORDER BY`, bukan urutan implisit SQLite.
- Solver payload dan snapshot source dibaca dalam transaksi SQLite yang sama.
- Availability kosong adalah array valid dan berarti tidak tersedia.

## 5. JSON output solver versi 1

Semua output adalah satu objek dan mempunyai `schema_version`, `source_revision`, serta `status`. Jika input berhasil diparse, output wajib menggemakan revision yang sama.

### 5.1 Success

```json
{
  "schema_version": 1,
  "source_revision": 7,
  "status": "success",
  "assignments": [
    {"praktikum_id": 1, "slot_id": 1, "laboratorium_id": 1},
    {"praktikum_id": 2, "slot_id": 2, "laboratorium_id": 1}
  ]
}
```

`assignments` wajib lengkap, tanpa duplikat atau solusi parsial, dan diurutkan menurut `praktikum_id`.

### 5.2 Unsatisfiable

```json
{
  "schema_version": 1,
  "source_revision": 8,
  "status": "unsatisfiable",
  "assignments": []
}
```

Status ini hanya sah bila input valid dan pencarian selesai tanpa solusi. Timeout tidak termasuk unsatisfiable.

### 5.3 Invalid input

```json
{
  "schema_version": 1,
  "source_revision": 7,
  "status": "invalid_input",
  "error": {
    "code": "INVALID_REFERENCE",
    "message": "praktikum[0].kelompok_id tidak ditemukan.",
    "path": "praktikum[0].kelompok_id"
  }
}
```

### 5.4 Internal error

```json
{
  "schema_version": 1,
  "source_revision": 7,
  "status": "internal_error",
  "error": {
    "code": "SOLVER_INTERNAL_ERROR",
    "message": "Solver gagal memproses permintaan."
  }
}
```

Detail exception tidak masuk pesan publik; diagnostik teknis berada di stderr.

### 5.5 Malformed input

Contoh stdin yang sengaja tidak valid:

```text
{"schema_version":1,"source_revision":
```

Respons protokol yang diharapkan bila boundary CLI masih dapat menangani parse error:

```json
{
  "schema_version": 1,
  "source_revision": null,
  "status": "invalid_input",
  "error": {
    "code": "MALFORMED_JSON",
    "message": "Input bukan satu objek JSON yang valid.",
    "path": null
  }
}
```

### 5.6 Shape output

| Status | Exit | Field tambahan wajib | Field yang dilarang |
|---|---:|---|---|
| `success` | 0 | `assignments` non-null dan lengkap | `error` |
| `unsatisfiable` | 0 | `assignments: []` | `error` |
| `invalid_input` | 2 | `error.code`, `error.message`; `error.path` nullable | `assignments` |
| `internal_error` | 3 | `error.code`, `error.message` | `assignments` |

## 6. Pembagian validasi

### 6.1 Flask preflight

- Memastikan ada kegiatan aktif; bila tidak, `DATA_NOT_READY` dan solver tidak dipanggil.
- Memeriksa schema data internal, tipe, rentang, format jam, durasi, dan referensi.
- Memastikan kegiatan aktif hanya merujuk mata, kelompok, dan asisten aktif.
- Mengeluarkan laboratorium dan slot nonaktif dari kandidat.
- Memastikan availability referensial valid; array kosong tetap sah.
- Membaca revision, solver projection, dan snapshot source dalam transaksi baca yang sama.
- Mengurutkan data secara kanonis.
- Tidak memilih slot atau laboratorium.

### 6.2 SWI-Prolog

- Memvalidasi input untuk penggunaan standalone.
- Membentuk satu variabel jadwal per kegiatan.
- Menerapkan C01–C09.
- Menjalankan CLP(FD), propagation, dan labeling/backtracking.
- Menghasilkan satu solusi lengkap pertama atau membuktikan unsatisfiable.
- Tidak menjadikan mata praktikum sebagai variabel CSP.

### 6.3 Flask postflight

- Memvalidasi batas output, UTF-8, satu JSON, shape, tipe, dan unknown field.
- Memvalidasi pasangan exit code/status.
- Memeriksa `schema_version` dan echo `source_revision`.
- Memastikan set `praktikum_id` assignment sama persis dengan input.
- Menolak duplikat dan ID slot/lab yang tidak dikenal.
- Memverifikasi assignment konkret terhadap C01–C09 menggunakan lookup/set dan pemeriksaan interval.
- Tidak melakukan pencarian, backtracking, optimisasi, atau membuat assignment alternatif.
- Memeriksa revision SQLite terkini setelah solver.
- Membuat preview hanya untuk success yang lolos seluruh pemeriksaan dan revision check.

Pelanggaran assignment dari solver menjadi `SOLVER_PROTOCOL_ERROR` atau subkategori integrity internal; tidak ada preview.

## 7. Strategi CSP yang disepakati

- Gunakan `library(clpfd)` dengan immutable request terms.
- Jangan memakai `assertz/1` untuk menyimpan input request sebagai fakta dinamis.
- Setiap kegiatan mempunyai variabel slot dan laboratorium.
- Domain slot dipangkas berdasarkan irisan availability kelompok dan asisten.
- Domain laboratorium dipangkas berdasarkan kapasitas terhadap jumlah peserta.
- C01–C09 dipasang sebelum labeling.
- Konflik kelompok, asisten, dan laboratorium harus mengikuti interval half-open `[start,end)`.
- Karena DEC-023 menjamin slot aktif global tidak overlap, equality slot boleh dipakai sebagai optimisasi jika ekuivalensinya diuji. `all_distinct` tidak boleh diasumsikan sebagai satu-satunya encoding bila semantik interval berubah.
- Verifier Flask selalu memakai interval aktual.
- Ambil satu solusi pertama dan urutkan assignment berdasarkan praktikum ID.
- Benchmark membandingkan `ff`, `ffc`, `step`, `enum`, dan `bisect`, termasuk kombinasi yang valid menurut `labeling/2`.
- Benchmark harus mencakup dataset satisfiable dan unsatisfiable, durasi, timeout, lingkungan, dan validitas hasil.
- Target 20 kelompok, 20 asisten, 10 lab, 40 kegiatan, dan 25 slot adalah target benchmark DEC-012, bukan jaminan kapasitas.
- Timeout tetap 30 detik.

## 8. Matriks kegagalan adapter

| Kondisi | Detektor | Kode internal | Preview | Pesan publik aman |
|---|---|---|---:|---|
| Dataset kosong | Flask preflight | `DATA_NOT_READY` | Tidak | Data penjadwalan belum tersedia. |
| Tidak ada kegiatan aktif | Flask preflight | `DATA_NOT_READY` | Tidak | Belum ada kegiatan aktif untuk dijadwalkan. |
| Tidak ada lab aktif | Flask preflight | `DATA_NOT_READY` | Tidak | Tidak ada laboratorium aktif. |
| Tidak ada slot aktif | Flask preflight | `DATA_NOT_READY` | Tidak | Tidak ada slot waktu aktif. |
| Kegiatan merujuk master nonaktif | Flask preflight | `DATA_NOT_READY` | Tidak | Kegiatan aktif masih merujuk data master nonaktif. |
| Availability kosong membuat domain kosong | Prolog | status `unsatisfiable` | Tidak | Tidak ditemukan jadwal yang memenuhi seluruh aturan. |
| Semua kapasitas tidak cukup | Prolog | status `unsatisfiable` | Tidak | Tidak ditemukan jadwal yang memenuhi seluruh aturan. |
| Konflik penjadwalan | Prolog | status `unsatisfiable` | Tidak | Tidak ditemukan jadwal yang memenuhi seluruh aturan. |
| Input solver rusak/tidak valid | Prolog boundary | `SOLVER_INVALID_INPUT` | Tidak | Data untuk mesin penjadwalan tidak valid. |
| stdout kosong/rusak/ganda | Flask adapter | `SOLVER_PROTOCOL_ERROR` | Tidak | Mesin penjadwalan menghasilkan respons tidak valid. |
| Exit code dan status berbeda | Flask adapter | `SOLVER_PROTOCOL_ERROR` | Tidak | Mesin penjadwalan menghasilkan respons tidak valid. |
| Executable tidak ditemukan | Startup/adapter | `SOLVER_UNAVAILABLE` | Tidak | Mesin penjadwalan tidak tersedia. |
| Timeout 30 detik | Flask adapter | `SOLVER_TIMEOUT` | Tidak | Pencarian melewati batas waktu 30 detik. |
| Crash/exit tidak dikenal | Flask adapter | `SOLVER_PROCESS_ERROR` | Tidak | Mesin penjadwalan gagal dijalankan. |
| Solver mengembalikan internal_error | Flask adapter | `SOLVER_INTERNAL_ERROR` | Tidak | Mesin penjadwalan gagal memproses permintaan. |
| stdout >1 MiB atau stderr >256 KiB | Bounded stream reader | `SOLVER_PROTOCOL_ERROR` atau `SOLVER_PROCESS_ERROR` | Tidak | Respons mesin penjadwalan melebihi batas aman. |
| Assignment melanggar C01–C09 | Flask verifier | `SOLVER_PROTOCOL_ERROR` | Tidak | Mesin penjadwalan menghasilkan respons tidak valid. |
| Revision berubah selama generate | Flask + SQLite | `STALE_GENERATION` | Tidak | Data berubah selama generate. Silakan generate ulang. |

Mapping HTTP publik final untuk seluruh kode di atas berada pada §2.6.

## 9. Fixture kontrak konseptual

Fixture berikut adalah spesifikasi pengujian bersama; belum berupa file fisik.

| Fixture | Input/state | Expected result | Lapisan | Fokus |
|---|---|---|---|---|
| `valid-single` | Satu kegiatan, satu slot tersedia, satu lab cukup | success, satu assignment | Prolog + adapter | C01–C04, C08–C09 |
| `valid-multiple` | Beberapa kegiatan dengan shared group/asisten/lab dan solusi | success lengkap, urut ID | Prolog + verifier | C01–C09, determinisme |
| `unsatisfiable-capacity` | Semua lab lebih kecil dari kelompok | unsatisfiable | Prolog | C04 |
| `unsatisfiable-availability` | Allowlist kosong/tidak ada slot feasible | unsatisfiable | Prolog | C08/C09, DEC-034 |
| `unsatisfiable-conflict` | Kegiatan melebihi kombinasi slot/lab tanpa konflik | unsatisfiable | Prolog | C05–C07 |
| `invalid-reference` | FK JSON menunjuk ID yang tidak ada | invalid_input, exit 2 | Solver standalone | Schema/reference validation |
| `invalid-json` | JSON terpotong | invalid_input, revision null, exit 2 | Solver CLI | Parser boundary |
| `no-active-praktikum` | State SQLite tanpa kegiatan aktif | DATA_NOT_READY; solver tidak dipanggil | Flask preflight | DEC-033 |
| `inactive-master-reference` | Kegiatan aktif merujuk master nonaktif | DATA_NOT_READY; solver tidak dipanggil | Flask preflight | DEC-015 |
| `timeout` | Test double/dataset benchmark melewati 30 detik | SOLVER_TIMEOUT; proses berhenti | Adapter | DEC-011/041 |
| `protocol-corrupted-output` | stdout memiliki debug + JSON atau dua JSON | SOLVER_PROTOCOL_ERROR | Adapter | DEC-030/038 |
| `stale-generation` | Revision berubah setelah solver mulai | STALE_GENERATION; tanpa preview | Flask + SQLite | DEC-024 |

Fixture tambahan wajib untuk implementasi: exit/status mismatch, stdout limit, stderr limit, crash, executable hilang, assignment parsial, assignment duplikat, dan pelanggaran verifier.

## 10. Assignment display dan scheduling

Generate success, save success, active, dan detail history memakai bentuk assignment yang sama:

```json
{"praktikum_id":11,"mata_praktikum":{"id":1,"nama":"Kecerdasan Buatan"},"kelompok":{"id":2,"nama":"IF-3A","jumlah_peserta":24},"asisten":{"id":3,"nama":"Rina"},"slot_waktu":{"id":4,"hari":1,"jam_mulai":"08:00","jam_selesai":"10:00"},"laboratorium":{"id":5,"nama":"Lab AI","kapasitas":30}}
```

Generate mengambil display dari snapshot source sebelum solver. Save, active, dan history mengambilnya dari snapshot immutable, bukan JOIN ulang ke master. Assignment dan snapshot bukan input writable. Generate hanya menerima `{}`; unsatisfiable HTTP 200, assignment kosong, dan tanpa preview. Save hanya menerima `preview_id`. Active kosong adalah HTTP 200 `{"data":null}`.

## 11. Revision, invalidation, dan transaksi

### 11.1 Matriks dampak final

| Mutasi efektif | Revision | Active | Preview ready |
|---|---:|---|---|
| Tambah master/kandidat aktif atau ubah label aktif | +1 | tetap | stale saat diperiksa |
| Kapasitas lab naik, atau turun tetapi semua assignment masih cukup | +1 | tetap | stale saat diperiksa |
| Kapasitas lab turun hingga assignment tidak cukup | +1 | invalid | stale saat diperiksa |
| Jumlah peserta berubah dan seluruh assignment masih cukup | +1 | tetap | stale saat diperiksa |
| Jumlah peserta naik melampaui kapasitas assignment | +1 | invalid | stale saat diperiksa |
| Tambah availability owner aktif | +1 | tetap | stale saat diperiksa |
| Hapus availability yang tidak dipakai assignment active | +1 | tetap | stale saat diperiksa |
| Hapus availability yang dipakai assignment active | +1 | invalid | stale saat diperiksa |
| Tambah/aktifkan/nonaktifkan kegiatan sehingga coverage berubah | +1 | invalid bila active ada | stale saat diperiksa |
| Ubah FK kegiatan aktif | +1 | invalid bila assignment/coverage terdampak | stale saat diperiksa |
| Nonaktifkan mata/kelompok/asisten yang dirujuk kegiatan aktif | +1 | invalid bila active mencakupnya | stale saat diperiksa |
| Nonaktifkan lab/slot yang dipakai assignment active | +1 | invalid | stale saat diperiksa |
| Perubahan entitas nonaktif yang belum relevan, termasuk availability owner nonaktif | tetap | tetap | tetap |
| No-op | tetap | tetap | tetap |

Setiap mutasi efektif pada enam resource bertimestamp memperbarui `updated_at`, termasuk baris nonaktif pada baris kategori C di atas. No-op tidak memperbarui timestamp. Reaktivasi mengevaluasi seluruh state yang menjadi relevan dan menaikkan revision sekali bila dataset aktif berubah. Beberapa mutasi relevan dalam satu transaksi tetap satu increment. DEC-055 memperinci DEC-014: pemakaian entitas saja tidak cukup untuk invalidation; evaluasi memakai assignment active aktual, C01–C09, dan coverage.

### 11.2 Generate

1. Baca dataset aktif, revision, dan snapshot source dalam transaksi baca konsisten; preflight lalu tutup transaksi.
2. Jalankan Prolog di luar transaksi, maksimal 30 detik; verifikasi hasil konkret C01–C09 tanpa pencarian alternatif.
3. Untuk success valid, mulai transaksi write dengan locking yang mencegah race, baca revision terkini di dalam transaksi, lalu bandingkan.
4. Revision berbeda menghasilkan STALE_GENERATION tanpa insert. Revision sama menginsert preview ready beserta expiry, hasil, dan snapshot lalu commit.

Revision check dan insert preview tidak boleh dipisahkan. Hanya success valid menghasilkan preview.

### 11.3 Save dan prioritas preview

Gunakan `BEGIN IMMEDIATE`. Dalam transaksi konsisten, evaluasi: (1) tidak ditemukan → PREVIEW_NOT_FOUND; (2) consumed → PREVIEW_CONSUMED; (3) stale terminal → STALE_PREVIEW; (4) expired terminal → PREVIEW_EXPIRED; (5) ready dan TTL lewat → persist expired, commit, lalu PREVIEW_EXPIRED; (6) ready dan revision berbeda → persist stale, commit, lalu STALE_PREVIEW; (7) valid → archive active lama, buat active baru, simpan snapshot/detail, conditional consume tepat satu baris, dan commit bersama.

Jika ready sekaligus expired dan stale, expiry menang. Status terminal tidak diubah. Commit pada langkah 5/6 wajib agar transisi terminal tidak hilang walau save ditolak. Kegagalan sistem pada jalur valid me-rollback archive, versi, detail, dan consume bersama.

### 11.4 Mutasi master

Satu transaksi melakukan validasi, deteksi no-op, klasifikasi revision, evaluasi assignment/coverage active, update, increment tepat sekali bila perlu, dan invalidation kategori A. Kegagalan rollback seluruhnya. Preview tidak diubah massal karena save selalu memeriksa revision.

## 12. Startup database dan dependency backend

- Inisialisasi dan migrasi SQLite dijalankan hanya melalui CLI maintenance yang eksplisit. Flask tidak menjalankan migrasi pada startup maupun request. Startup hanya melakukan pemeriksaan read-only terhadap kesiapan database/dependency dan gagal aman bila schema belum siap.
- Baseline dependency adalah Flask 3.1.3 dan Flask-CORS 6.0.5. Rentang yang diizinkan sebelum review berikutnya: `Flask>=3.1.3,<3.2` dan `Flask-CORS>=6.0.5,<6.1`.
- Metadata rilis resmi masing-masing mensyaratkan Python `>=3.9` dan `>=3.9,<4.0`, sehingga mencakup Python 3.14. Karena classifier eksplisit upstream belum menjadi bukti pengujian Python 3.14, implementasi wajib memverifikasi instalasi/resolusi pada Python 3.14, menjalankan seluruh unit/contract test, smoke test application factory, dan uji preflight CORS. Versi hasil resolusi direkam secara reproducible sebelum rilis.
- Sumber versi: [Flask di PyPI](https://pypi.org/project/Flask/) dan [Flask-CORS di PyPI](https://pypi.org/project/flask-cors/), diperiksa 19 Oktober 2026. Tahap ini tidak memasang paket atau mengubah manifest dependency.

## 13. Health

GET `/api/v1/health` tidak menjalankan CSP. HTTP 200 bila backend, query ringan database, dan executable SWI-Prolog tersedia. Bila database atau solver unavailable, gunakan HTTP 503 dengan `data.status=degraded` dan status komponen `available|unavailable`. Jangan mengembalikan path, traceback, atau konfigurasi.

## 14. Contoh JSON REST final

Seluruh timestamp mengikuti DEC-018 dan semua blok berikut merupakan JSON valid.

1. List master, HTTP 200:
```json
{"data":[{"id":1,"nama":"Kecerdasan Buatan","is_active":true,"created_at":"2026-10-18T08:00:00.000Z","updated_at":"2026-10-18T08:00:00.000Z"}],"meta":{"page":1,"page_size":20,"total_items":1,"total_pages":1}}
```

2. Detail master, HTTP 200:
```json
{"data":{"id":2,"nama":"IF-3A","jumlah_peserta":24,"is_active":true,"created_at":"2026-10-18T08:00:00.000Z","updated_at":"2026-10-18T08:00:00.000Z"}}
```

3. Create request dan response, HTTP 201:
```json
{"nama":"IF-3A","jumlah_peserta":24}
```
```json
{"data":{"id":2,"nama":"IF-3A","jumlah_peserta":24,"is_active":true,"created_at":"2026-10-18T08:00:00.000Z","updated_at":"2026-10-18T08:00:00.000Z"}}
```

4. PATCH request dan response, HTTP 200:
```json
{"jumlah_peserta":25}
```
```json
{"data":{"id":2,"nama":"IF-3A","jumlah_peserta":25,"is_active":true,"created_at":"2026-10-18T08:00:00.000Z","updated_at":"2026-10-18T08:05:00.000Z"}}
```

5. PATCH status request dan response, HTTP 200:
```json
{"is_active":false}
```
```json
{"data":{"id":2,"nama":"IF-3A","jumlah_peserta":25,"is_active":false,"created_at":"2026-10-18T08:00:00.000Z","updated_at":"2026-10-18T08:06:00.000Z"}}
```

6. GET availability, HTTP 200:
```json
{"data":{"owner_type":"kelompok","owner_id":2,"slot_ids":[1,2,3]}}
```

7. PUT availability request dan response, HTTP 200:
```json
{"slot_ids":[3,1,2]}
```
```json
{"data":{"owner_type":"kelompok","owner_id":2,"slot_ids":[1,2,3]}}
```

8. Validation error, HTTP 422:
```json
{"error":{"code":"VALIDATION_ERROR","message":"Data yang dikirim tidak valid.","details":{"fields":{"jumlah_peserta":"Harus berupa integer positif."}}}}
```

9. Duplicate name, HTTP 409:
```json
{"error":{"code":"DUPLICATE_NAME","message":"Nama sudah digunakan.","details":{"field":"nama"}}}
```

Request generate untuk contoh 10–14 selalu:
```json
{}
```

10. Generate success, HTTP 200:
```json
{"data":{"status":"success","preview_id":"0199f3c7-8d6a-7b21-9a10-63dd370f2a41","preview_status":"ready","source_revision":7,"created_at":"2026-10-18T08:30:00.000Z","expires_at":"2026-10-18T09:00:00.000Z","summary":{"total_praktikum":1,"total_assignment":1},"assignments":[{"praktikum_id":11,"mata_praktikum":{"id":1,"nama":"Kecerdasan Buatan"},"kelompok":{"id":2,"nama":"IF-3A","jumlah_peserta":24},"asisten":{"id":3,"nama":"Rina"},"slot_waktu":{"id":4,"hari":1,"jam_mulai":"08:00","jam_selesai":"10:00"},"laboratorium":{"id":5,"nama":"Lab AI","kapasitas":30}}]}}
```

11. Generate unsatisfiable, HTTP 200 dan tanpa preview:
```json
{"data":{"status":"unsatisfiable","message":"Tidak ditemukan jadwal yang memenuhi seluruh aturan.","assignments":[]}}
```

12. DATA_NOT_READY, HTTP 409:
```json
{"error":{"code":"DATA_NOT_READY","message":"Data penjadwalan belum siap.","details":null}}
```

13. SOLVER_TIMEOUT, HTTP 504:
```json
{"error":{"code":"SOLVER_TIMEOUT","message":"Pencarian melewati batas waktu 30 detik.","details":null}}
```

14. STALE_GENERATION, HTTP 409:
```json
{"error":{"code":"STALE_GENERATION","message":"Data berubah selama generate. Silakan generate ulang.","details":null}}
```

Request save untuk contoh 15–18 selalu:
```json
{"preview_id":"0199f3c7-8d6a-7b21-9a10-63dd370f2a41"}
```

15. Save success, HTTP 201:
```json
{"data":{"id":21,"status":"active","source_revision":7,"created_at":"2026-10-18T08:35:00.000Z","invalidated_at":null,"archived_at":null,"summary":{"total_praktikum":1,"total_assignment":1},"assignments":[{"praktikum_id":11,"mata_praktikum":{"id":1,"nama":"Kecerdasan Buatan"},"kelompok":{"id":2,"nama":"IF-3A","jumlah_peserta":24},"asisten":{"id":3,"nama":"Rina"},"slot_waktu":{"id":4,"hari":1,"jam_mulai":"08:00","jam_selesai":"10:00"},"laboratorium":{"id":5,"nama":"Lab AI","kapasitas":30}}]}}
```

16. STALE_PREVIEW, HTTP 409:
```json
{"error":{"code":"STALE_PREVIEW","message":"Preview tidak lagi sesuai dengan data terkini.","details":null}}
```

17. PREVIEW_EXPIRED, HTTP 409:
```json
{"error":{"code":"PREVIEW_EXPIRED","message":"Preview telah kedaluwarsa.","details":null}}
```

18. PREVIEW_CONSUMED, HTTP 409:
```json
{"error":{"code":"PREVIEW_CONSUMED","message":"Preview sudah pernah disimpan.","details":null}}
```

19. Active empty, HTTP 200:
```json
{"data":null}
```

20. Active success, HTTP 200:
```json
{"data":{"id":21,"status":"active","source_revision":7,"created_at":"2026-10-18T08:35:00.000Z","invalidated_at":null,"archived_at":null,"summary":{"total_praktikum":1,"total_assignment":1},"assignments":[{"praktikum_id":11,"mata_praktikum":{"id":1,"nama":"Kecerdasan Buatan"},"kelompok":{"id":2,"nama":"IF-3A","jumlah_peserta":24},"asisten":{"id":3,"nama":"Rina"},"slot_waktu":{"id":4,"hari":1,"jam_mulai":"08:00","jam_selesai":"10:00"},"laboratorium":{"id":5,"nama":"Lab AI","kapasitas":30}}]}}
```

21. History list, HTTP 200:
```json
{"data":[{"id":21,"status":"active","source_revision":7,"created_at":"2026-10-18T08:35:00.000Z","invalidated_at":null,"archived_at":null,"summary":{"total_praktikum":1,"total_assignment":1}}],"meta":{"page":1,"page_size":20,"total_items":1,"total_pages":1}}
```

22. History detail, HTTP 200:
```json
{"data":{"id":21,"status":"active","source_revision":7,"created_at":"2026-10-18T08:35:00.000Z","invalidated_at":null,"archived_at":null,"summary":{"total_praktikum":1,"total_assignment":1},"assignments":[{"praktikum_id":11,"mata_praktikum":{"id":1,"nama":"Kecerdasan Buatan"},"kelompok":{"id":2,"nama":"IF-3A","jumlah_peserta":24},"asisten":{"id":3,"nama":"Rina"},"slot_waktu":{"id":4,"hari":1,"jam_mulai":"08:00","jam_selesai":"10:00"},"laboratorium":{"id":5,"nama":"Lab AI","kapasitas":30}}],"snapshot":{"schema_version":1,"source_revision":7,"generated_at":"2026-10-18T08:30:00.000Z","saved_at":"2026-10-18T08:35:00.000Z"}}}
```

23. Health success, HTTP 200:
```json
{"data":{"status":"healthy","components":{"backend":"available","database":"available","solver":"available"},"checked_at":"2026-10-18T08:40:00.000Z"}}
```

24. Health degraded/unavailable, HTTP 503:
```json
{"data":{"status":"degraded","components":{"backend":"available","database":"available","solver":"unavailable"},"checked_at":"2026-10-18T08:40:00.000Z"}}
```

Perubahan kontrak setelah disetujui harus melalui review Iqbal, Zicco, dan Galang.
