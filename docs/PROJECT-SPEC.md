# PROJECT-SPEC.md

**Proyek:** Smart Lab Scheduling System  
**Versi dokumen:** 1.0-draft  
**Tanggal:** 18 Oktober 2026  
**Status:** Draf untuk review tiga anggota; bukan izin implementasi otomatis.

## 1. Tujuan
Membangun aplikasi web lokal untuk membantu pengelola menjadwalkan kegiatan praktikum laboratorium secara otomatis dengan Constraint Satisfaction Problem (CSP) dan backtracking menggunakan SWI-Prolog. Sistem harus menampilkan jadwal yang memenuhi aturan serta memberi informasi yang jelas bila tidak ditemukan jadwal.

## 2. Konteks UAS
Proyek ditujukan untuk tutorial UAS Inteligensi Artifisial bertema AI with PROLOG. Materi tutorial mencakup instalasi tools, pengenalan lingkungan kerja, deskripsi persoalan, deskripsi solusi, dan demonstrasi penerapan. Fokus akademik adalah fakta, aturan, representasi pengetahuan, dan penalaran Prolog.

Penggunaan React dan Python/Flask sebagai antarmuka dan integrasi telah dikonfirmasi aman untuk proyek pada TASK 10A.1. Tanggal pasti pertemuan ke-11 masih perlu dikonfirmasi. Demo terminal SWI-Prolog tetap disiapkan sebagai alternatif bila perlu.

## 3. Arsitektur yang direncanakan
- Frontend: React, Vite, Tailwind CSS, shadcn/ui.
- Backend: Python Flask REST API.
- Database: SQLite.
- Mesin AI: SWI-Prolog; Prolog adalah sumber keputusan validitas penjadwalan.
- Aplikasi lokal, tanpa login, hosting, atau dukungan multi-pengguna pada MVP.

Alur: React -> Flask -> SQLite (data) -> SWI-Prolog (solver) -> Flask -> React. Flask boleh memvalidasi bentuk/tipe data dan integritas referensi, tetapi tidak menduplikasi aturan penjadwalan milik Prolog.

## 4. Model persoalan
Setiap **kegiatan praktikum** mempunyai tepat satu mata praktikum, satu kelompok, dan satu asisten yang ditentukan sebelum generate. `mata_praktikum` adalah katalog jenis praktikum, sedangkan `praktikum` adalah kegiatan yang dijadwalkan. Satu mata praktikum dan satu kelompok masing-masing dapat digunakan oleh banyak kegiatan praktikum. Solver memilih tepat satu pasangan `(slot_waktu, laboratorium)` untuk setiap kegiatan, bukan untuk entitas katalog mata praktikum. Slot MVP berdurasi tepat 120 menit dan tidak saling tumpang tindih. Pemisahan entitas mengikuti DEC-013; durasi mengikuti DEC-006.

Entitas konseptual:
1. Kelompok: identitas, nama, jumlah peserta.
2. Asisten: identitas, nama.
3. Laboratorium: identitas, nama, kapasitas.
4. Slot waktu: identitas, hari, jam mulai, jam selesai.
5. Mata praktikum: katalog jenis praktikum dengan identitas, nama, dan status aktif.
6. Kegiatan praktikum: unit yang dijadwalkan, dengan identitas serta referensi tepat satu mata praktikum, kelompok, dan asisten.
7. Ketersediaan kelompok per slot.
8. Ketersediaan asisten per slot.
9. Versi jadwal dan detail penempatan jadwal.

**Status rancangan:** nama kolom, primary/foreign key, batas jumlah entitas, definisi ketersediaan default, dan skema relasional rinci mengacu pada `DATA-MODEL.md` dan masih harus direview sebelum implementasi CRUD. Pernyataan lama bahwa kebijakan hapus belum diputuskan telah **superseded oleh DEC-007**: data master menggunakan soft delete dan tidak dihapus permanen melalui UI MVP.

