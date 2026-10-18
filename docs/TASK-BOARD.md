# TASK-BOARD.md
**Status:** item implementasi belum dikerjakan. Item keputusan dokumentasi yang telah diselesaikan ditandai terpisah; PIC adalah usulan pembagian kerja, bukan bukti implementasi sudah dimulai.

## Gerbang 0: wajib sebelum coding
- [x] Tetapkan pemisahan `mata_praktikum` sebagai katalog dan `praktikum` sebagai kegiatan melalui DEC-013.
- [x] Finalisasi dokumentasi skema 12 tabel, revision/invalidation, state machine, transaksi, dan snapshot melalui DEC-014–DEC-027.
- [x] Finalisasi kontrak subprocess, JSON solver, verifier, CSP, failure matrix, dan fixture konseptual melalui DEC-028–DEC-042.
- [x] Finalisasi kontrak REST v1 40 operasi, envelope/status/error, assignment display, transaksi, dan health melalui DEC-043–DEC-059.
- [ ] Bertiga review PROJECT-SPEC, DATA-MODEL, AI-RULES, API-CONTRACT dan DECISIONS.
- [ ] Konfirmasi izin dosen memakai Python/web sebagai pendukung Prolog dan tanggal deadline.
- [ ] Sepakati GitHub repo, branch, cara review PR, dan aturan perubahan spesifikasi.

## Galang — Prolog
- [ ] Audit prototipe lama read-only, catat komponen yang boleh diadaptasi tanpa memindahkan sumber.
- [ ] Desain predikat/modul baru sesuai AI-RULES dan kontrak input-output.
- [ ] Implementasi solver CSP untuk kegiatan praktikum multi-lab/multi-asisten.
- [ ] Tes semua constraint, unsatisfiable, edge case.
- [ ] Benchmark dataset bertingkat; catat waktu, hasil, lingkungan, dan batas praktis.

## Iqbal — Frontend
- [ ] Rancang wireframe dashboard, data master, ketersediaan, preview, riwayat.
- [ ] Setup React + Vite + Tailwind + shadcn/ui setelah kontrak disetujui.
- [ ] Implementasi halaman CRUD dengan mock respons yang sesuai kontrak.
- [ ] Implementasi generate/preview/simpan dan pesan error.
- [ ] Tes UI dan integrasi API.

## Zicco — Backend
- [ ] Finalisasi ERD, constraint SQLite, foreign keys, migrasi awal.
- [ ] Setup Flask dan tes API dasar.
- [ ] CRUD, soft delete, ketersediaan, revisi data dan invalidasi atomik.
- [ ] Jembatan proses Prolog JSON dengan timeout 30 detik.
- [ ] Preview TTL 30 menit, save atomik, riwayat dan snapshot.
- [ ] Tes error, race condition, dan transaksi.

## Bersama — integrasi dan UAS
- [ ] Uji alur data → generate → preview → simpan → riwayat.
- [ ] Uji edit/nonaktif data → jadwal invalid → generate baru.
- [ ] Review hasil benchmark dan putuskan batas dataset.
- [ ] Susun tutorial 5 poin dosen, slide, demo, dan video.

## Definition of Done
Tugas hanya selesai jika: kriteria jelas, kode/review sesuai spesifikasi, tes relevan dijalankan, hasil didokumentasikan, dan PR disetujui. Tidak cukup hanya 'AI bilang selesai'.
