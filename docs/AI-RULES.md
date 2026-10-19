# AI-RULES.md
**Status:** kontrak AI versi 1 dan batas integrasi REST tetap berlaku; mesin SWI-Prolog dan benchmark TASK 07 telah tersedia. DEC-061–DEC-065 memperinci kontrak backend tanpa mengubah C01–C09 atau schema JSON solver.

## Tugas AI
SWI-Prolog adalah sumber kebenaran keputusan penjadwalan. Untuk setiap kegiatan `praktikum` aktif, pilih tepat satu pasangan `(slot_id, laboratorium_id)` dari data yang valid. `mata_praktikum` adalah katalog dan bukan unit yang dijadwalkan. Flask melakukan validasi format, referensi, status, dan transaksi; **Flask tidak membuat solver alternatif**.

## Representasi
Input JSON versi 1 berisi `schema_version`, `source_revision`, serta data aktif `kelompok`, `asisten`, `laboratorium`, `mata_praktikum`, `slot_waktu`, `praktikum`, `ketersediaan_kelompok`, dan `ketersediaan_asisten` dari satu dataset revision yang konsisten. Setiap elemen `praktikum` membawa identitas kegiatannya sendiri serta `mata_praktikum_id`, `kelompok_id`, dan `asisten_id`. Assignment menggunakan `praktikum_id`; tidak ada assignment untuk `mata_praktikum_id`. Backend harus menolak dataset sebagai tidak siap bila kegiatan aktif merujuk mata praktikum, kelompok, atau asisten nonaktif, bukan menghapus kegiatan tersebut diam-diam dari input solver. Laboratorium dan slot nonaktif tidak menjadi kandidat. Semua ID integer positif; hari 1–5; waktu `HH:MM`; durasi slot 120 menit. Baris ketersediaan adalah allowlist: tidak ada baris = tidak tersedia dan dapat menghasilkan unsatisfiable.

Nama/label presentasi tidak masuk input solver. Flask membaca solver projection dan snapshot source dalam transaksi SQLite yang sama. Entitas diurutkan berdasarkan ID dan availability secara kanonis; solver tidak boleh bergantung pada urutan baris SQLite tanpa `ORDER BY`.

## Proses dan keamanan

- Satu generate menjalankan satu subprocess baru melalui entrypoint `solver_cli:main/0`.
- Input hanya melalui satu JSON UTF-8 tanpa BOM di stdin; data pengguna tidak menjadi source, goal, atau klausa Prolog.
- stdout hanya satu objek JSON protokol; stderr hanya diagnostik.
- Solver tidak menggunakan temporary file sebagai transport atau proses persisten pada MVP.
- Input request direpresentasikan sebagai immutable terms; jangan memakai `assertz/1` untuk menyimpan fakta request.
- Timeout dikelola Flask selama 30 detik. Timeout/crash tidak pernah berarti unsatisfiable.

## Hard constraints
1. C01: Setiap praktikum mendapat tepat satu penempatan.
2. C02: Slot terdaftar dan aktif.
3. C03: Laboratorium terdaftar dan aktif.
4. C04: Kapasitas laboratorium >= jumlah peserta kelompok.
5. C05: Praktikum dengan kelompok sama tidak bertabrakan waktu.
6. C06: Praktikum dengan asisten sama tidak bertabrakan waktu.
7. C07: Satu laboratorium tidak digunakan dua praktikum yang bertabrakan waktu.
8. C08: Kelompok tersedia pada slot terpilih.
9. C09: Asisten tersedia pada slot terpilih.

Slot adalah interval `[jam_mulai, jam_selesai)`. Jika semua slot global tidak overlap, pengecekan bentrok dapat memakai ID slot; bila desain berubah mengizinkan slot overlap, cek interval sesungguhnya. Tidak ada optimasi soft constraint pada MVP.

## Strategi CSP

