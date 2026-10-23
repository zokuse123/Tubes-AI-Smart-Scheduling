# TASK-BOARD.md
**Status (verifikasi F11-F, 23 Oktober 2026):** solver, SQLite, 40 operasi backend, dan enam halaman frontend telah diimplementasikan dan diuji pada `feature/frontend` HEAD `4de3cf9`. Checklist teknis di bawah tidak menggantikan persetujuan/review tiga anggota atau bukti merge. Laporan: [F11-F-REPORT.md](F11-F-REPORT.md).

## Gerbang 0: wajib sebelum coding
- [x] Tetapkan pemisahan `mata_praktikum` sebagai katalog dan `praktikum` sebagai kegiatan melalui DEC-013.
- [x] Finalisasi dokumentasi skema 12 tabel, revision/invalidation, state machine, transaksi, dan snapshot melalui DEC-014–DEC-027.
- [x] Finalisasi kontrak subprocess, JSON solver, verifier, CSP, failure matrix, dan fixture konseptual melalui DEC-028–DEC-042.
- [x] Finalisasi kontrak REST v1 40 operasi, envelope/status/error, assignment display, transaksi, dan health melalui DEC-043–DEC-059.
- [x] Finalisasi kontrak backend nested praktikum, sorting/search, timestamp/revision, lifecycle database, dan kebijakan dependency melalui DEC-061–DEC-065 (TASK 10A.1; dokumentasi saja).
- [x] Finalisasi ambiguitas kontrak scheduling melalui DEC-066: canonical persisted solver result, UUID preview, dan sorting history (TASK 13A.1; dokumentasi saja).
- [x] Finalisasi kontrak observabilitas solver melalui DEC-067 (TASK 13G.1; kontrak dokumentasi; implementasinya diselesaikan melalui TASK 13G.2–13G.5).
- [ ] Bertiga review PROJECT-SPEC, DATA-MODEL, AI-RULES, API-CONTRACT dan DECISIONS.
- [ ] Catat bukti formal izin/persetujuan yang diperlukan dan konfirmasi tanggal deadline; penggunaan Flask/React dinyatakan aman dalam konteks TASK 10A.1, tetapi review tiga anggota belum dianggap selesai.
- [ ] Sepakati GitHub repo, branch, cara review PR, dan aturan perubahan spesifikasi.

## Galang — Prolog
- [ ] Audit prototipe lama read-only, catat komponen yang boleh diadaptasi tanpa memindahkan sumber.
- [x] Desain predikat/modul baru sesuai AI-RULES dan kontrak input-output tersedia di `prolog/`.
- [x] Implementasi solver CSP untuk kegiatan praktikum multi-lab/multi-asisten.
- [x] Tes C01–C09, unsatisfiable, edge case; 73 tes Prolog lulus pada F11-F.
- [x] Harness benchmark bertingkat/optimasi dan pengujiannya tersedia. F11-F tidak menjalankan ulang benchmark performa; batas dataset terjamin/review hasil tetap terbuka pada checklist bersama.

## Iqbal — Frontend
- [x] Blueprint/layout enam halaman tersedia; ini bukan bukti persetujuan formal wireframe oleh semua anggota.
- [x] Setup React + Vite + Tailwind + shadcn/ui tersedia.
- [x] Implementasi halaman CRUD terintegrasi Flask nyata; mock hanya pada tes terkontrol, bukan perilaku production.
- [x] Implementasi generate/preview/simpan dan pesan error, termasuk uncertain save tanpa retry otomatis.
- [x] Tes UI/integrasi: F11-F 383 unit/component dan 32 browser E2E lulus, ditambah 8 tes infrastruktur.

## Zicco — Backend
- [x] Finalisasi ERD, constraint SQLite, foreign keys, fondasi database awal (TASK 08).
- [x] Implementasi DEC-060: timestamp `created_at`/`updated_at` pada 6 tabel master, migrasi idempoten table rebuild, dan regression test (konteks TASK 10A.1: migrasi selesai; 117 tes dan 49 subtest dilaporkan lulus).
- [x] Implementasi dan uji DEC-061–DEC-065 pada backend tersedia; F11-F menjalankan full suite 472 tes + 49 subtests.
- [x] Setup Flask application factory dan konfigurasi SQLite tanpa auto-migration.
- [x] CRUD, soft delete, ketersediaan, revision dan invalidasi atomik (TASK 10).
- [x] Adapter subprocess JSON Prolog dengan timeout 30 detik dan bounded streams.
- [x] Preview TTL 30 menit, save atomik single-use, riwayat dan snapshot immutable.
- [x] Tes error, race condition, transaksi, exact expiry dan real CLI lulus pada F11-F.

## Bersama — integrasi dan UAS
- [x] Uji alur data → generate → preview → simpan → riwayat dengan database sementara dan solver nyata.
- [x] Uji edit/nonaktif data → jadwal invalid → generate baru serta versi archived/invalid/active.
- [ ] Review hasil benchmark dan putuskan batas dataset.
- [ ] Susun tutorial 5 poin dosen, slide, demo, dan video.

## TASK 13G — Observabilitas Solver Studio (IMPLEMENTED)
- [x] TASK 13G.1: finalisasi kontrak dokumentasi observabilitas (DEC-067).
- [x] TASK 13G.2: implementasi `wall_time_ms` pada response generate dengan monotonic clock dan uji SAT/UNSAT/error.
- [x] TASK 13G.3: implementasi `domain_candidates` dari Prolog CLI output schema v2; adapter memvalidasi lalu memproyeksikan hasil solver v1 untuk persistensi.
- [x] TASK 13G.3A: hardening klasifikasi UNSAT dan regresi persistensi v1.
- [x] TASK 13G.4: implementasi `verification.overall` dari hasil nyata `verify_assignments()`; tanpa matriks per-constraint.
- [x] TASK 13G.5: audit regresi final observabilitas; PASS WITH NOTES. Tindak lanjut: sinkronisasi status dokumentasi (TASK 13G.6).
- [x] TASK 13G.6: sinkronisasi status dokumentasi dengan implementasi DEC-067; tidak mengubah fitur atau kontrak.

## Definition of Done
Tugas hanya selesai jika: kriteria jelas, kode/review sesuai spesifikasi, tes relevan dijalankan, hasil didokumentasikan, dan PR disetujui. Tidak cukup hanya 'AI bilang selesai'.

## F11 — final integration readiness

- [x] F11-A sampai F11-E: audit, infrastruktur browser, workflow nyata, failure/concurrency, accessibility/responsiveness dan lazy loading tersedia pada checkpoint; bukti F11-E tetap pada `frontend/F11-E-REPORT.md`.
- [x] F11-F: regresi lengkap dan clean-install terisolasi dijalankan; dokumentasi, traceability dan lima skenario demo disiapkan.
- [ ] F11-F: cleanup manual direktori arsip instalasi sementara yang ditolak kebijakan tool, lalu konfirmasi readiness akhir. Lihat laporan; source aplikasi tidak berubah.
- [ ] Review manusia terhadap diff F11-F dan persetujuan integrasi. Belum ada commit/push/merge oleh agen.
- [ ] Rehearsal presentasi interaktif, slide/video dan persetujuan final tim UAS.
