# TASK F11-E — Accessibility, Responsive UX & Frontend Performance

Tanggal verifikasi: 22 Oktober 2026. Verdict: **READY FOR REVIEW**.

## A. Repository checkpoint

- Branch awal/akhir: `feature/frontend`; HEAD tetap `ab544bb`.
- Working tree awal bersih. Akhir: 24 file tracked dimodifikasi dan 10 file baru, seluruhnya di `frontend/`.
- Tidak ada install/update dependency, staging, commit, push, merge, perubahan backend/Prolog/schema/kontrak, atau pekerjaan F11-F.

File dimodifikasi (path relatif terhadap `frontend/`):

```text
README.md
e2e/network-failures.spec.ts
e2e/scheduling.spec.ts
src/App.test.tsx
src/api/__tests__/query.test.tsx
src/app/routes.tsx
src/features/availability/AvailabilityPage.test.tsx
src/features/constraint-studio/AssignmentsTable.tsx
src/features/constraint-studio/ConstraintStudioPage.test.tsx
src/features/constraint-studio/Diagnostics.tsx
src/features/constraint-studio/PreviewLifetime.tsx
src/features/master-data/MasterDataPage.test.tsx
src/features/master-data/MasterForm.tsx
src/features/master-data/ResourceWorkspace.tsx
src/features/overview/Overview.test.tsx
src/features/schedule-history/HistoryDetail.tsx
src/features/schedule-history/ScheduleHistoryPage.test.tsx
src/features/schedule-history/VersionStatus.tsx
src/features/timetable/ScheduleTable.tsx
src/features/timetable/SnapshotView.tsx
src/features/timetable/TimetablePage.test.tsx
src/pages/ConstraintStudioPage.tsx
src/pages/OverviewPage.tsx
src/pages/ScheduleHistoryPage.tsx
```

File baru:

```text
F11-E-REPORT.md
e2e/accessibility.spec.ts
e2e/lazy-routes.spec.ts
scripts/bundle-report.mjs
src/app/LazyPages.test.tsx
src/app/LazyPages.tsx
src/components/TableScroll.tsx
src/components/Timestamp.tsx
src/lib/presentation.test.tsx
src/lib/presentation.ts
```

## B. Baseline audit

- Enam halaman diimpor eager oleh konfigurasi routes. Build aktual sebelum edit: satu JS **676.754 byte raw**, Vite melaporkan gzip sekitar **207,34 kB**, dengan warning chunk >500 kB.
- Shell sudah memiliki landmarks, skip link, mobile drawer Radix, active navigation, focus styling dan tombol ikon berlabel. Modal sudah mendukung Escape/focus restoration; tidak diganti.
- Form sudah memiliki label dan asosiasi error, tetapi belum menandai kewajiban field secara native/visual.
- Tabel sudah memiliki header `scope="col"`, tetapi wrapper scroll belum diberi nama/fokus/hint keyboard.
- Status jadwal berupa enum dan timestamp berupa ISO UTC mentah; belum ada formatter tanggal terpusat.
- Pengujian browser menemukan overflow Timetable 384 px pada viewport 375 px ketika filter memuat label panjang. Ini diperbaiki dengan stacking/basis kontrol, bukan menyembunyikan overflow dokumen.
- Pemeriksaan source: shell mengimpor React/router, Radix Dialog, tombol, ikon dan provider Query; halaman master menambahkan RHF/resolver/Zod. Tidak ada library chart. Ikon diimpor bernama. Tidak dilakukan atribusi byte per-package yang belum diukur.

## C. Accessibility improvements

- `MasterForm`: `required` pada input/select dan penjelasan terlihat bahwa semua field wajib. Label/error IDs, `aria-invalid`, validasi RHF, serta `noValidate` tetap bekerja.
- `TableScroll`: region berlabel, `tabIndex=0`, asosiasi hint terlihat, fokus terlihat, dan scroll horizontal lokal. Dipakai pada master, preview, kandidat domain, timetable dan history.
- Route lazy memiliki status loading yang terbaca dan boundary error aman; key per route memastikan fallback muncul pada perpindahan halaman. Shell/provider tidak ikut di-reset.
- Browser menguji enam navigasi dengan Tab/Enter; mobile drawer menutup dan memulihkan fokus; dialog berfokus di dalam, Escape/cancel mengembalikan fokus; required/error announcement association; submit dengan keyboard; checkbox availability dengan Space; Generate/Save dengan Enter; ring fokus terlihat; scroll tabel dengan ArrowRight.
- Unit test rejected lazy import memastikan error fallback tidak membocorkan pesan internal dan shell/query cache tetap dipertahankan.
- Tidak ada axe/dependency baru. Bukti ini adalah pemeriksaan semantic/keyboard terfokus, bukan sertifikasi WCAG atau pengujian screen reader menyeluruh.

