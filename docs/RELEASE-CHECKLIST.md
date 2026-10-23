# Instalasi bersih dan integrasi terkontrol

F11-F, 23 Oktober 2026. Checklist ini bukan izin merge atau deployment. [Laporan](F11-F-REPORT.md) membedakan run aktual dan langkah operator yang belum diuji.

## Environment yang diuji

Windows x64; Python 3.14.0, SWI-Prolog 10.0.2, Node 24.13.0, npm 11.6.2, Playwright 1.64.1/Chromium yang sudah tersedia di cache mesin.

Virtualenv baru dari `backend/requirements.txt` menghasilkan:

```text
blinker==1.9.0
click==8.5.0
colorama==0.4.6
Flask==3.1.3
flask-cors==6.0.5
iniconfig==2.3.1
itsdangerous==2.2.0
Jinja2==3.1.6
MarkupSafe==3.0.4
packaging==26.3
pluggy==1.7.0
Pygments==2.21.0
pytest==9.1.1
Werkzeug==3.1.9
```

Ini rekaman resolusi yang benar-benar diuji, **bukan** perubahan requirements/keputusan dependency baru. Requirements Python masih berupa rentang, sehingga resolusi mendatang dapat berbeda; ulangi verifikasi bila berubah. Frontend memakai `package-lock.json` dan `npm ci`. Tidak ada dependency proyek yang di-upgrade F11-F.

## Reproduksi pada direktori terisolasi

Jangan melakukan checkout/reset pada workspace kerja. Alternatif arsip di PowerShell, dari root:

```powershell
$installRoot = Join-Path ([IO.Path]::GetTempPath()) ('smart-lab-install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $installRoot | Out-Null
$archivePath = Join-Path $installRoot 'source.zip'
git archive --format=zip --output=$archivePath HEAD
if ($LASTEXITCODE -ne 0) { throw 'Archive gagal' }
Expand-Archive -LiteralPath $archivePath -DestinationPath (Join-Path $installRoot 'repo')
Set-Location (Join-Path $installRoot 'repo')
python -m venv (Join-Path $installRoot 'venv')
$installPython = Join-Path $installRoot 'venv/Scripts/python.exe'
& $installPython -m pip install -r backend/requirements.txt
& $installPython -B -m pytest backend/tests -q -p no:cacheprovider -o tmp_path_retention_policy=none
Set-Location frontend
npm ci --no-audit --no-fund
npm run build
$env:SMART_LAB_E2E_PYTHON = $installPython
# Browser prerequisite: npx playwright install chromium, bila belum tersedia.
# Pastikan port 5173/5007 kosong dan tidak ada suite lain berjalan.
npm run test:e2e -- smoke.spec.ts scheduling.spec.ts --grep 'infrastructure smoke|C02:'
```

F11-F benar-benar menjalankan prosedur setara dari arsip `4de3cf9`, tanpa `.git`, node_modules atau database utama. Hasil: instalasi Python/npm berhasil, build berhasil, backend 472/49 lulus, dua real-browser smoke/SAT lulus. SWI dan cache Chromium berasal dari mesin yang sudah disiapkan; download/install SWI/Chromium pada OS baru, jaringan kosong-cache, Linux/macOS dan air-gapped install **belum diverifikasi**.

Fixture menginisialisasi DB baru lewat CLI resmi, menjalankan application factory dengan launcher WSGI test terverifikasi, Vite, health/CORS, enam route dan Generate→Save→Active→History dengan solver nyata. Ini bukan pengujian deployment production. Command Flask CLI pada README telah dicek terhadap entrypoint/options repository; browser smoke memakai launcher fixture, bukan proses `flask run` manual.

## Checklist operator sebelum demo/integrasi

- [ ] Review diff dan laporan; periksa branch/HEAD/working tree. Jangan anggap persetujuan tim selesai otomatis.
- [ ] Verifikasi versi tool dan executable `swipl`; tidak hanya mengandalkan health sebagai bukti SAT/schema lengkap.
- [ ] Untuk manual dev, gunakan file DB baru dan path eksplisit seperti README. Jangan seed/migrate database pengguna untuk demo.
- [ ] Untuk frontend build/preview, set `VITE_API_BASE_URL` **sebelum build**. `.env.example` hanya contoh, bukan file yang dibaca otomatis.
- [ ] CORS frontend port 5173, API manual 5000 atau fixture 5007. Server lokal saja; tanpa login/authentication.
- [ ] Jalankan rehearsal Inspector/headed dengan [dataset demo](UAS-DEMO.md). Alokasi narasi bukan klaim latency solver.
- [ ] Jalankan regresi lengkap setelah integrasi yang disetujui; cek tidak ada skipped real solver, port/proses/database sementara tertinggal, atau hash utama berubah.