- Gunakan SWI-Prolog CLP(FD).
- Satu kegiatan memiliki variabel slot dan laboratorium.
- Pangkas domain slot berdasarkan irisan availability kelompok dan asisten.
- Pangkas domain laboratorium berdasarkan kapasitas kelompok.
- Pasang C01–C09 sebelum labeling.
- Jangan mengunci `all_distinct` sebagai satu-satunya encoding konflik tanpa membuktikan ekuivalensi terhadap interval. Dengan jaminan slot global tidak overlap DEC-023, equality slot dapat menjadi optimisasi yang diuji.
- Ambil satu solusi pertama saja dan urutkan assignment berdasarkan `praktikum_id`.
- Benchmark `ff`, `ffc`, `step`, `enum`, dan `bisect` pada kasus satisfiable dan unsatisfiable. Satu konfigurasi benchmark harus memakai strategi tetap.
- Target DEC-012 adalah target benchmark, bukan kapasitas terjamin.

## Hasil solver
- `success`: solusi lengkap; `assignments` satu per praktikum.
- `unsatisfiable`: pencarian selesai tanpa solusi.
- `invalid_input`: input standalone tidak memenuhi kontrak.
- `internal_error`: boundary solver menangkap kegagalan internal.
- Timeout 30 detik atau proses gagal adalah error teknis di lapisan Flask, **bukan** `unsatisfiable`.
- Penjelasan kegagalan spesifik hanya boleh diklaim jika benar-benar dihitung/dibuktikan. Jika tidak, tampilkan alasan umum yang jujur.
- Preview hanya dibuat untuk `success`. Tidak ada preview untuk `unsatisfiable`, timeout, atau error.
- Prolog berjalan di luar transaksi database. Setelah success, backend wajib membandingkan revision terkini dengan revision input; hasil tidak disimpan sebagai preview bila revision berubah.
- Tidak ada retry solver otomatis pada MVP.

Kontrak output memakai `schema_version: 1`, echo `source_revision`, dan status. Exit code 0 hanya untuk success/unsatisfiable, 2 untuk invalid_input, dan 3 untuk internal_error. Detail shape, stream limits, dan klasifikasi adapter mengacu pada `API-CONTRACT.md`.

## Konsistensi hasil dan snapshot

Snapshot preview harus berasal dari dataset yang sama dengan input solver dan assignment yang dikembalikan. Saat save, snapshot versi dan `detail_jadwal` dibuat dari hasil yang sama; backend tidak boleh mengganti label atau assignment menggunakan data master yang telah berubah. Struktur snapshot versioned mengacu pada `DATA-MODEL.md`.

Flask postflight memverifikasi assignment konkret terhadap C01–C09 menggunakan lookup, set, dan perbandingan interval. Verifier hanya mengembalikan valid/invalid; verifier tidak boleh melakukan pencarian, backtracking, optimisasi, atau menghasilkan jadwal alternatif.

React hanya berkomunikasi dengan Flask melalui REST v1. React tidak menerima parameter solver dan tidak mengirim assignment pada save. Flask boleh memformat nested assignment display dari snapshot, tetapi algoritma pencarian tetap hanya di SWI-Prolog. Revision check dan insert preview success dilakukan atomik setelah verifier; perubahan revision menghasilkan `STALE_GENERATION`, bukan `STALE_PREVIEW`.

## Minimum pengujian
Kasus satu solusi, beberapa solusi, bentrok kelompok, bentrok asisten, bentrok laboratorium, kapasitas tidak cukup, ketersediaan kosong, data tidak punya solusi, input tidak valid, timeout, output korup, exit mismatch, output limit, dan stale generation. Uji bahwa setiap assignment memenuhi C01–C09. Benchmark kecil/sedang/besar dengan waktu, lingkungan, hasil, strategi labeling, dan status; **jangan mengarang angka atau batas maksimal**. Fixture konseptual bersama tercantum di `API-CONTRACT.md`.

## Proteksi
Prototipe belajar lama tetap di folder terpisah; jangan pindahkan/hapus. Hasil 29 tes lulus adalah laporan terdahulu, bukan bukti tes UAS baru.
