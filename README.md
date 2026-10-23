# Smart Lab Scheduling System

Sistem Penjadwalan Praktikum Laboratorium Berbasis Constraint Satisfaction Problem (CSP) Menggunakan SWI-Prolog. Aplikasi lokal untuk mengalokasikan kegiatan praktikum ke slot mingguan dan laboratorium, dengan kapasitas, konflik, dan availability sebagai hard constraints.

## Status dan arsitektur

Enam halaman React telah diimplementasikan: Overview, Data Master, Resource Availability, Constraint Studio, Timetable, dan Schedule History. Flask menyediakan **40 operasi REST**, SQLite menyimpan data/preview/snapshot, dan SWI-Prolog adalah satu-satunya pencari solusi CSP. Python memverifikasi assignment konkret, bukan mencari jadwal alternatif.

```text
React → Flask REST /api/v1 → dataset SQLite konsisten → SWI-Prolog CLP(FD)
                ← hasil terverifikasi / preview ←
                → save atomik → SQLite versi/snapshot → active/history → React
```

Checkpoint F11-F pada 23 Oktober 2026: [laporan dan bukti regresi](docs/F11-F-REPORT.md). Siap/tidaknya integrasi mengikuti verdict laporan dan review manusia, bukan klaim bahwa branch sudah di-merge. MVP lokal tanpa autentikasi/deployment; jangan expose server development ke jaringan publik.

## Struktur

```text
docs/       kontrak, keputusan, blueprint, demo dan laporan kesiapan
backend/    Flask app/, SQLite db/, tests/, requirements.txt
prolog/     CSP solver, JSON CLI, fixture, tests dan benchmark
frontend/   React/Vite, typed API client, unit tests dan Playwright E2E
```

## Prasyarat dan instalasi

Teruji: Python **3.14.0**, SWI-Prolog **10.0.2**, Node **24.13.0**, npm **11.6.2**. Frontend memakai React 19, Vite 8, TypeScript 6, Tailwind v4 dan shadcn/ui. Backend memakai Flask 3.1.3 dan Flask-CORS 6.0.5. Daftar versi hasil instalasi serta batas verifikasi ada pada [checklist instalasi](docs/RELEASE-CHECKLIST.md).

Dari root, PowerShell:

```powershell
python -m venv .venv
& .\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
Get-Command swipl
swipl --version
```

Di terminal frontend:

```powershell
Set-Location frontend
npm ci
# Hanya bila Chromium Playwright belum tersedia:
npx playwright install chromium
npm run dev
```

Bila execution policy memblokir aktivasi, gunakan langsung `.\.venv\Scripts\python.exe`, tanpa mengubah kebijakan global. `npm ci` menggunakan lockfile; jangan gunakan `npm audit fix --force`.

## Database dan menjalankan backend

Pilih **file baru** secara eksplisit; contoh ini menolak file yang sudah ada. Untuk migrasi database lama, backup dan review terlebih dahulu, bukan menjalankannya sebagai reset demo.

```powershell
$env:SMART_LAB_DATABASE = (Join-Path (Get-Location) 'backend/db/local-dev.sqlite')
if (Test-Path -LiteralPath $env:SMART_LAB_DATABASE) { throw 'File sudah ada; pilih path database baru, jangan overwrite.' }
# Opsional bila swipl tidak ada di PATH:
# $env:SMART_LAB_SWIPL = (Get-Command swipl).Source
python backend/db/init_db.py --db-path $env:SMART_LAB_DATABASE
python -m flask --app backend.app:create_app --no-debug run --host 127.0.0.1 --port 5000 --no-reload
```

Flask tidak menjalankan init/migration otomatis. Terminal berikutnya cukup mengatur kembali environment/path database yang sama dan menjalankan Flask, **tanpa** mengulangi blok pembuatan database.

Frontend development default API: `http://127.0.0.1:5000/api/v1`. Untuk override, gunakan `frontend/.env.example` sebagai acuan `VITE_API_BASE_URL` pada environment atau `.env.local` lalu restart Vite. Nilai VITE masuk bundle publik: jangan isi secret. CORS hanya mengizinkan origin `http://localhost:5173` dan `http://127.0.0.1:5173`; bukan autentikasi.

