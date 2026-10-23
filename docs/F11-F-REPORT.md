# F11-F — Final Regression, Integration Readiness & UAS Demo Preparation

Tanggal: **23 Oktober 2026**. Verdict tugas: **INCOMPLETE** — regresi/instalasi/dokumentasi selesai, tetapi cleanup arsip instalasi sementara memerlukan tindakan manual karena kebijakan tool menolak penghapusan. Tidak ada blocker fungsional aplikasi yang ditemukan pada cakupan verifikasi ini.

## A. Repository baseline

Observasi langsung awal: `feature/frontend`, HEAD `4de3cf9`, working tree bersih. Head tetap sama setelah tugas; tidak ada checkout, commit, push, pull, fetch, merge, rebase, reset atau perubahan index.

Struktur aktual: `backend/app`, `backend/db`, `backend/tests`, `prolog` dan tests/fixtures/benchmark, serta frontend React dengan enam halaman dan unit/Playwright tests. `frontend/F11-E-REPORT.md` tersedia; angkanya diperlakukan historis dan diverifikasi ulang.

Tools aktual: Windows x64, Python 3.14.0, SWI-Prolog 10.0.2, Node 24.13.0, npm 11.6.2. Flask 3.1.3, Flask-CORS 6.0.5, pytest 9.1.1. Package frontend menggunakan lockfile; Playwright 1.64.1. Lint repository adalah **oxlint**, bukan ESLint; tidak menambahkan runner baru.

Database utama: `backend/db/lab_scheduling.db`. SHA256 sebelum/sesudah:

```text
100259E0500795633CDE0D23F76E0637ABCC02B5252663DDFC5DE85C12C20D7B
```

Port 5173/5007 kosong saat baseline. Tidak ada dependency atau source produk yang diubah. Backend README/root ignore belum tersedia pada baseline; root README masih menyatakan frontend belum ada.

## B. Files changed

Dimodifikasi:

- `README.md`: overview, struktur, versi teruji, setup/startup aktual, API/lifecycle, testing, CORS/production URL dan link dokumen fokus.
- `frontend/README.md`: link hasil F11-F/demo/checklist serta status cleanup yang belum selesai.
- `docs/PROJECT-SPEC.md`: status implementasi aktual; pernyataan historis ditandai superseded dan istilah lama `no_solution` dijelaskan sebagai `unsatisfiable` pada kontrak final.
- `docs/DATA-MODEL.md`: status header berdasarkan implementasi dan tes, bukan perubahan schema.
- `docs/DECISIONS.md`: default labeling aktual dibedakan dari pertanyaan strategi optimal/batas dataset yang masih terbuka. Tidak ada DEC baru atau perubahan keputusan teknis.
- `docs/TASK-BOARD.md`: checkbox teknis berdasarkan bukti; persetujuan tim/rehearsal/merge tetap unchecked, cleanup F11-F tetap terbuka.

Baru:

- `.gitignore`: perlindungan non-source untuk virtualenv, environment/secret lokal, cache dan SQLite yang belum dilacak. Tidak menghapus/mengubah data.
- `backend/README.md`: konfigurasi, lapisan, kontrak, perintah test dan batas health.
- `docs/UAS-DEMO.md`: definisi C01–C09 aktual, lima skenario deterministik, UI actions, reset aman dan fallback.
- `docs/RELEASE-CHECKLIST.md`: instalasi terisolasi, resolved Python versions, dependency findings dan rencana integrasi manual.
- `docs/F11-F-REPORT.md`: laporan ini.

Total 11 path: enam tracked modified, lima untracked. Tidak ada perubahan Python/TypeScript/Prolog/SQL, endpoint, schema, algorithm, dependency manifest/lockfile atau test assertion. Tidak ada file yang dihapus.

## C. Complete regression results

Semua hasil berikut adalah run aktual F11-F, bukan salinan F11-E.