## D. Responsive results

| Halaman | 375×812 | 768×1024 | 1440×900 |
| --- | --- | --- | --- |
| Overview | Lulus | Lulus | Lulus |
| Data Master | Lulus | Lulus | Lulus |
| Resource Availability | Lulus | Lulus | Lulus |
| Constraint Studio | Lulus | Lulus | Lulus |
| Timetable | Lulus | Lulus | Lulus |
| Schedule History | Lulus | Lulus | Lulus |

Pengujian menggunakan master berlabel panjang, jadwal hasil Prolog nyata yang disimpan, detail history, dialog create dan navigasi keyboard. Tidak ada overflow dokumen; tabel lebar tetap scroll lokal dan dapat dioperasikan keyboard. Primary actions diuji sesuai konteks. Screenshot Timetable ketiga viewport juga diperiksa secara visual; charcoal/off-white/amber dipertahankan.

## E. Presentation polish

- Label jadwal: `active` → Aktif, `invalid` → Tidak Valid, `archived` → Diarsipkan, termasuk filter history dan qualifier status cache.
- Nilai enum API/query dan arti status tidak berubah. Status health/diagnostik teknis tidak diganti secara buta dengan label jadwal.
- `Intl.DateTimeFormat('id-ID', {timeZone:'Asia/Jakarta', ...})` menampilkan WIB. Contoh UTC `2026-10-18T08:30:00.000Z` → `18 Okt 2026, 15.30.00 WIB`.
- Nilai UTC asli tetap pada `datetime` dan tooltip. Missing/invalid/ambiguous timestamp ditampilkan aman; rollover tanggal/tahun diuji.
- Expiry, revision, assignment, cache warnings, UNSAT, uncertain save dan larangan retry otomatis tidak diubah. Tidak ada telemetri baru atau penyimpanan nilai presentasi ke SQLite.

## F. Bundle comparison

Pengukuran raw byte dari output production pada mesin yang sama; kB pada tabel berarti 1.000 byte, bukan KiB. Script membaca manifest dan menelusuri dependency **static** transitif, bukan hanya ukuran entry file.

| Metrik raw JS | Baseline | Sesudah |
| --- | ---: | ---: |
| Bootstrap: entry + static imports | 676.754 B | 427.324 B |
| Landing Overview termasuk graph halaman lazy | 676.754 B | 559.954 B |
| Chunk terbesar | 676.754 B | 382.878 B |
| Seluruh JS yang dihasilkan | 676.754 B | 685.401 B |
| Jumlah chunk JS | 1 | 22 |
| Warning chunk >500 kB | Ada | Tidak ada |

Bootstrap turun **36,86%**; graph landing Overview turun **17,26%**. Total semua JS naik **1,28%**, karena fitur kecil baru dan overhead pemisahan module. Tidak semua chunk dimuat saat startup.

Gzip sesudah, dihitung Node `gzipSync` per file: bootstrap **136.525 B**, graph Overview **176.735 B**. Persentase perbandingan di atas hanya memakai raw byte yang konsisten; angka gzip baseline dari reporter Vite tidak dipakai untuk menghitung persentase terhadap script Node.

Chunk utama sesudah: entry 382.878 B, resources/shared DTO layer 108.495 B, master page 67.061 B, shared button 44.446 B; page Studio 14.124 B, History 12.964 B, Availability 12.355 B, Timetable 9.431 B, Overview 8.926 B. Sisanya shared helpers dan not-found.

Chunk kecil adalah sharing otomatis Vite, tanpa manualChunks atau perubahan warning limit. Trade-off: lebih banyak request/cache entries; belum ada bukti untuk menambahkan grouping manual yang rapuh. CSS naik dari sekitar 46,68 ke 47,56 kB; CSS/font tidak dimasukkan ke pengurangan JS.

Reproduksi dari `frontend/`:

```powershell
npm run build -- --manifest
node scripts/bundle-report.mjs
```

## G. Performance evidence