## 5. Constraint wajib di mesin Prolog
- **C01:** setiap kegiatan mendapat tepat satu penempatan.
- **C02:** slot yang dipilih terdaftar.
- **C03:** laboratorium yang dipilih terdaftar.
- **C04:** kapasitas laboratorium mencukupi jumlah peserta kelompok.
- **C05:** satu kelompok tidak boleh memiliki dua kegiatan pada slot yang sama.
- **C06:** satu asisten tidak boleh membimbing dua kegiatan pada slot yang sama.
- **C07:** satu laboratorium tidak boleh dipakai dua kegiatan pada slot yang sama.
- **C08:** kelompok tersedia pada slot terpilih.
- **C09:** asisten tersedia pada slot terpilih.

Tidak ada optimasi preferensi/soft constraint pada MVP. Bila tidak ada solusi, sistem harus mengembalikan status **tidak ada solusi**. Penjelasan penolakan lokal boleh ditampilkan jika benar-benar didukung solver, tetapi sistem **tidak boleh mengklaim penyebab global yang pasti** tanpa algoritme diagnosis yang mendukung.

## 6. Fitur MVP
- CRUD kelompok, asisten, laboratorium, mata praktikum, kegiatan praktikum, dan slot waktu.
- Pengaturan ketersediaan kelompok dan asisten.
- Generate satu jadwal valid melalui Prolog.
- Menampilkan hasil dalam tabel jadwal.
- Menampilkan pesan gagal/tidak ada solusi dan kesalahan input secara terpisah.
- Menyimpan jadwal hasil generate.
- Melihat daftar riwayat versi jadwal dan detailnya.
- Menandai jadwal lama tidak berlaku bila data sumber yang relevan berubah.

Di luar MVP: login, multi-user, hosting, sinkronisasi SIAKAD, pengaturan rules oleh admin, optimasi multi-objektif, dan generate otomatis setiap ada perubahan data.

## 7. DEC-001: Riwayat dan invalidasi jadwal (DISETUJUI)
Pengguna memilih **opsi B: simpan riwayat jadwal**.

**Aturan yang disepakati:**
1. Jadwal yang pernah disimpan tidak dihapus otomatis akibat perubahan data sumber.
2. Ketika data penjadwalan yang relevan berubah, jadwal aktif lama tidak lagi boleh diperlakukan sebagai jadwal valid/aktif.
3. Jadwal baru **tidak** di-generate otomatis; pengguna menjalankan generate secara eksplisit.
4. Riwayat harus tetap dapat dibaca setelah data sumber berubah.

**Ketentuan implementasi jadwal yang telah disepakati:**
- Status versi jadwal: `active`, `invalid`, `archived`.
- `active`: versi yang saat ini berlaku; paling banyak satu.
- `invalid`: versi yang kehilangan validitas karena data sumber berubah.
- `archived`: versi historis yang digantikan jadwal baru tanpa sebelumnya terinvalidasi.
- Simpan snapshot canonical, versioned, dan immutable untuk tiap versi agar riwayat tetap dapat dibaca tanpa membaca master aktif. `detail_jadwal` hanya indeks relasional assignment (DEC-019).
- Perubahan dataset efektif menaikkan `source_revision` tepat satu kali per transaksi. Jadwal active hanya diinvalidasi secara atomik bila perubahan memengaruhi validitas, cakupan, atau kelayakan assignment tersimpan; perubahan kandidat/label yang tidak merusak jadwal active tidak menginvalidasi (DEC-014 dan matriks `DATA-MODEL.md`).
- Hasil generate hanya menjadi `active` setelah pengguna menyimpannya; hasil yang belum disimpan bersifat sementara.
- Simpan versi baru secara atomik: jika ada `active` lama yang masih valid, ubah ke `archived`; versi baru menjadi `active`. Versi `invalid` tetap `invalid`.

**Keputusan terbaru:** perubahan nama/label aktif menaikkan `source_revision` tetapi tidak menginvalidasi jadwal active (DEC-014). Generate, Preview, dan Simpan adalah tahap terpisah (DEC-002). Kebijakan penghapusan manual riwayat masih OPEN; aktivasi ulang versi historis tidak didukung pada MVP (DEC-027).

