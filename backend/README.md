# Backend Flask / SQLite / SWI-Prolog

Backend lokal memakai application factory `backend.app:create_app`. Jalankan dari root repository; tidak ada `app.py`/scheduler daemon terpisah. [Quick start](../README.md) dan [checklist instalasi](../docs/RELEASE-CHECKLIST.md) mencatat environment dan versi teruji.

## Konfigurasi dan startup

- Python 3.14; `python -m pip install -r backend/requirements.txt` di virtualenv.
- `SMART_LAB_DATABASE`: path SQLite eksplisit. Default konfigurasi adalah `backend/db/lab_scheduling.db`; jangan gunakan default ini untuk demo/testing.
- `SMART_LAB_SWIPL`: executable SWI-Prolog, default `swipl` di PATH. CLI path diambil dari repository, bukan dari request pengguna.
- Inisialisasi/migrasi hanya melalui `python backend/db/init_db.py --db-path <path>`. CLI dapat memigrasikan file yang sudah ada; untuk demo hanya gunakan file baru di direktori terisolasi, dan tolak target yang sudah ada. Backup/review sebelum maintenance data pengguna.
- Flask tidak membuat/memigrasikan database otomatis. Koneksi memakai foreign keys dan busy timeout; transaction boundary berada pada service/mutation layer.

```powershell
# SMART_LAB_DATABASE harus sudah menunjuk file yang diinisialisasi secara eksplisit.
python -m flask --app backend.app:create_app --no-debug run --host 127.0.0.1 --port 5000 --no-reload
```

CORS localhost/127.0.0.1:5173, tanpa authentication. Server development hanya untuk lokal; tidak ada janji deployment production.

## Lapisan dan kontrak

| Lokasi | Tanggung jawab |
| --- | --- |
| `app/api.py`, `errors.py` | 40 method/path API, strict request/query, envelope, serializer dan error aman |
| `app/mutations.py` | CRUD/soft status, availability, no-op, revision/invalidation, `BEGIN IMMEDIATE` |
| `app/scheduling_dataset.py` | Solver payload dan label snapshot dari satu transaksi baca |
| `app/solver_adapter.py` | Subprocess `shell=False`, stdin JSON, bounded capture, exit/protocol validation |
| `app/solver_verifier.py` | Memeriksa assignment konkret C01–C09, tidak mencari solusi |
| `app/scheduling.py` | Generate/preview/save/active/history, TTL, transaksi, integritas snapshot |
| `db/` | Schema/trigger dan init/migrasi eksplisit; tidak diubah F11-F |

30 operasi resource master/kegiatan + empat availability + lima scheduling + satu health. [API-CONTRACT](../docs/API-CONTRACT.md) tetap sumber kebenaran. Tidak ada DELETE, GET preview, restore history atau auto-generate.

- Sukses memakai `{data: ...}`, list menambahkan `meta` pagination. Active kosong adalah 200 `{data:null}`.
- Error memakai `{error:{code,message,details}}`; UNSAT adalah hasil normal 200, bukan error teknis.
- Health 200 healthy / 503 degraded memeriksa koneksi DB (`SELECT 1`) dan path executable/CLI. Tidak menjalankan CSP dan tidak menjamin seluruh schema/data siap.
- CLI input v1, output v2 divalidasi adapter. Persistensi hasil success tetap v1 tanpa diagnostik. Timeout 30 detik, stdout 1 MiB, stderr 256 KiB; error teknis tidak menjadi UNSAT.
- Preview UUIDv4, TTL 30 menit, single-use. Save ulang ditolak `PREVIEW_CONSUMED`; ini bukan dukungan retry idempotent. Stale/expired terminal dipersistensikan sesuai prioritas kontrak. Tidak ada restore jadwal invalid.
- Timestamp canonical UTC milidetik; WIB hanya presentasi frontend. Diagnostik generate tidak disimpan ke preview/history.

## Verifikasi

```powershell
python -B -m pytest backend/tests -q -p no:cacheprovider -o tmp_path_retention_policy=none
python -B -m pytest backend/tests/test_schema.py -q -p no:cacheprovider -o tmp_path_retention_policy=none
```

Fixture memakai database sementara; beberapa tes real solver di-skip bila SWI tidak tersedia, sehingga selalu baca jumlah skipped. Jangan mengganti fixture dengan database utama. F11-F menjalankan 472 tes backend + 49 subtests, termasuk real CLI, serta 117 tes schema + 49 subtests secara terpisah; bukan 589 tes unik. [Laporan F11-F](../docs/F11-F-REPORT.md) memuat bukti dan keterbatasan reproduksibilitas dependency.