| Cakupan / command | Hasil |
| --- | --- |
| `python -B -m pytest backend/tests -q -p no:cacheprovider -o tmp_path_retention_policy=none` | **472 passed, 49 subtests passed**, 0 failed/skipped; 34,37 s |
| Command yang sama pada `backend/tests/test_schema.py` | **117 passed, 49 subtests passed**, 0 failed/skipped; 0,82 s |
| Prolog command di bawah | **73 passed**, exit 0 |
| `npm run typecheck` | Lulus |
| `npm run lint` (oxlint) | Lulus, tanpa warning lint |
| `npm test` | **383 passed**, 13 file, 0 failed/skipped; 25,50 s |
| `npm run build -- --manifest` | Lulus, tanpa warning chunk >500 kB |
| `node scripts/bundle-report.mjs` | Bootstrap raw **427.324 B**, gzip **136.525 B**; Overview graph raw **559.954 B**, gzip **176.735 B**; largest chunk **382.878 B**, 22 JS chunks |
| `npm run test:e2e` | **32 passed**, 0 failed/skipped; 4,3 menit |
| `npm run test:e2e:infra` setelah browser selesai | **8 passed**, 0 failed/skipped |
| Read-only route inventory dari application factory | **40/40** pasangan method/path; scheduling **5** |
| Read-only AST parse backend | **28 file Python** berhasil diparse |
| `git diff --check`, pemeriksaan whitespace file baru | Bersih |

Prolog dari root:

```powershell
swipl -q -f none -g "load_files(['prolog/tests/test_solver.pl','prolog/tests/test_contract.pl','prolog/tests/test_benchmark.pl']),run_tests,halt"
```

Schema 117/49 adalah subset yang dijalankan ulang, bukan tambahan 117 tes unik pada 472. Kedua suite browser/infra sengaja berurutan karena menggunakan port yang sama. Peringatan environment `NO_COLOR`/`FORCE_COLOR` pada runner tidak sama dengan error console aplikasi. Tidak ada runtime exception/console error tak diharapkan; error jaringan yang disengaja pada failure tests tetap dibatasi oleh audit fixture.

Tidak menjalankan benchmark performa baru atau mengklaim pengurangan latency. Output bundle identik dengan F11-E; graph bootstrap menghitung entry + static imports, bukan hanya entry file. CSS/fonts tidak dihitung sebagai JS.

## D. Cross-layer integration findings

Flow terverifikasi: UI → typed API client → Flask `api.py` → snapshot dataset SQLite → subprocess SWI → validasi CLI dan independent verifier → preview SQLite → REST/UI → save atomik → active/history snapshot. Bukti langsung meliputi source dan tests pada matriks E.

Temuan, dengan severity readiness terpisah dari severity advisory:

| ID / severity | Reproduksi dan bukti | Dampak / tindakan |
| --- | --- | --- |
| F01 MINOR, diperbaiki | Baca root README baseline pada HEAD `4de3cf9` §Status; menyebut frontend belum ada, sedangkan routes/E2E nyata tersedia. Task board awal juga unchecked untuk implementasi backend/frontend. | Dokumen menyesatkan onboarding. README/task board/status spec disinkronkan, tanpa menganggap persetujuan tim selesai. |
| F02 MINOR, diperbaiki | Root `.gitignore` tidak ada; `git check-ignore .venv/pyvenv.cfg .env` tidak melindungi path root, meskipun backend/frontend memiliki ignore sendiri. | Risiko file lokal masuk staging saat mengikuti instruksi venv. Tambah root ignore; `.env.example` tetap tersedia dan tidak diabaikan. |
| F03 MINOR readiness, advisory HIGH tetap terbuka | `npm audit --json`: tujuh paket dev terdampak pada rantai shadcn/braces; audit production 0. Rantai/versi pada §I dan RELEASE-CHECKLIST. | Tidak ditemukan exposure CLI tersebut dalam runtime UI; tetap hindari input/registry/glob tidak tepercaya dan review dependency terpisah. Tidak auto-fix/downgrade. |
| F04 MINOR, terbuka | `backend/requirements.txt:6–10` memakai rentang; clean virtualenv berhasil, namun transitive resolution dapat berubah. | Resolved versions direkam pada checklist. Lock/constraint policy lanjutan perlu review tim, bukan diubah sepihak. |
| F05 INFORMATIONAL | `backend/app/api.py:283` health hanya `SELECT 1` + ketersediaan path executable/CLI; tidak menjalankan solver/schema audit. Reproduksi source: inspeksi fungsi, diperkuat health tests. | Healthy bukan pembuktian dataset ready/SAT/schema lengkap. Dokumentasi menegaskan batas ini; tidak dianggap pelanggaran kontrak health. |
| F06 INFORMATIONAL | `git merge-base --is-ancestor` dan rev-list lokal menunjukkan rantai linear; tidak ada fetch. | Tidak ada konflik untuk fast-forward lokal, tetapi remote dapat berubah. Audit ulang setelah fetch yang disetujui, sebelum integrasi. |
| F07 BLOCKER penutupan tugas, bukan produk | Setelah clean-install dan seluruh proses berhenti, path arsip unik/divalidasi masih ada. `Remove-Item -LiteralPath <path-unik> -Recurse -Force` ditolak kebijakan tool sebelum dieksekusi. | Arsip source/node_modules/venv sementara belum dibersihkan. Jangan mencoba bypass; pengguna perlu menghapus direktori unik secara manual dan mengonfirmasi sebelum milestone ditutup penuh. |