## 8. Kontrak antarkomponen
Sebelum coding paralel, buat dan setujui:
- `DATA-MODEL.md`: skema SQLite, hubungan, dan snapshot jadwal.
- `AI-RULES.md`: input/output solver, constraint, contoh data dan kasus uji.
- `API-CONTRACT.md`: endpoint, struktur JSON, status sukses/tidak ada solusi/error, ID dan nama field.
- `AGENTS.md`: aturan AI coding, area kepemilikan, pengujian, pelaporan perubahan.
- `TASK-BOARD.md`: pembagian pekerjaan terukur.
- `DECISIONS.md`: log keputusan, termasuk DEC-001.

**Larangan:** AI coding tidak boleh mengarang nama field atau mengubah kontrak secara sepihak. Ketidakjelasan kontrak harus ditanyakan, bukan ditebak.

## 9. Tanggung jawab anggota (usulan)
- **Galang:** Prolog, constraint, solver, validasi, pengujian AI.
- **Iqbal:** React UI/UX, form CRUD, tampilan jadwal, integrasi frontend.
- **Zicco:** Flask, SQLite, API CRUD, integrasi Python–Prolog.
- **Bersama:** keputusan spesifikasi, integrasi end-to-end, demo, slide, video, dan review pull request.

## 10. Kriteria penerimaan awal
1. Kegiatan dengan beberapa praktikum per kelompok dapat dijadwalkan tanpa bentrok kelompok.
2. Tidak ada asisten/lab ganda pada slot sama.
3. Kapasitas dan ketersediaan selalu dipatuhi.
4. Dataset yang memiliki solusi menghasilkan jadwal valid yang dapat diverifikasi.
5. Dataset mustahil menghasilkan `no_solution`, bukan jadwal palsu atau crash.
6. CRUD tersimpan permanen di SQLite.
7. Perubahan data relevan menginvalidasi jadwal aktif dan mempertahankan riwayat.
8. Generate berikutnya dapat menghasilkan versi baru tanpa menghapus versi lama.
9. Frontend, backend, dan Prolog terintegrasi dalam demonstrasi lokal.
10. Hasil tes dilaporkan dengan jumlah lulus/gagal, bukan hanya klaim “berhasil”.

## 11. Perlindungan proyek belajar lama
Prototipe `Project-1-Smart-Scheduling` di lokasi lain **tidak dipindahkan atau diubah** tanpa izin eksplisit. Laporan terakhir menyatakan 29 tes lulus; itu adalah laporan sebelumnya, bukan pengujian baru terhadap aplikasi UAS.

## 12. Urutan kerja
1. Review dan kunci spesifikasi MVP ini.
2. Selesaikan keputusan terbuka di bagian 7.
3. Finalisasi model data, aturan AI, dan kontrak API.
4. Susun AGENTS.md dan task board.
5. Coding paralel di branch terpisah.
6. Integrasi kecil: Generate -> Flask -> Prolog -> React.
7. Tambahkan CRUD, riwayat, tes end-to-end, dan materi tutorial.

**Catatan:** dokumen ini merupakan spesifikasi draf. Tidak ada kode aplikasi atau skema database yang sudah dibuat oleh dokumen ini.

## Addendum keputusan desain DEC-007 sampai DEC-010 (18 Oktober 2026)

- DEC-007: Data master dinonaktifkan/diaktifkan kembali (`is_active`), tidak dihapus permanen melalui UI MVP.
- DEC-008: Aktivasi ulang data master tidak otomatis mengaktifkan jadwal versi `invalid`.
- DEC-009: Preview hasil solver disimpan sementara di SQLite, bukan hanya memori Flask.
- DEC-010: Preview berlaku 30 menit sejak dibuat berdasarkan waktu UTC backend.
- Penyimpanan preview harus single-use dan memeriksa revisi dataset; simpan jadwal baru dan transisi status versi dilakukan atomik.
- Kontrak detail mengacu pada `API-CONTRACT.md`; model penyimpanan mengacu pada `DATA-MODEL.md`. Jika ada rekomendasi lama yang bertentangan, keputusan DEC-007–DEC-010 di atas berlaku.
- Belum ada implementasi aplikasi UAS yang diverifikasi.


