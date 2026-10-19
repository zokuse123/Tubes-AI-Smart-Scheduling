# Smart Lab Scheduling System

Aplikasi lokal untuk menyusun jadwal kegiatan praktikum laboratorium. React adalah klien web, Flask menyediakan REST API dan mengelola data/transaksi, SQLite menyimpan data serta riwayat jadwal, dan SWI-Prolog menjadi satu-satunya mesin pencari solusi CSP. Flask memverifikasi hasil solver, tetapi tidak mencari jadwal alternatif.

## Status implementasi

Backend Flask mengimplementasikan 40 operasi REST v1, termasuk CRUD enam resource, availability, generate/save, active/history, dan health. Fondasi database serta migrasi eksplisit tersedia. Solver Prolog terintegrasi melalui CLI JSON. Backend dan solver memiliki automated tests; frontend React masih dalam pengembangan dan belum menjadi bagian dari repository ini.

Kontrak dan keputusan desain tetap bersumber pada `docs/DECISIONS.md`, `docs/API-CONTRACT.md`, `docs/DATA-MODEL.md`, dan dokumen lain dalam `docs/`. Persetujuan/review anggota tim dan tugas yang masih terbuka tetap perlu diselesaikan secara terpisah.

## Prasyarat

- Windows 10/11 atau lingkungan lokal setara.
- Python 3.14.
- SWI-Prolog tersedia di `PATH` sebagai `swipl`, atau path executable diberikan melalui `SMART_LAB_SWIPL`.
- Dependensi Python dari `backend/requirements.txt`: Flask 3.1.x dan Flask-CORS 6.0.x sesuai rentang DEC-065, serta pytest untuk pengujian.

Periksa SWI-Prolog dari PowerShell:

```powershell
Get-Command swipl
swipl --version
```

## Instalasi dan inisialisasi

Jalankan dari root repository di PowerShell:

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
```

Pilih lokasi database dan executable SWI-Prolog. `SMART_LAB_SWIPL` opsional bila `swipl` sudah berada di `PATH`.

```powershell
$env:SMART_LAB_DATABASE = (Join-Path (Get-Location) 'backend\db\lab_scheduling.db')
# Opsional: isi dengan path hasil Get-Command swipl, khususnya bila tidak ada di PATH.
# $env:SMART_LAB_SWIPL = 'C:\path\to\swipl.exe'
```

Database baru maupun migrasi database lama dijalankan **secara eksplisit**; Flask tidak melakukan migrasi otomatis:

```powershell
python backend\db\init_db.py --db-path $env:SMART_LAB_DATABASE
```

Jalankan backend:

```powershell
python -m flask --app backend.app:create_app run --debug --host 127.0.0.1 --port 5000
```

Health check tersedia di `GET http://127.0.0.1:5000/api/v1/health`. HTTP 200 berarti backend, database, dan executable/CLI solver tersedia; HTTP 503 dengan status `degraded` menunjukkan database atau solver tidak tersedia. Health check tidak menjalankan CSP dan tidak memutasi database.

## REST API dan integrasi frontend

Base URL API: `http://127.0.0.1:5000/api/v1`. Semua response memakai envelope kontrak API. Endpoint mencakup:

- Enam resource master/kegiatan: `mata-praktikum`, `kelompok`, `asisten`, `laboratorium`, `slot-waktu`, dan `praktikum` (list, detail, create, partial update, status).
- Availability kelompok dan asisten (GET dan PUT full replacement).
- Scheduling: `POST /jadwal/generate`, `POST /jadwal/simpan`, `GET /jadwal/aktif`, `GET /jadwal/riwayat`, dan `GET /jadwal/riwayat/{id}`.
- Diagnostik: `GET /health`.

Alur normal: generate menghasilkan preview sementara; frontend menampilkan preview; save menerima `preview_id`; setelah tersimpan, versi tersedia melalui active dan history. Generate, save, active, dan history tetap terpisah sesuai kontrak. Lihat `docs/API-CONTRACT.md` untuk request/response, validasi, status HTTP, dan kode error lengkap.

Flask-CORS mengizinkan origin Vite lokal `http://localhost:5173` dan `http://127.0.0.1:5173`. Origin lain tidak dikonfigurasi. CORS bukan autentikasi.

## Pengujian

Dari root repository:

```powershell
python -m pytest backend/tests -q
python -m pytest backend/tests/test_schema.py -q
python -m compileall -q backend/app backend/db backend/tests
```

Jalankan seluruh unit, contract, dan benchmark tests Prolog:

```powershell
swipl -q -f none -g "load_files(['prolog/tests/test_solver.pl','prolog/tests/test_contract.pl','prolog/tests/test_benchmark.pl']),run_tests,halt"
```

Tes backend dengan SWI-Prolog nyata di-skip otomatis bila `swipl` tidak tersedia. Untuk detail fixture solver dan benchmark, lihat `prolog/README.md`.

## Troubleshooting Windows

- `swipl` tidak ditemukan: install SWI-Prolog, buka PowerShell baru, lalu pastikan `Get-Command swipl` berhasil; atau set `SMART_LAB_SWIPL` ke executable yang ditemukan.
- `DATA_NOT_READY`/`DATABASE_ERROR`: pastikan `SMART_LAB_DATABASE` menunjuk file database yang sudah diinisialisasi dengan perintah CLI di atas. Startup Flask tidak membuat database atau migrasi otomatis.
- Port 5000 sedang dipakai: jalankan Flask dengan `--port` lain dan sesuaikan base URL klien.
- CORS ditolak: gunakan salah satu origin Vite yang dikonfigurasi atau minta perubahan konfigurasi melalui review; jangan menonaktifkan pemeriksaan CORS untuk menutupi masalah.
- Path mengandung spasi: gunakan kutip PowerShell saat memasukkan path executable atau database.