Tidak ada perubahan source untuk F01–F07. Tidak ditemukan blocker fungsional aplikasi/MAJOR regression dalam cakupan tes. Bukan klaim tidak adanya defect pada semua kondisi.

## E. Requirement-to-test traceability

Referensi relatif root; nomor baris source berlaku pada `4de3cf9` (source tidak berubah pada tugas ini).

| Requirement | Implementasi | Bukti pengujian aktual |
| --- | --- | --- |
| 30 operasi enam master + empat availability | `backend/app/api.py:305`, `mutations.py:258,282,313,351`; typed frontend services | `test_read_api.py`, `test_mutations.py`, `test_slot_praktikum_mutations.py`, `test_availability.py`; E2E `scheduling.spec.ts` C01 |
| 40 operasi final, tidak ada GET preview/DELETE; lima scheduling | `backend/tests/route_inventory.py`; `api.py:217–338` | `test_schedule_read.py:256`, save/health inventory; assertion actual set equality 40/40 |
| C01 satu assignment per kegiatan | `prolog/solver.pl` make_task/materialize/task_assignment; `solver_verifier.py:26` coverage equality | `test_solver.pl:88`, verifier coverage tests; C02/C03 E2E |
| C02 registered slot / C03 registered lab | `prolog/validation.pl` references; solver available_slots/capable_labs | `test_solver.pl:95,101`, invalid FK/domain tests; verifier unknown reference tests |
| C04 kapasitas | `solver.pl` capable_labs; Python verifier capacity comparison | `test_solver.pl:107`, `test_solver_verifier.py:63`, E2E C04 |
| C05 kelompok / C06 asisten / C07 lab conflicts | `solver.pl` constrain_pair; verifier half-open interval comparisons | `test_solver.pl:111,130,142`, `test_solver_verifier.py:70,76`; D01 real UNSAT, C03 parallel SAT |
| C08/C09 allowlist, empty is unavailable | `solver.pl` ord_intersection; dataset reader availability joins | `test_solver.pl:147,153`, verifier availability tests, real UNSAT contract fixtures |
| Konsistensi snapshot/revision; inactive reference bukan silent omission | `scheduling_dataset.py:25` BEGIN + ordered reads; `scheduling.py:192` postflight | `test_scheduling_dataset.py`, `test_schedule_generate.py:260,320,374`; stale-generation race |
| Strict CLI v2; projected persisted v1; honest errors | `solver_adapter.py:249,333`, `solver_cli.pl` process_validated/caught_response | `test_solver_adapter.py`, `test_solver_hardening.py`, Prolog CLI/contract tests, `test_schedule_read.py:268` real persistence |
| Independent concrete verification, bukan Python solver | `solver_verifier.py:26`; adapter validation calls verifier | `test_solver_verifier.py`, `test_solver_adapter.py:170`, valid/invalid assignments and interval boundaries |
| UUIDv4, TTL 30 menit, expiry equality | `scheduling.py:235–289,293,438`; `_utc_now` sampled after lock | `test_schedule_save.py` UUID/expiry; `test_e2e_failure_guarantees.py:28` -1 ms success / exact expiry 409 |
| Single-use save, atomicity, concurrent saves | `scheduling.py:438`, BEGIN IMMEDIATE + conditional consume; `schema.sql:672` single active | `test_schedule_save.py:189,282,308,329,451`; E2E D03/D08 |
| Uncertain save tidak auto-retry | `frontend/src/features/constraint-studio/useStudio.ts:13`, retry false and uncertain state | `network-failures.spec.ts` D06 proves commit before response loss; D07 delayed response; component tests |
| Immutable version/history | `scheduling.py:505,600,645`; `schema.sql:686,741,887` immutable guards | `test_schedule_read.py:167,179,189,222`; `test_schedule_save.py:392`; E2E C04/C05 |
| Revision/no-op/invalidation, reactivation tidak restore invalid | `mutations.py:159,188,282,313,351` | mutation/availability tests, inactive/no-op tests; E2E C04/D02 |
| Query invalidation / late-response / draft guard | `frontend/src/api/invalidation.ts:11`; studio sequence/AbortController; availability editor | `query.test.tsx`, `races.spec.ts`, C04/C05; network failure/cache qualifiers |
| UTC persisted / WIB presentation | schema timestamp checks; `frontend/src/lib/presentation.ts:13`, Timestamp | schema 117/49, `presentation.test.tsx`, immutable persistence tests and browser timestamp attributes |
| Semantic accessibility, responsive, lazy loading | layout/Radix Modal, TableScroll, `app/LazyPages.tsx`, keyed route boundaries | accessibility.spec.ts all six routes × three viewports + keyboard; LazyPages unit rejected import; lazy-routes.spec.ts runtime |
| Health/CORS/read-only checks | `api.py:283`, factory CORS config, solver_available path check | `test_health.py`, smoke.spec.ts; 200 healthy/503 degraded shape and no mutation tests |