## Addendum DEC-011: Batas eksekusi solver (18 Oktober 2026)

- Batas waktu satu permintaan generate SWI-Prolog adalah **30 detik**. Backend harus menghentikan proses yang melewati batas dan membersihkan resource proses.
- Timeout dikembalikan sebagai error teknis `SOLVER_TIMEOUT`, **bukan** `unsatisfiable`. `unsatisfiable` hanya sah jika pencarian selesai menyeluruh tanpa solusi.
- Batas jumlah entitas belum final. Kandidat awal untuk benchmark: 20 kelompok, 20 asisten, 10 laboratorium, 40 praktikum, 25 slot. Angka tersebut **usulan pengujian**, bukan kapasitas terjamin atau limit yang sudah disetujui.
- Sebelum solver dijalankan, backend memeriksa kelengkapan dan konsistensi struktural data (`DATA_NOT_READY` bila belum siap), tanpa mengambil alih keputusan constraint penjadwalan Prolog.

## Addendum DEC-013: Model mata praktikum dan kegiatan (18 Oktober 2026)

- `mata_praktikum` dan `praktikum` adalah dua entitas terpisah.
- `mata_praktikum` adalah data master katalog dan mengikuti soft delete DEC-007.
- `praktikum` adalah kegiatan yang dijadwalkan dan mengacu tepat pada satu mata praktikum, satu kelompok, dan satu asisten.
- Mata praktikum nonaktif tidak dapat digunakan untuk membuat kegiatan baru. Kegiatan aktif yang masih merujuk mata praktikum nonaktif menyebabkan masalah kesiapan data sebelum solver dipanggil.
- Prolog menjadwalkan identitas kegiatan `praktikum`, bukan entitas katalog `mata_praktikum`.

## Addendum DEC-014 sampai DEC-027: Finalisasi data dan siklus jadwal (18 Oktober 2026)

- Revision dan invalidation dipisahkan: label aktif menaikkan revision tanpa invalidasi, sedangkan no-op tidak mengubah revision (DEC-014).
- Master yang masih dirujuk boleh dinonaktifkan tanpa menghapus relasi; referensi kegiatan aktif ke mata, kelompok, atau asisten nonaktif menyebabkan `DATA_NOT_READY` (DEC-015).
- Versi hanya dapat berpindah dari active ke invalid atau archived; status terminal tidak dapat diaktifkan kembali (DEC-016, DEC-027).
- Preview berpindah dari ready ke consumed, expired, atau stale; preview hanya dibuat setelah solver sukses (DEC-017).
- Semua timestamp backend menggunakan RFC 3339 UTC fixed-width dengan milidetik (DEC-018).
- Snapshot adalah sumber sejarah canonical dan detail adalah indeks immutable (DEC-019, DEC-020).
- Save preview menggunakan `BEGIN IMMEDIATE`, conditional consume, rollback atomik, dan partial unique index untuk satu active (DEC-021).
- `source_revision` dimulai dari 0 dan naik tepat sekali per transaksi mutasi efektif yang memengaruhi dataset aktif; perincian mutasi entity nonaktif mengikuti DEC-063.
- Slot aktif dilindungi dari overlap oleh constraint, trigger SQLite, dan validasi Flask (DEC-023).
- Prolog berjalan di luar transaksi; revision diperiksa kembali sebelum preview diterbitkan tanpa retry otomatis (DEC-024).
- Nama asisten tidak wajib unik (DEC-025).
- Preview terminal memiliki retensi 7 hari dan cleanup internal tidak mengubah revision atau jadwal (DEC-026).
- Detail lengkap skema, matriks mutasi, snapshot, dan transaksi mengacu pada `DATA-MODEL.md`.

## Addendum DEC-028 sampai DEC-042: Kontrak Flask–SWI-Prolog (18 Oktober 2026)