Cleanup: biarkan fixture menyelesaikan teardown. Untuk arsip instalasi besar di luar fixture, hanya hapus direktori unik yang dibuat prosedur ini **setelah** semua proses berhenti dan path absolut/parent/basename diverifikasi. Jangan memakai wildcard, Temp root, workspace root, atau path database utama sebagai target. Jangan memindahkan hasil tes terisolasi menjadi database pengguna secara otomatis.

## Risiko dependency/security

- `npm audit --omit=dev --json`: 0 kerentanan yang dilaporkan registry pada run F11-F.
- `npm audit --json`: tujuh **paket terdampak** high, bukan tujuh root advisory independen. Root advisory yang ditampilkan adalah [braces stack-exhaustion DoS](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- Rantai aktual: `shadcn@4.22.1 → fast-glob@3.3.3 → micromatch@4.0.8 → braces@3.0.3`; jalur tambahan melalui `@shadcn/registry@0.2.0` dan `ts-morph@26.0.0 → @ts-morph/common@0.27.0` menuju fast-glob yang sama. Shadcn adalah direct devDependency; enam lainnya transitive.
- Cakupan serangan yang relevan adalah CLI/tooling dengan pola glob tidak tepercaya. Halaman React tidak mengimpor CLI JavaScript tersebut; build memakai stylesheet shadcn. Jangan menghapus package secara buta karena CSS build masih merujuk package ini.
- Npm menyarankan perubahan shadcn mayor/downgrade ke 1.0.0 untuk rantai tertentu; ini **bukan** mitigasi otomatis yang disetujui. Hindari input/registry/glob tidak tepercaya, review CLI/dependency terpisah dan uji ulang sebelum perubahan.
- Severity advisory tetap high; konteks local-demo membatasi exposure, bukan membuktikan package aman. Tidak ada audit CVE Python otomatis, pentest, atau sertifikasi supply-chain/WCAG menyeluruh dalam milestone ini.
- Scan pola key/token dan nama file tracked tidak menemukan kandidat secret/db/build artifacts. Scan pola bukan bukti mutlak tidak adanya secret. Ignore root kini melindungi `.venv`, `.env*`, cache dan SQLite yang belum dilacak; tidak menghapus file atau mengubah file tracked.

## Rencana integrasi manual, setelah approval baru

Ref lokal F11-F: `main aa2567c` → `feature/prolog-engine f9f3a9d` → `integration/prolog-backend 6935bd2` → `feature/frontend 4de3cf9`. Semua hubungan ancestor terverifikasi; ahead masing-masing 2, 21, 13 commit. Main tertinggal frontend 36 commit, tanpa divergensi pada ref lokal.

1. Review/commit hasil F11-F melalui pengguna, tanpa memasukkan DB/venv/dist. Commit belum dibuat oleh agen.
2. Sebelum operasi Git, pengguna boleh memperbarui ref remote lewat fetch yang disetujui, lalu ulangi ancestry/diff/conflict audit. Ref lokal sekarang dapat stale; tidak ada fetch/pull pada tugas ini.
3. Bila ancestry tetap linear dan working tree bersih, integrasi paling kecil adalah fast-forward `main` ke tip `feature/frontend` yang telah direview. Itu sudah memuat Prolog dan backend; tidak perlu menggabungkan ulang keduanya atau cherry-pick patch yang sama.
4. Contoh **untuk operator setelah approval**, bukan perintah yang dijalankan F11-F: `git switch main`, lalu `git merge --ff-only feature/frontend`. Jika gagal, STOP dan review; jangan force/reset/rebase otomatis. Push memerlukan izin tersendiri.
5. Post-integration: backend full + schema, Prolog full, frontend typecheck/lint/unit/build/bundle, E2E lalu infra berurutan; inventory 40 method/path, real SAT/UNSAT/versioning/invalidation/recovery, health/CORS dan DB hash.

Tidak ada konflik tekstual yang diprediksi **untuk fast-forward lokal**; ini bukan simulasi merge tree dengan ref remote baru. Dokumentasi F11-F menyentuh README/task board/spec status, sehingga perlu review bila anggota lain mengubah path yang sama setelah checkpoint.