Coverage adalah bukti run finite, bukan pembuktian formal semua dataset/semua browser. Domain candidate counts bukan diagnosis UNSAT global. Save bukan replay-idempotent: replay ditolak 409 dan tidak membuat versi duplikat.

## F. Documentation changes

Root README tetap menjadi pintu masuk, dengan detail dipisah ke backend README, UAS-DEMO, RELEASE-CHECKLIST dan laporan ini. Endpoint, CLI, environment, cold build URL, CORS, explicit DB init, test commands dan troubleshooting sesuai repository. Pernyataan lama pada spec dipertahankan sebagai konteks historis bila perlu.

Tidak mengubah DEC-001–DEC-067 atau kontrak API substantif. Draft/review formal tim tidak diubah menjadi persetujuan. Audit prototipe Prolog lama, batas dataset terjamin, deadline, slide/video final dan approval integrasi masih terbuka.

## G. Demo datasets and scenarios

Dokumen [UAS-DEMO.md](UAS-DEMO.md) menyediakan dataset dan aksi persis, bukan seed ke database utama:

| Skenario | Dataset / bukti real E2E | Expected observable result |
| --- | --- | --- |
| SAT | C02: satu kelompok 20, asisten, mata/kegiatan, lab 30, Senin 08–10, kedua availability mengizinkan slot | SAT/verification passed, preview lalu consumed, satu active/history |
| UNSAT | D01: dua kegiatan **kelompok sama**, asisten berbeda, dua lab 30, satu slot, availability valid | Global C05 tidak terpenuhi meski tiap kegiatan punya domain awal; UNSAT tanpa preview/save/versi |
| Versioning | C04: dataset tunggal valid; simpan V1, invalidasi/repair, simpan V2 lalu V3 | V1 invalid, V2 archived, V3 active; snapshot lama tetap terbaca |
| Invalidation | C04: ubah 20 peserta → **31**, melebihi lab terpakai 30 | Active hilang; History Tidak Valid; mengembalikan 20 tidak restore V1 |
| Recovery | D02: preview lama lalu rename mata via tab lain | Revision naik, active lama tetap valid, save preview lama 409 STALE_PREVIEW; generate eksplisit memulihkan |

Kelima skenario dijalankan pada suite penuh. Alternatif D06 uncertain save memakai controlled network fault **setelah commit nyata terbukti**, bukan mematikan backend pengguna. Reset melalui teardown dan rerun fixture; tidak ada reset/delete endpoint. CLI SAT/UNSAT menjadi fallback reasoning tanpa menjanjikan save/history. Rehearsal Inspector/headed, slide/video dan presentasi operator belum dilakukan; alokasi narasi di panduan bukan benchmark runtime.