- Setiap generate memakai satu subprocess SWI-Prolog baru dengan satu JSON UTF-8 melalui stdin, satu JSON melalui stdout, dan diagnostik melalui stderr (DEC-028).
- Entrypoint adalah `solver_cli:main/0`; backend memakai executable terkonfigurasi, argumen list, absolute solver path, dan `shell=False` tanpa menyisipkan data pengguna ke goal (DEC-029, DEC-040).
- Exit/status, schema input-output versi 1, empat status solver, serta kegagalan adapter mengikuti DEC-030–DEC-032 dan DEC-042.
- Tanpa kegiatan aktif menghasilkan `DATA_NOT_READY`; availability kosong tetap domain valid yang dapat menghasilkan unsatisfiable (DEC-033, DEC-034).
- Flask melakukan verifier assignment konkret C01–C09 tanpa pencarian alternatif (DEC-035).
- Solver menggunakan CLP(FD), immutable request terms, domain pruning, dan benchmark sebelum memilih representasi/labeling final (DEC-036).
- Input dan output diurutkan kanonis dan hanya satu solusi pertama dikembalikan (DEC-037).
- stdout khusus JSON, stderr khusus diagnostik; batas stdout 1 MiB dan stderr 256 KiB ditegakkan selama pembacaan (DEC-038, DEC-039).
- Timeout tetap 30 detik; proses dihentikan dan resource dibersihkan tanpa membuat preview (DEC-041).
- Detail kontrak proses, JSON, failure matrix, dan fixture konseptual mengacu pada `API-CONTRACT.md`.

## Addendum DEC-043 sampai DEC-059: Kontrak REST v1 (18 Oktober 2026)

- REST memakai `/api/v1`, envelope success/error stabil, snake_case, status HTTP dan mapping error final (DEC-043–DEC-046).
- Enam resource memiliki 30 operasi list/detail/create/partial-update/status tanpa DELETE; availability memakai empat operasi GET/PUT full replacement (DEC-047–DEC-050).
- Generate hanya menerima `{}`, save hanya menerima `preview_id`, dan lima operasi scheduling memakai assignment display nested yang sama dari snapshot (DEC-051–DEC-053, DEC-057).
- Revision check dan insert preview success atomik setelah solver/verifier; transaksi tidak ditahan selama solver (DEC-054).
- Invalidasi active ditentukan dari dampak aktual terhadap coverage dan assignment, sedangkan setiap kenaikan revision membuat preview lama stale pada pemeriksaan berikutnya (DEC-055).
- Save menerapkan prioritas error preview deterministik dan mempersistensikan transisi expired/stale meskipun save ditolak (DEC-056).
- Request JSON dibatasi 256 KiB, divalidasi strict dan aman; CORS lokal bukan authentication (DEC-058).
- Health memeriksa backend, database, dan executable SWI-Prolog tanpa menjalankan CSP atau membocorkan konfigurasi (DEC-059).
- Inventaris tepat 40 operasi, contoh JSON, status/error, dan transaksi final berada di `API-CONTRACT.md`. Frontend hanya berkomunikasi dengan Flask; Flask tidak menjalankan pencarian CSP.

## Addendum DEC-060 sampai DEC-065: Timestamp dan kontrak backend (19 Oktober 2026)

- Enam entity master/kegiatan memakai timestamp canonical DEC-060. DEC-063 memperjelas bahwa mutasi efektif entity nonaktif tetap memperbarui `updated_at`, sedangkan revision hanya naik bila dataset aktif terdampak; no-op tidak mengubah keduanya.
- Nested summary praktikum mempunyai shape tetap untuk mata praktikum, kelompok, dan asisten, tanpa mengganti tiga foreign key writable (DEC-061).
- List resource memakai `sort_by=id`, `sort_order=asc`, tie-break `id`, serta contains search case-insensitive dengan `%` dan `_` literal dan batas 100 karakter setelah trim (DEC-062).
- Inisialisasi/migrasi SQLite dijalankan eksplisit melalui CLI; Flask tidak melakukan auto-migration saat startup atau request (DEC-064).
- Backend memakai baseline Flask 3.1.3 dan Flask-CORS 6.0.5 dengan minor-line constraint dan test gate Python 3.14 sebelum dependency direkam untuk rilis (DEC-065).
