# Demo UAS — CSP nyata dan siklus jadwal

Panduan F11-F, 23 Oktober 2026. Tidak ada seed system baru: demo memakai fixture dan helper Playwright yang sudah diuji. Data dibuat melalui UI/REST nyata, solver SWI-Prolog nyata, dan database SQLite baru per tes. Nomor ID/UUID dicatat dari respons; jangan mengasumsikan ID tetap di database lain.

## Persiapan dan keselamatan

1. Ikuti [README](../README.md), pastikan SWI tersedia dan dependencies terpasang. Dari `frontend/`, jalankan `npx playwright install chromium` hanya jika browser belum tersedia.
2. Kosongkan port 5173/5007 dengan meminta pemilik server menghentikannya. Jangan kill berdasarkan nama/port. Verifikasi:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173,5007 -ErrorAction SilentlyContinue
```

3. Opsional: `$env:SMART_LAB_E2E_PYTHON = (Resolve-Path '../.venv/Scripts/python.exe').Path` bila menjalankan dari `frontend/` dengan virtualenv root. Jangan menunjuk executable yang tidak dikenal.
4. `e2e/system.ts:withIsolatedSystem()` menolak port sibuk sebelum setup, membuat `smart-lab-e2e-*` baru, menyuntik path absolut SQLite pada proses, dan memverifikasi launcher Flask. Tidak memakai/menimpa database utama. Browser memakai API 5007, bukan default dev 5000.
5. Untuk presentasi lambat gunakan `--debug`, lalu Step/Resume melalui Playwright Inspector. Ini opsi presentasi interaktif, bukan pengukuran waktu. Tes otomatis biasa/headless adalah bukti regresi; presentasi headed perlu rehearsal operator.

## Definisi C01–C09 yang benar

| Aturan | Penjelasan aktual | Lokasi implementasi |
| --- | --- | --- |
| C01 | Satu kegiatan memperoleh tepat satu pasangan slot-lab | `prolog/solver.pl`: `make_task`, `materialize_model`, `task_assignment` |
| C02 | Slot assignment berasal dari input slot yang tervalidasi | `validation.pl` FK/slot validation; domain `available_slots` |
| C03 | Lab assignment berasal dari input lab yang tervalidasi | `solver.pl`: `capable_labs` |
| C04 | Kapasitas lab ≥ jumlah peserta | `capable_labs` |
| C05 | Kegiatan kelompok yang sama tidak berbagi waktu | `constrain_pair`: variabel slot berbeda |
| C06 | Kegiatan asisten yang sama tidak berbagi waktu | `constrain_pair`: variabel slot berbeda |
| C07 | Lab tidak dipakai dua kegiatan bersamaan | Reifikasi slot sama mengharuskan lab berbeda |
| C08 | Kelompok tersedia pada slot yang dipilih | Irisan availability kelompok/asisten |
| C09 | Asisten tersedia pada slot yang dipilih | Irisan availability kelompok/asisten |

Slot global aktif tidak overlap, berdurasi 120 menit, Senin–Jumat. Interval half-open `[mulai,selesai)`; slot bersebelahan boleh. Jaminan validasi ini memungkinkan equality ID slot pada encoding konflik. Python verifier memeriksa assignment dengan interval sesungguhnya, tanpa mencari solusi.

Produksi memakai labeling `[leftmost,enum,up]` dan solusi pertama, dengan canonical ordering. UI menampilkan wall time nyata, domain **awal** dan verification overall; bukan trace pencarian, jumlah solusi, minimal UNSAT core, atau hasil PASS per constraint.

## 1. SAT — dataset C02

Dari `frontend/`:

```powershell
npm run test:e2e -- scheduling.spec.ts --grep 'C02:'
# Untuk penjelasan langkah demi langkah:
npm run test:e2e -- scheduling.spec.ts --grep 'C02:' --debug
```

Dataset persis `helpers/dataset.ts:createDataset(page,'C02')`:

| Entitas | Nilai |
| --- | --- |
| Mata | `C02 Mata 1` |
| Kelompok | `C02 Kelompok 1`, 20 peserta |
| Asisten | `C02 Asisten 1` |
| Lab | `C02 Lab 1`, kapasitas 30 |
| Kegiatan | Satu kegiatan mengacu tiga ID di atas |
| Slot | Senin (1), 08:00–10:00 |
| Availability | Kelompok dan asisten masing-masing allowlist `[ID slot]` |

Langkah UI: Data Master → enam tab untuk create data; Availability → pilih kelompok/asisten → centang slot → Simpan perubahan. Constraint Studio → Generate Schedule → baca SAT, domain 1 slot × 1 lab, verification `passed`, preview ID/TTL. **Jangan** mengklaim active sebelum save. Simpan Jadwal → Timetable → Grid/Tabel → Schedule History → Detail → Overview.

Harapan: satu assignment pada slot/lab tunggal; preview ready lalu consumed; versi active; satu riwayat. Tes membaca SQLite sementara dan memastikan `hasil_json` v1 tanpa diagnostik, snapshot terpisah, serta active/history konsisten.

## 2. UNSAT — dataset D01, bukan input invalid

```powershell
npm run test:e2e -- negative-lifecycle.spec.ts --grep 'D01 REAL'
```

Dataset dasar berprefix `D01` seperti C02 (20 peserta, lab 30, satu slot Senin 08–10), kemudian:

- Tambah asisten `D01 second assistant` dan lab `D01 second lab` kapasitas 30.
- Tambah kegiatan kedua memakai **mata dan kelompok yang sama**, tetapi asisten kedua.
- Kelompok dan kedua asisten tersedia pada slot tunggal itu.

Langkah UI: generate setelah seluruh availability tersimpan; buka Aturan sistem C01–C09 dan diagnostik.

Harapan: UNSAT, dua item domain awal masing-masing 1 slot × 2 lab = 2 pasangan teoritis, `verification.overall=not_applicable`, assignment kosong, tidak ada preview/save/versi. Secara konstruksi, C05 mustahil dipenuhi: dua kegiatan kelompok yang sama hanya punya satu slot. Dua asisten dan dua lab memastikan konflik ini tidak disebabkan kekurangan lab/asisten. Ini penjelasan dataset demonstrasi, bukan diagnosis global yang dihitung UI atau minimal UNSAT core.

## 3–4. Versioning dan invalidation — dataset C04

```powershell
npm run test:e2e -- scheduling.spec.ts --grep 'C04:'
```

Mulai dataset satu kegiatan berprefix `C04` dengan 20 peserta dan lab 30, availability valid, simpan versi V1.

1. Data Master → Kelompok → Detail → Ubah data → jumlah peserta **31**. Assignment V1 tidak lagi memenuhi kapasitas C04. Timetable menjadi kosong; History V1 berlabel **Tidak Valid**; snapshot masih menyimpan 20 peserta.
2. Kembalikan jumlah peserta ke **20**. V1 **tetap invalid**, bukan aktif lagi.
3. Generate dan simpan V2: versi baru active; V1 tetap dapat dibaca.
4. Generate dan simpan V3 tanpa merusak V2: V2 **Diarsipkan**, V3 **Aktif**, V1 **Tidak Valid**.
5. History → buka ketiga detail. Assignment/snapshot versi lama tetap immutable.

Tes C04 membuktikan kedua skenario ini; nama C04 kasus E2E tidak berarti tes ini sendirian mencakup seluruh hard constraint.

## 5. Failure recovery — stale preview D02

```powershell
npm run test:e2e -- negative-lifecycle.spec.ts --grep 'D02 REAL'
```

Dataset prefix `D02`, satu kegiatan valid seperti C02. Simpan satu jadwal, lalu generate preview baru. Pada tab kedua, ubah nama mata menjadi `D02 Renamed` melalui Data Master. Revision naik satu, active lama tidak invalid hanya karena label.

Kembali tab preview lama → Simpan: 409 `STALE_PREVIEW`, preview tidak boleh digunakan lagi, tidak ada versi tambahan. Recovery: Generate ulang secara eksplisit → Simpan; riwayat menjadi dua versi. Tidak ada auto-retry dan tidak ada rollback history.

Alternatif uncertain save yang terkontrol:

```powershell
npm run test:e2e -- network-failures.spec.ts --grep 'D06 UNCERTAIN'
```

Tes membuktikan commit nyata terlebih dahulu, baru menghilangkan/merusak respons browser. UI harus berkata hasil simpan belum pasti; tidak otomatis retry, lalu pengguna memeriksa active/history. **Jangan** meniru fault ini pada database utama atau mematikan backend pengguna untuk demo.

## Reset, urutan narasi dan fallback

- Reset aman: biarkan tes selesai melalui Resume. Fixture menutup proses miliknya, menghapus hanya SQLite/WAL/SHM dalam direktori unik yang tervalidasi, dan memeriksa hash database utama serta port. Jalankan ulang command untuk dataset baru; tidak ada DELETE/reset endpoint.
- Jangan membatalkan paksa terminal ketika sedang menyimpan. Jika crash/teardown gagal, simpan log path/PID lalu minta pemeriksaan terarah; jangan hapus folder Temp atau kill semua Python/Node.
- Urutan narasi yang disarankan (alokasi, bukan waktu runtime terukur): persoalan/arsitektur 2 menit; SAT dan verifier 4 menit; UNSAT/domain lokal vs konflik global 3 menit; versioning/invalidation 3 menit; stale/recovery dan batasan 2 menit.
- Jika UI gagal karena environment, tampilkan bukti tes yang benar-benar direkam atau jalankan fallback CLI berikut. Jangan menyebut rekaman/hasil lama sebagai run live baru.

Dari root, fallback solver tanpa database:

```powershell
Get-Content -Raw -Encoding UTF8 prolog/tests/fixtures/valid.json | swipl -q -f none -s prolog/solver_cli.pl -g solver_cli:main -t halt
Get-Content -Raw -Encoding UTF8 prolog/tests/fixtures/contract-unsat-group.json | swipl -q -f none -s prolog/solver_cli.pl -g solver_cli:main -t halt
```

Fixture CLI SAT berbeda dari dataset UI C02: dua kegiatan, satu asisten/lab, dua slot bersebelahan; asisten memaksa slot berbeda. Output CLI schema v2, bukan envelope REST; exit 0 untuk SAT/UNSAT, 2 invalid_input, 3 internal_error. CLI tidak melakukan save/history. Timeout tidak boleh disebut UNSAT.

F11-F menjalankan kelima skenario lewat suite penuh, ditambah cold-install SAT/smoke. Rehearsal presentasi Inspector/headed dan slide/video final masih tugas operator/tim.