## H. Clean-install verification

Menggunakan `git archive HEAD` dari `4de3cf9`, diekstrak ke direktori OS Temp unik, bukan checkout/branch baru. Archive tidak memuat `.git`, DB utama atau node_modules. Dibuat virtualenv baru, install requirements, dan `npm ci --no-audit --no-fund` (502 packages), lalu production build.

Hasil langsung:

- Install Python dan npm berhasil; resolved Python versions direkam pada RELEASE-CHECKLIST.
- Backend full pada environment baru: **472 passed + 49 subtests**, 0 failed/skipped, 29,25 s.
- Clean-copy build/typecheck berhasil, code splitting tetap tersedia.
- Dengan `SMART_LAB_E2E_PYTHON` menunjuk virtualenv baru, `npm run test:e2e -- smoke.spec.ts scheduling.spec.ts --grep 'infrastructure smoke|C02:'`: **2 passed**, 17,6 s. Termasuk DB init CLI, Flask factory launcher, health/CORS, enam route, real SWI SAT/verifier/save/active/history. Copy tidak memiliki primary DB (hash fixture null), sementara hash utama workspace tetap diverifikasi terpisah.

SWI dan browser Chromium memakai instalasi/cache mesin yang sudah tersedia; tidak mengklaim pengujian fresh OS, download tanpa cache, distribusi production, atau install offline. Manual `flask run`/`vite preview` bukan proses yang digunakan browser smoke; opsi/entrypoint dokumentasinya diperiksa, sedangkan runtime smoke memakai launcher fixture. Source aplikasi pada workspace tidak berubah terhadap archive yang diuji.

Cleanup arsip belum berhasil (§K). Karenanya clean-install **eksekusi lulus**, penutupan resource sementara **belum lengkap**.

## I. Dependency/security review