- Lingkungan: Windows, Node 24.13.0, Vite 8.3.5, Playwright 1.64.1, Chromium nyata, Flask/SWI-Prolog lokal.
- Cold load Overview meminta hanya module page Overview; Availability baru diminta saat navigasi. Import Availability ditahan secara terkontrol untuk membuktikan fallback terlihat dan main/shell tidak dilepas.
- Cold document load Studio, Timetable, History lulus; tidak ada runtime exception/console error tak diharapkan. Pesan error jaringan terkontrol pada tes failure lama tetap diaudit secara terbatas.
- Overview + Availability: 46 percobaan GET di development StrictMode, 23 browser-completed dan 23 dibatalkan, 23 URL query unik, maksimum dua percobaan per URL. Pembatalan browser bukan bukti bahwa backend tidak sempat memproses GET.
- Tidak ada pengukuran latency route yang diklaim sebagai benchmark. E2E memakai Vite development server; hasil bukan bukti kecepatan production atau perbandingan CPU/network. Kegagalan import diuji terisolasi di unit, bukan simulasi deployment/CDN chunk production yang hilang.

## H. Regression results

| Perintah | Hasil akhir |
| --- | --- |
| `npm run test:e2e` | **32 passed**, 0 failed; 4,1 menit |
| `npm run test:e2e:infra` | **8 passed**, 0 failed |
| `npm test` | **383 passed**, 0 failed, 0 skipped; 13 file |
| `npm run typecheck` | Lulus |
| `npm run lint` | Lulus, 0 warning |
| `npm run build -- --manifest` | Lulus, tanpa warning chunk besar |
| `git diff --check` | Lulus |

Dari root, regresi Prolog:

```powershell
swipl -q -f none -g "load_files(['prolog/tests/test_solver.pl','prolog/tests/test_contract.pl','prolog/tests/test_benchmark.pl']),run_tests,halt"
```

Hasil: **73 passed**, 0 failed. Backend pytest dan SQLite standalone tidak diulang: tidak ada perubahan backend/shared contract; integrasi backend/SQLite/Prolog nyata tetap berjalan pada E2E menggunakan database terisolasi. Angka baseline backend 472/49 bukan hasil pengujian ulang tugas ini.

Riwayat verifikasi: assertion presentasi/sinkron diperbarui untuk WIB/label/lazy loading tanpa menghapus tes atau pemeriksaan status API mentah. Kegagalan tes awal mengungkap overflow mobile dan fallback transisi yang kemudian diperbaiki. Satu run infra dijalankan ketika browser sedang menggunakan port, sehingga 2 tes infra ditolak port guard; pengulangan berurutan lulus 8/8. Semua angka pada tabel adalah pengulangan akhir, bukan klaim bahwa semua percobaan awal lulus.

## I. Safety

- SHA256 database utama sebelum/sesudah identik:
  `100259E0500795633CDE0D23F76E0637ABCC02B5252663DDFC5DE85C12C20D7B`.
- Port 5173/5007 tidak memiliki listener pada pemeriksaan akhir.
- Tidak ada proses fixture Flask/Vite yang tertinggal; tidak ada direktori `smart-lab-e2e-*` tersisa.
- Fixture tetap membuat SQLite baru per tes, menjaga port guard dan hanya menghentikan proses miliknya sendiri.
- `dist/`, build-info di node_modules, dan screenshot/report standar `test-results/` adalah artefak ignored, tidak masuk daftar file perubahan Git.
- Tidak ada file terhapus atau perubahan dependency. Pemeriksaan whitespace file untracked juga bersih.

## J. Remaining risks / F11-F

- Review screen reader, contrast menyeluruh, zoom/OS/browser lain dan production cache/chunk-failure deployment belum dicakup audit terfokus ini.
- Banyak shared chunk kecil dan graph landing sekitar 560 kB masih perlu profiling production sebelum optimasi tambahan; tidak ada janji percepatan dari bytes saja.
- Warning terminal `NO_COLOR`/`FORCE_COLOR` berasal dari environment runner, bukan error aplikasi.
- Tidak ada keputusan desain bisnis baru atau blocker tersisa. F11-F belum dikerjakan/dinyatakan selesai.

## K. Final verdict

**READY FOR REVIEW**. Tidak ada commit/push.

Usulan commit setelah review: `feat(frontend): improve accessibility responsive UX and lazy routing`.