`GET /api/v1/health`: 200 healthy atau 503 degraded dalam data envelope. Ini memeriksa koneksi database dan ketersediaan path solver, **bukan** pembuktian schema lengkap atau SAT.

Build membutuhkan API URL eksplisit untuk penggunaan production/preview:

```powershell
# Dari frontend/
$env:VITE_API_BASE_URL = 'http://127.0.0.1:5000/api/v1'
npm run build
npm run preview -- --host localhost --port 5173 --strictPort
```

Jangan jalankan dev/preview dan E2E bersamaan pada 5173. Hosting production di luar lingkup MVP.

## API dan siklus jadwal

30 operasi enam master/kegiatan (list, detail, create, PATCH parsial, status), empat GET/PUT availability, lima scheduling, satu health. Tidak ada DELETE atau GET preview. [Kontrak API](docs/API-CONTRACT.md) adalah sumber field/envelope/error.

Generate menerima `{}`. SAT menghasilkan preview UUIDv4 dengan TTL 30 menit; UNSAT HTTP 200 tidak membuat preview. Save hanya menerima `preview_id`, single-use: replay menghasilkan 409, bukan save idempotent yang boleh diulang otomatis. Save mengarsipkan active lama yang masih valid; versi invalid tidak diaktifkan kembali. Snapshot historis immutable.

Perubahan data efektif menaikkan revision sesuai dampak; perubahan yang merusak coverage/assignment menginvalidasi active. Nama aktif dapat men-stale preview tanpa menginvalidasi active. Setelah save dengan respons jaringan tidak pasti, periksa active/history; jangan retry otomatis.

C01–C09, SAT/UNSAT dan lima skenario demo dijelaskan di [panduan UAS](docs/UAS-DEMO.md). Timestamp tersimpan UTC, ditampilkan WIB; diagnostik sementara hanya pada generate, bukan history.

## Pengujian

Dari root:

```powershell
python -B -m pytest backend/tests -q -p no:cacheprovider -o tmp_path_retention_policy=none
python -B -m pytest backend/tests/test_schema.py -q -p no:cacheprovider -o tmp_path_retention_policy=none
swipl -q -f none -g "load_files(['prolog/tests/test_solver.pl','prolog/tests/test_contract.pl','prolog/tests/test_benchmark.pl']),run_tests,halt"
```

Dari frontend:

```powershell
npm run typecheck
npm run lint
npm test
npm run build -- --manifest
node scripts/bundle-report.mjs
npm run test:e2e
npm run test:e2e:infra
```

Lint yang tersedia adalah **oxlint**, bukan ESLint. Jalankan kedua suite E2E/infra **berurutan**; keduanya memiliki port 5173/5007. Fixture memakai SQLite baru dan proses miliknya sendiri, bukan database utama. Gunakan `SMART_LAB_E2E_PYTHON` untuk executable virtualenv bila perlu. Detail: [frontend](frontend/README.md), [backend](backend/README.md), [Prolog](prolog/README.md).

## Troubleshooting dan batasan

- SWI tidak ditemukan: buka terminal baru setelah instalasi, verifikasi PATH atau atur `SMART_LAB_SWIPL` ke executable valid.
- Port sibuk: minta pemilik menghentikan server; E2E tidak memakai/mematikan proses asing.
- Database belum siap: periksa path/init eksplisit; jangan men-seed atau me-reset database pengguna. Availability kosong berarti tidak tersedia, bukan tersedia penuh.
- CORS/base URL salah: cocokkan origin 5173 dan port API. `.env.example` tidak dimuat otomatis.
- Path Windows berspasi: kutip path dan gunakan operator `&` untuk executable.
- Tujuh paket dev pada rantai CLI shadcn masih terkena advisory high; audit production saat verifikasi = 0. Hindari pola/registry tidak tepercaya dan lakukan review dependency terpisah; jangan auto-upgrade.
- Batas dataset terjamin belum dikunci. Tidak ada optimasi preferensi, diagnosis minimal UNSAT core, login, restore history, atau ekspor yang dijanjikan.
- Review tim, deadline UAS, slide/video final dan persetujuan integrasi masih terpisah. Lihat [task board](docs/TASK-BOARD.md).