Run aktual `npm audit --omit=dev --json`: 0 vulnerabilities. Run full `npm audit --json`: tujuh paket terdampak high, root advisory [braces DoS](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

| Paket terpasang | Direct? | Konteks |
| --- | --- | --- |
| shadcn 4.22.1 | Direct dev | CLI dan package stylesheet; CLI JS bukan runtime aplikasi |
| @shadcn/registry 0.2.0 | Transitive dev | Rantai registry CLI |
| ts-morph 26.0.0 | Transitive dev | Tooling transformasi source CLI |
| @ts-morph/common 0.27.0 | Transitive dev | Rantai ts-morph |
| fast-glob 3.3.3 | Transitive dev | Glob tooling |
| micromatch 4.0.8 | Transitive dev | Glob matching |
| braces 3.0.3 | Transitive dev | Root stack-exhaustion advisory pada deeply nested patterns |

Ini bukan tujuh root advisory independen. Paket terdampak berada pada jalur shadcn (lihat checklist), bukan hasil scan runtime browser. Severity high tidak diturunkan; exposure local-demo berbeda dari CLI dengan input tidak tepercaya. Hindari untrusted registry/pattern, review dependency terpisah. Npm suggested major/downgrade bukan izin auto-fix; package tidak dihapus karena build CSS masih merujuknya.

Tidak menambah pip-audit/security dependency. Audit CVE Python otomatis/pentest/supply-chain provenance tidak dijalankan. Scan pola private keys/token dan nama file tracked tidak menemukan kandidat secret, DB, node_modules/dist atau bytecode terlanjur dilacak. Scan pola bukan jaminan menyeluruh. Root ignore kini menutup risiko `.venv`/`.env` lokal; `.env.example` tetap tidak diabaikan. Tidak ditemukan hard-coded user-machine paths pada source production yang diaudit; config memakai repository-relative paths/environment.

## J. Branch integration plan

Ref lokal, tanpa fetch:

| Ref | HEAD | Hubungan |
| --- | --- | --- |
| main | aa2567c | Ancestor semua branch yang diaudit |
| feature/prolog-engine | f9f3a9d | 2 commit di atas main |
| integration/prolog-backend | 6935bd2 | 21 commit di atas Prolog |
| feature/frontend | 4de3cf9 | 13 commit di atas integration; 36 di atas main |

Semua pasangan ancestor di atas terverifikasi exit 0; left/right divergence `0/36` main/frontend, `0/13` integration/frontend, `0/21` Prolog/integration. Tracking refs lokal sesuai HEAD yang terdaftar, bukan bukti remote terkini.

Tidak diperlukan merge tiga patch duplikat: frontend sudah mengandung Prolog/backend. Setelah pengguna mereview dan mengommit F11-F, memperbarui ref dengan izin, serta memastikan ancestry masih linear, opsi terkecil adalah fast-forward main ke feature/frontend. Contoh perintah operator dan post-merge regression ada pada RELEASE-CHECKLIST; **tidak dijalankan** tugas ini.

Tidak ada konflik untuk fast-forward lokal. Ini bukan jaminan untuk perubahan remote mendatang. Delta frontend sejak integration mencakup `frontend/` dan tambahan 87 baris tes `backend/tests/test_e2e_failure_guarantees.py`; lintas-folder test tersebut sudah ada di checkpoint, bukan perubahan source F11-F. Dokumen status/root README perlu review bila anggota lain mengedit path yang sama. Dependency/config overlap tidak divergen pada chain lokal; jangan rebase/reset/force bila audit berikutnya berbeda.

## K. Database/process safety evidence

- Hash utama identik sebelum/sesudah seperti §A. Tidak men-seed/migrate database pengguna.
- Full E2E, infra, clean-copy smoke memakai DB baru, owned processes, port guard dan cleanup fixture yang sama. Masing-masing log memverifikasi shutdown serta SQLite/WAL/SHM cleanup.
- Pemeriksaan akhir: port 5173/5007 tidak memiliki listener; direktori `smart-lab-e2e-*` tersisa **0**; proses fixture Flask/Vite tidak tertinggal.
- Pytest memakai retention policy none/no cacheprovider; tidak menghapus direktori pytest historis atau data pengguna.
- **Arsip instalasi yang masih ada:** `%TEMP%/smart-lab-f11f-install-b111a4c628b74eceabb3633508c54c1d`. Hanya berisi `repo/`, `venv/`, `source.zip` yang dibuat tugas ini. Parent/basename/path absolut telah diperiksa dan proses Python/Node yang menggunakan target sudah 0 sebelum cleanup dicoba.
- Penghapusan rekursif target tersebut ditolak policy tool sebelum eksekusi. Tidak mencoba mekanisme alternatif/bypass. Pengguna perlu menghapus **hanya direktori unik tersebut** secara manual; jangan Temp root/workspace/DB utama. Isinya dapat diregenerasi dari HEAD/lockfile/requirements, tidak mengandung pekerjaan unik pengguna.
- `dist`, node_modules/cache dan screenshot test di workspace tetap artefak ignored, bukan file siap commit. Tidak ada index/staging changes. Ignore rule baru bukan bukti cleanup arsip berhasil.

## L. Remaining risks and limitations

1. Cleanup arsip instalasi manual dan konfirmasi ulang diperlukan sebelum F11-F dinyatakan tertutup penuh.
2. Advisory high pada dev CLI dan reproducibility Python berbasis rentang memerlukan follow-up review, bukan auto-upgrade.
3. Auth/deployment bukan MVP; healthy bukan schema/SAT readiness; frontend production memerlukan API URL eksplisit saat build.
4. Batas dataset terjamin, profiling production, semua browser/OS, screen reader/contrast menyeluruh belum dikunci/dibuktikan.
5. Fresh tool/cache download, operasi merge/push, rehearsal headed, slide/video dan review tim tidak dilakukan.

## M. Final verdict

**INCOMPLETE** untuk penutupan F11-F, semata karena cleanup arsip instalasi masih memerlukan pengguna. Gate fungsional/regresi yang dijalankan lulus; tidak ada perubahan atau perbaikan source produk yang diperlukan dari audit ini. Ini bukan otorisasi integrasi ke main atau klaim merge.

Tindakan berikut: pengguna membersihkan direktori unik pada §K, mengonfirmasi cleanup, lalu review diff/dokumentasi dan status readiness akhir. Commit belum dibuat. Usulan setelah approval: `docs: finalize integration readiness and UAS demo preparation`.
