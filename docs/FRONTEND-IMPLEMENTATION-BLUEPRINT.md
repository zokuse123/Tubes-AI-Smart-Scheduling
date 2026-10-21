# Frontend Implementation Blueprint

**Proyek:** Smart Lab Scheduling System

**Tujuan dokumen:** pedoman implementasi frontend React yang mengikuti kontrak REST v1 dan kemampuan repository saat audit.

**Status:** blueprint; bukan bukti persetujuan desain visual atau bahwa frontend telah dibuat.

## A. Executive Summary

Frontend akan menjadi klien lokal untuk administrasi data master, ketersediaan, generate/preview/simpan jadwal, jadwal aktif, dan riwayat. Sumber kebenaran jadwal adalah SWI-Prolog melalui backend Flask; React tidak memanggil Prolog dan tidak menyusun atau mengedit assignment solver.

Stack yang direncanakan dalam konteks TASK F01 adalah React, Vite, TypeScript, Tailwind CSS, shadcn/ui, dan npm. Backend aktual menggunakan Flask, SQLite, dan SWI-Prolog; base API `http://127.0.0.1:5000/api/v1`. MVP bersifat lokal tanpa autentikasi. Preview berlaku 30 menit, tidak mempunyai endpoint GET, dan hanya menjadi jadwal aktif setelah save berhasil.

Prinsip implementasi:

- API contract dan kode backend mengalahkan mockup visual jika keduanya berbeda.
- Pisahkan transport/API state dari state komponen; jangan menduplikasi aturan bisnis backend.
- Tampilkan error envelope/code dengan pesan UI yang aman dan actionable.
- Jadwal aktif dan history read-only. Jangan menawarkan restore/edit assignment.
- Jangan menyimpan preview ke persistent browser storage atau menganggap preview valid setelah reload.

## B. Repository Readiness

### Fakta yang diaudit

- Branch: `integration/prolog-backend`; HEAD saat audit: `2525472`; working tree bersih.
- Belum ada `frontend/`, `package.json`, lockfile JS, konfigurasi Vite/Tailwind/shadcn, atau source TS/JS di repository.
- Tidak ditemukan file HTML Stitch lokal. Audit visual rinci atas markup Stitch tidak dilakukan; acuan yang tersedia hanya deskripsi TASK F01.
- Backend mengimplementasikan 40 method/path REST v1. Pemeriksaan application route map menemukan 40 operasi, termasuk lima operasi scheduling dan `GET /api/v1/health`.
- README memuat langkah setup database eksplisit, server Flask, health check, CORS, serta tes. Backend tidak melakukan migrasi otomatis pada startup.
- API dan observabilitas solver terdokumentasi pada `docs/API-CONTRACT.md`; DEC-067 berstatus implemented pada source/dokumentasi.

### Ketidaksesuaian dan batas informasi

- `docs/TASK-BOARD.md` masih memiliki beberapa pekerjaan backend/Prolog bertanda belum selesai, meskipun kode dan tes aktual sudah tersedia. Contohnya setup Flask, CRUD, jembatan Prolog, preview/save/history di bagian backend dan solver di bagian Prolog. Checklist Frontend yang belum selesai sesuai dengan belum adanya folder frontend. Jangan memakai checklist lama itu sebagai bukti tunggal status kode; pemilik proyek perlu menyinkronkannya terpisah.
- Contoh response UNSAT pada bagian contoh API lebih ringkas dan tidak menampilkan field tambahan observabilitas; bagian DEC-067 yang lebih baru mendefinisikan `source_revision` dan `solver_diagnostics` aditif. Implementasi generate aktual mengikuti DEC-067, sehingga UI harus memakai bentuk terbaru tersebut.
- Versi React, Vite, TypeScript, Tailwind, shadcn/ui, npm, lint/test tooling, dan kebijakan lockfile belum diputuskan atau direkam dalam repository. Stack tersebut adalah rencana/konteks TASK F01, bukan dependency yang sudah terpasang.
- Desain Stitch memberikan arah visual dan enam nama halaman, tetapi tidak menyediakan ukuran token, hex warna, layout breakpoint, atau markup lokal untuk diverifikasi.
- Belum ada keputusan eksplisit untuk format tanggal/jam pada UI, pola konfirmasi destructive action, pilihan visualisasi kalender, atau isi agregat Overview. Rekomendasi blueprint diberi label dan tidak dianggap keputusan final.

## C. Frontend Architecture

### Rekomendasi struktur

Struktur feature-oriented yang ringan; jangan membuat semua kemungkinan abstraksi sebelum fitur memerlukannya.

```text
frontend/
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── components.json
└── src/
    ├── app/                 # bootstrap, providers, router
    ├── components/          # komponen bersama: DataTable, PageHeader, states
    ├── features/
    │   ├── overview/
    │   ├── master-data/
    │   ├── availability/
    │   ├── constraint-studio/
    │   ├── timetable/
    │   └── schedule-history/
    ├── pages/               # route-level composition
    ├── api/                 # fetch client, error parsing, endpoint functions
    ├── hooks/               # shared hooks bila reuse telah nyata
    ├── lib/                 # formatter, constants, utilities
    ├── types/               # DTO/API contracts
    └── styles/              # Tailwind entry, tokens, global styles
└── tests/                   # setup bersama; feature tests dekat fitur bila cocok
```

**Alasan:** fitur membatasi coupling halaman dan API-nya; `api/` dan `types/` memusatkan kontrak; `components/` menyimpan hanya elemen yang benar-benar dipakai lintas fitur. Untuk F02, satu package workspace `frontend/` cukup. Tidak diperlukan monorepo tool atau shared-code package untuk MVP.

## D. Routing dan Navigation

Enam path di bawah adalah rekomendasi route React, bukan endpoint backend.

| Halaman | Route frontend | Page component | Layout/navigation |
|---|---|---|---|
| Overview | `/` | `OverviewPage` | App shell dengan sidebar dan header |
| Data Master | `/data-master` | `MasterDataPage` | App shell; resource dipilih melalui tabs/selector internal |
| Availability | `/availability` | `AvailabilityPage` | App shell; pilih kelompok atau asisten |
| Constraint Studio | `/constraint-studio` | `ConstraintStudioPage` | App shell; generate dan preview |
| Timetable | `/timetable` | `TimetablePage` | App shell; tampilan jadwal aktif |
| Schedule History | `/schedule-history` | `ScheduleHistoryPage` | App shell; list dan detail history |
| Tidak ditemukan | `*` | `NotFoundPage` | App shell atau halaman fallback sederhana |

Gunakan React Router atau alternatif yang disetujui pada F02. Sidebar menampilkan enam entry sesuai urutan informasi desain; route aktif harus jelas dan sidebar dapat menjadi drawer pada viewport sempit. Tidak menambahkan login, role, atau route admin.

## E. Design System

### Arah visual yang diketahui

Dari deskripsi Stitch: sidebar charcoal, kanvas terang, aksen amber, tipografi Geist dan JetBrains Mono, dashboard akademik modern, desktop-first tetapi responsif. Detail HTML/token Stitch tidak tersedia di repository.

### Rekomendasi implementasi

- Buat semantic CSS variables, misalnya `--background`, `--foreground`, `--surface`, `--muted`, `--primary`, `--success`, `--warning`, `--destructive`, `--border`, dan `--focus`. Charcoal/amber menjadi pilihan palet; nilai hex final menunggu referensi desain/review, jangan mengklaim angka dari Stitch.
- Geist untuk body/UI dan JetBrains Mono untuk ID, source revision, waktu, dan data teknis; verifikasi lisensi dan strategi font lokal/CDN sebelum memilih pengiriman font.
- Gunakan skala spacing konsisten berbasis utility Tailwind, radius kecil-menengah, border halus, dan shadow hemat. Hindari angka token acak per komponen.
- App shell: sidebar charcoal dengan label/icon dan state aktif yang kontras; header terang dengan judul halaman, breadcrumb bila berguna, serta health/degraded indicator nonintrusif. Pada mobile, sidebar berubah menjadi drawer.
- Bangun primitives yang dibutuhkan: card, table, input/select, field errors, dialog konfirmasi, badge status, toast/inline alert, skeleton/spinner, empty state, dan pagination. shadcn/ui adalah sumber komponen untuk dimiliki/diadaptasi; jangan menyalin satu halaman desain sebagai sistem komponen.
- Semantic colors harus punya teks/icon/status, bukan warna saja. Jaga focus ring, keyboard navigation, label form, dialog focus management, heading hierarchy, hit target, dan kontras WCAG yang memadai.
- Table perlu alternatif responsif (horizontal scroll atau cards). Jadwal perlu table view sebagai fallback untuk weekly grid.

## F. API Integration Matrix

Prefix API aktual adalah `/api/v1`. Sukses memakai `{"data": ...}`; list memakai `data` dan `meta`. Error memakai `{"error":{"code":"...","message":"...","details":...}}`. Seluruh payload POST/PATCH/PUT harus JSON; validasi strict dan backend menolak unknown/read-only fields.

| Halaman/fitur | Operasi HTTP dan endpoint aktual | Payload/parameter | Field response yang dipakai | Error, loading, empty |
|---|---|---|---|---|
| Overview | `GET /health`; `GET /jadwal/aktif`; list enam master (`GET /mata-praktikum`, `/kelompok`, `/asisten`, `/laboratorium`, `/slot-waktu`, `/praktikum`) | list: `page`, `page_size`, `sort_by`, `sort_order`, `is_active`, `search` sesuai resource | health `status`, `components`, `checked_at`; jadwal `status`, `summary`; list `data`, `meta.total_items` | health dapat degraded/503; jadwal aktif dapat `data:null`; list bisa kosong. Tidak ada aggregate endpoint: jangan menyebut jumlah current page sebagai total; gunakan metadata dari tiap response atau jangan tampilkan agregat.
| Data Master | Untuk masing-masing 6 resource: `GET /{resource}`, `GET /{resource}/{id}`, `POST /{resource}`, `PATCH /{resource}/{id}`, `PATCH /{resource}/{id}/status` | create/PATCH mengikuti kolom writable pada tabel di bawah; status `{"is_active": boolean}` | entity, `is_active`, timestamps; list `meta` | loading per tabel/form; empty list; duplicate, inactive reference, validation, not found, database errors. Tidak ada DELETE.
| Availability | `GET /kelompok`, `GET /asisten`, `GET /slot-waktu`; `GET` dan `PUT /kelompok/{id}/ketersediaan`; `GET` dan `PUT /asisten/{id}/ketersediaan` | PUT full replacement: `{"slot_ids":[integer,...]}`; `[]` valid | `data.owner_type`, `owner_id`, `slot_ids`; referensi slot untuk label | no availability dapat empty array; validasi ID/slot, inactive reference, not found, database errors. Konfirmasi sebelum replace bila ada pilihan pengguna yang belum tersimpan.
| Constraint Studio | `GET /health` opsional; `POST /jadwal/generate`; `POST /jadwal/simpan` | Generate `{}`; Save `{"preview_id":"canonical UUID"}` | generate: `status`, `preview_id`, `preview_status`, `source_revision`, `created_at`, `expires_at`, `summary`, `assignments`, `solver_diagnostics`; save mengembalikan schedule tersimpan | UNSAT adalah HTTP 200 normal state tanpa preview; errors menggunakan error envelope. Ready/loading/UNSAT/error states distinct. Preview expiry/stale/consumed memberi 409; expired preview tidak dapat di-fetch ulang.
| Timetable | `GET /jadwal/aktif` | tanpa body | `data` null atau schedule: `id`, `status`, `source_revision`, timestamps, `summary`, `assignments` | loading; empty `null`; jadwal invalid/archive tetap ditampilkan sesuai status jika menjadi active response; server error. Read-only.
| Schedule History | `GET /jadwal/riwayat`; `GET /jadwal/riwayat/{id}` | list `page`, `page_size`, `sort_by=created_at|id`, `sort_order`, `status=active|invalid|archived|all`; default page 1/20, created_at desc, all | list `data`, `meta`; detail schedule plus `snapshot` metadata dan assignments | list empty; pagination/loading; `INVALID_QUERY`, not found, database error. Tidak ada restore/edit.

### Resource writable fields (aktual)

| Resource/path | Create wajib | PATCH detail |
|---|---|---|
| `mata-praktikum` | `{nama}` | subset `nama` |
| `kelompok` | `{nama, jumlah_peserta}` | subset keduanya |
| `asisten` | `{nama}` | subset `nama` |
| `laboratorium` | `{nama, kapasitas}` | subset keduanya |
| `slot-waktu` | `{hari, jam_mulai, jam_selesai}` | subset ketiganya |
| `praktikum` | `{mata_praktikum_id, kelompok_id, asisten_id}` | subset ketiganya |

Semua resource juga mempunyai PATCH `/{id}/status`; isinya tepat boolean `is_active`. `praktikum` read serializer menambah nested `mata_praktikum:{id,nama}`, `kelompok:{id,nama,jumlah_peserta}`, dan `asisten:{id,nama}`. Nested objects, ID, status, dan timestamp read-only. GET master default `page=1`, `page_size=20` maksimum 100, `sort_by=id`, `sort_order=asc`, `is_active=true`; search case-insensitive contains hanya di kolom yang diizinkan dan literal `%`/`_`.

### Pemetaan 40 operasi

Rute master: 6 resource × (GET collection, GET detail, POST collection, PATCH detail, PATCH status) = 30. Availability: GET+PUT untuk kelompok dan asisten = 4. Scheduling: POST generate, POST simpan, GET aktif, GET riwayat, GET detail riwayat = 5. Health: GET = 1. Total = 40; tidak ada DELETE, GET preview, atau route lain yang perlu dibuat frontend.

## G. TypeScript Data Contracts

Tipe berikut adalah rekomendasi DTO frontend yang mengikuti serializer aktual. Jangan mengubah casing field API (`snake_case`). `number` untuk integer JSON wajib disaring saat runtime jika data berasal dari luar API; TypeScript interface sendiri tidak memvalidasi payload.

```ts
type ApiSuccess<T> = { data: T };
type ApiList<T> = {
  data: T[];
  meta: { page: number; page_size: number; total_items: number; total_pages: number };
};
type ApiErrorBody = {
  error: { code: string; message: string; details: unknown | null };
};
type Timestamp = string; // API UTC RFC 3339 dengan milidetik dan suffix Z

type MasterBase = { id: number; is_active: boolean; created_at: Timestamp; updated_at: Timestamp };
type MataPraktikum = MasterBase & { nama: string };
type Kelompok = MasterBase & { nama: string; jumlah_peserta: number };
type Asisten = MasterBase & { nama: string };
type Laboratorium = MasterBase & { nama: string; kapasitas: number };
type SlotWaktu = MasterBase & { hari: 1 | 2 | 3 | 4 | 5; jam_mulai: string; jam_selesai: string };
type Praktikum = MasterBase & {
  mata_praktikum_id: number; kelompok_id: number; asisten_id: number;
  mata_praktikum: Pick<MataPraktikum, "id" | "nama">;
  kelompok: Pick<Kelompok, "id" | "nama" | "jumlah_peserta">;
  asisten: Pick<Asisten, "id" | "nama">;
};

type Availability = { owner_type: "kelompok" | "asisten"; owner_id: number; slot_ids: number[] };
type SolverCandidate = {
  praktikum_id: number; slot_count: number; laboratory_count: number; theoretical_pairs: number;
};
type SolverDiagnostics = {
  wall_time_ms: number;
  domain_candidates: SolverCandidate[];
  verification: { overall: "passed" | "not_applicable" };
};
type Assignment = {
  praktikum_id: number;
  mata_praktikum: Pick<MataPraktikum, "id" | "nama">;
  kelompok: Pick<Kelompok, "id" | "nama" | "jumlah_peserta">;
  asisten: Pick<Asisten, "id" | "nama">;
  slot_waktu: Pick<SlotWaktu, "id" | "hari" | "jam_mulai" | "jam_selesai">;
  laboratorium: Pick<Laboratorium, "id" | "nama" | "kapasitas">;
};
type GenerateSuccess = {
  status: "success"; preview_id: string; preview_status: "ready";
  source_revision: number; created_at: Timestamp; expires_at: Timestamp;
  summary: { total_praktikum: number; total_assignment: number };
  assignments: Assignment[]; solver_diagnostics: SolverDiagnostics;
};
type GenerateUnsatisfiable = {
  status: "unsatisfiable"; source_revision: number; message: string; assignments: [];
  solver_diagnostics: SolverDiagnostics & { verification: { overall: "not_applicable" } };
};
type GenerateResult = GenerateSuccess | GenerateUnsatisfiable;
type ScheduleStatus = "active" | "invalid" | "archived";
type ScheduleMetadata = {
  id: number; status: ScheduleStatus; source_revision: number; created_at: Timestamp;
  invalidated_at: Timestamp | null; archived_at: Timestamp | null;
  summary: { total_praktikum: number; total_assignment: number };
};
type Schedule = ScheduleMetadata & { assignments: Assignment[] };
type ScheduleHistoryItem = ScheduleMetadata;
type HistorySnapshot = { schema_version: 1; source_revision: number; generated_at: Timestamp; saved_at: Timestamp };
type ScheduleHistoryDetail = Schedule & { snapshot: HistorySnapshot };
type Health = {
  status: "healthy" | "degraded";
  components: { backend: "available"; database: "available" | "unavailable"; solver: "available" | "unavailable" };
  checked_at: Timestamp;
};
```

Preview yang dibuat generate berisi expiry/status sebagaimana `GenerateSuccess`; tidak ada DTO read-preview karena tidak tersedia GET preview. Save response berbentuk schedule aktif; diagnostik tidak ikut save. History list menggunakan schedule metadata ringkas dan pagination; detail history menyertakan assignments dan snapshot, bukan `hasil_json`.

## H. Constraint Studio Workflow

1. Halaman boleh memuat health dan metadata data pendukung, tetapi tidak ada endpoint “dataset siap” khusus. Keputusan kesiapan generate berada di backend.
2. Pengguna menekan Generate; kirim `POST /api/v1/jadwal/generate` dengan `{}`.
3. Selama request, disable aksi generate/save terkait dan tampilkan loading state. Jangan memulai generate ganda tanpa kebutuhan.
4. HTTP 200 + `data.status === "success"`: simpan preview hanya dalam memory/query state, tampilkan assignments dan `expires_at`, `source_revision`, diagnostics.
5. HTTP 200 + `data.status === "unsatisfiable"`: tampilkan status hasil pencarian normal, bukan error server; assignments kosong; tidak ada tombol save aktif.
6. Error envelope: tampilkan mapping pesan aman berdasarkan `error.code`; jangan tampilkan raw stack/SQL/stderr. `DATA_NOT_READY` adalah kondisi input/data, timeout/protocol/unavailable adalah error teknis berbeda.
7. Preview read-only. Frontend tidak membangun, mengurutkan ulang, atau mengubah pasangan slot/lab sebagai hasil solver. Tampilan visual boleh mengurutkan untuk presentasi tanpa mengubah payload sumber.
8. Sebelum save, cek expiry lokal hanya sebagai UX hint; backend tetap otoritatif. Kirim hanya `{"preview_id": preview.preview_id}`.
9. Pada `PREVIEW_EXPIRED`, `STALE_PREVIEW`, atau `PREVIEW_CONSUMED`, buang preview lokal dan minta generate baru. Jangan mengulang save otomatis.
10. Pada sukses save, bersihkan preview lokal, lalu navigate ke `/timetable` atau refresh jadwal aktif.

Preview TTL 30 menit dan backend tidak menyediakan `GET preview`. Hindari localStorage/sessionStorage, restore lintas tab, atau UI yang menyatakan preview valid setelah reload. Jika tab ditinggalkan, hasil sementara boleh hilang.

## I. Solver Observability

Implementasi aktual di `backend/app/scheduling.py`, `backend/app/solver_adapter.py`, `backend/app/solver_verifier.py`, `prolog/solver.pl`, dan `prolog/solver_cli.pl` menyediakan pada generate:

- `solver_diagnostics.wall_time_ms`: integer nonnegatif, monotonic wall-clock round-trip adapter/subprocess/verifier menurut DEC-067; bukan ukuran CPU.
- `solver_diagnostics.domain_candidates`: array berurutan berdasarkan `praktikum_id`, tiap item tepat `praktikum_id`, `slot_count`, `laboratory_count`, `theoretical_pairs`. Nilai adalah ukuran kandidat awal yang digunakan sebelum konflik antar-kegiatan; `theoretical_pairs` hasil kali dua count.
- `solver_diagnostics.verification.overall`: `passed` hanya sesudah success diverifikasi; `not_applicable` untuk UNSAT.
- `source_revision` untuk success dan UNSAT.

Domain kandidat bukan jumlah solusi, search trace, propagation/pruning/backtracking count, maupun jaminan satu kandidat benar-benar dipilih. Tidak tersedia CPU usage, proof hash, per-constraint PASS/FAIL, atau statistik solver lain. C01–C09 tetap dijelaskan sebagai aturan global; jangan tampilkan badge “constraint X passed” seolah backend mengirim hasil evaluasi individual.

Diagnostik hanya sementara pada response generate; tidak tersimpan dalam preview `hasil_json`, `snapshot_json`, versi, detail, atau history. Persisted `preview_jadwal.hasil_json` tetap canonical solver response v1 sesuai DEC-066. Error response tidak menyertakan diagnostik.

## J. Page-by-Page Implementation Specification

### Overview

- **Tujuan:** landing dashboard ringkas dengan navigasi dan status sistem.
- **Data:** `GET /health`, `GET /jadwal/aktif`, dan metadata `meta.total_items` dari daftar master bila ringkasan jumlah memang diperlukan.
- **Interaksi:** link ke enam area; tampilkan status health dan apakah ada jadwal aktif.
- **Validasi/state:** skeleton saat request; empty state bila active null; degraded notice pada 503; retry manual.
- **Risiko:** tidak ada aggregate endpoint. Hindari klaim statistik global dari page pertama/daftar terpotong. Tidak perlu memuat enam resource hanya untuk menghias dashboard.

### Data Master

- **Tujuan:** CRUD enam resource: mata praktikum, kelompok, asisten, laboratorium, slot waktu, praktikum.
- **Komponen:** resource selector/tabs, tabel server-paginated, form create/edit, status toggle dengan konfirmasi jika sesuai UX.
- **Data/interaksi:** list/detail/create/PATCH/status pada endpoint aktual. Untuk praktikum tampilkan nested summaries, tetapi tulis tiga FK integer; pilihan FK diisi dari list resource aktif.
- **Validasi:** bentuk/nama/count/slot duration/availability reference mengikuti backend; lakukan validasi UX dekat field tetapi backend tetap sumber kebenaran. Partial PATCH harus mengirim field yang berubah saja.
- **States:** loading list/detail; empty/filter-empty; field errors dari `details.field`/`details.fields`; duplicate, inactive reference, not found, server error.
- **Risiko:** Mata Praktikum adalah katalog, Praktikum kegiatan terjadwal; tidak boleh digabung. Soft delete berupa status, bukan DELETE. Jangan tampilkan search untuk slot dan praktikum (tidak didukung).

### Availability

- **Tujuan:** atur slot ketersediaan kelompok dan asisten.
- **Komponen:** owner selector, daftar slot per hari/jam, checkbox/multi-select, simpan perubahan.
- **Data/interaksi:** list kelompok/asisten/slot; GET availability; PUT full replacement dengan seluruh `slot_ids` terpilih.
- **Validasi:** ID slot integer positif unik; susun array lengkap, bukan patch; urutan tidak bermakna. Slot tidak aktif/tidak ditemukan ditolak backend.
- **States:** belum ada availability adalah `[]`; loading; form dirty; save success; errors FK/inactive/database.
- **Risiko:** PUT mengganti seluruh daftar sekaligus. Minta konfirmasi navigasi jika perubahan lokal belum disimpan.

### Constraint Studio

- **Tujuan:** generate, pahami hasil solver, lalu save preview yang diinginkan.
- **Komponen:** readiness context (tanpa mengklaim endpoint khusus), generate CTA, progress/loading, SAT assignment preview, UNSAT panel, diagnostics summary, save CTA/expiry countdown.
- **Data/interaksi:** `POST generate {}` lalu `POST simpan {preview_id}`.
- **Validasi:** source revision hanya display; jangan kirim sebagai otoritas. Save hanya menerima token preview; assignment client tidak writable.
- **States:** no active praktikum/data-not-ready; loading; SAT; UNSAT; timeout; solver unavailable/protocol/process; stale generation; preview ready/expired/stale/consumed; save success.
- **Risiko:** UNSAT HTTP 200; preview tidak dapat di-reload; jaga expiry dan single-use semantics.

### Timetable

- **Tujuan:** baca jadwal yang saat ini active.
- **Komponen:** weekly grid dan table view, hari/jam/lab/kegiatan/kelompok/asisten, status/revision ringkas.
- **Data/interaksi:** `GET /jadwal/aktif`; seluruh data assignment sudah nested. Tampilan hanya baca.
- **Validasi/states:** `data:null` berarti tidak ada jadwal berstatus active; loading/error. Versi invalid/archived dibaca melalui history, bukan endpoint active. Filter client-side hanya di atas seluruh data yang diterima.
- **Risiko:** satu slot waktu boleh berisi beberapa kegiatan pada laboratorium berbeda. Jangan mengasumsikan satu event per slot. Jangan menawarkan edit atau activation historis.

### Schedule History

- **Tujuan:** telusuri versi jadwal immutable.
- **Komponen:** status filter, pagination, sorting `created_at|id`, detail snapshot dan assignment.
- **Data/interaksi:** list `GET /jadwal/riwayat`; detail `GET /jadwal/riwayat/{id}`.
- **Validasi/states:** gunakan `status=active|invalid|archived|all`; default all, page 1/20, `created_at desc`; empty list dan not-found detail.
- **Risiko:** tidak ada restore/edit endpoint. Snapshot adalah label historis, bukan data master terkini.

## K. UI-to-Backend Gap Analysis

Karena file Stitch lokal tidak ditemukan, “elemen Stitch” di tabel berarti deskripsi visual TASK F01 saja.

| Elemen/ide desain | Status | Bukti | Keputusan implementasi |
|---|---|---|---|
| Enam halaman bernama Overview, Data Master, Availability, Constraint Studio, Timetable, Schedule History | adaptable | TASK F01; backend menyediakan operasi yang sesuai kecuali aggregate khusus | Implementasikan sebagai enam route React rekomendasi; tanpa dashboard/solver endpoint baru. |
| Charcoal sidebar, terang, amber; Geist/JetBrains Mono | needs verification | hanya deskripsi; tidak ada file/hex/token lokal | Buat tokens semantik dan responsif; konfirmasi nilai final dari pemilik desain sebelum polish. |
| Overview dashboard statistic cards | adaptable | list API memiliki `meta.total_items`; tidak ada aggregate endpoint | Gunakan health/active; jumlah hanya dari metadata server dan pahami bahwa request tambahan diperlukan. Jangan hitung dari current page. |
| CRUD enam resource | supported | inventaris 30 operasi dan serializer `backend/app/api.py` | Form/tabel mengikuti field writable dan server validation. |
| Availability calendar/grid | supported | GET/PUT ketersediaan dan GET slot | UI mengganti seluruh slot set melalui PUT; hindari PATCH semantics palsu. |
| Constraint Studio dengan per-rule PASS/FAIL atau trace | unsupported | tidak ada metrik individual; hanya diagnostik DEC-067 | Tampilkan penjelasan C01–C09 dan diagnostics yang benar-benar ada saja. |
| Timetable weekly grid | adaptable | active assignment memuat hari, jam, lab, group, assistant; no calendar endpoint | Render client-side; pastikan beberapa kegiatan per slot/lab didukung; selalu sediakan table view. |
| Preview reload/restore | unsupported | tidak ada GET preview; preview single-use, TTL 30 menit | Simpan sementara dalam memory saja; generate ulang setelah reload/expiry. |
| Restore/edit jadwal history | unsupported | hanya GET history; DEC-027 tidak mendukung reaktivasi | UI read-only. |
| User profile/auth/roles | unsupported untuk MVP | DEC-058 tanpa authentication | Jangan membangun login/role sebagai fitur asumsi. |

## L. State Management dan Data Fetching

Rekomendasi awal, bukan keputusan repository:

- **React local state:** cukup untuk modal, selection, tabs, form dirtiness, dan dialog. Jangan buat global store terlebih dahulu.
- **React Router:** direkomendasikan untuk enam halaman dan not-found/navigation. Perlu dipasang bila belum ada router dalam stack yang dipilih.
- **TanStack Query:** direkomendasikan untuk server state, cache list/detail, pagination, invalidation setelah mutasi, loading/error, dan refetch jadwal. Opsional secara teknis; native fetch + hooks cukup untuk MVP kecil, tetapi hindari membuat cache global ad-hoc.
- **React Hook Form + Zod:** opsional. Berguna untuk forms banyak resource dan validasi client; bukan pengganti validasi server. Pilih setelah F03/F04 menilai kompleksitas dan dependency.
- **API client:** satu wrapper `fetch` dengan base URL dari environment Vite (`VITE_API_BASE_URL`, default lokal yang disepakati), JSON headers, parsing success/error envelope, abort signal, dan error typed. Jangan hardcode host di banyak feature.
- **Package management:** npm diminta oleh konteks TASK F01, tetapi pilih versi runtime/toolchain dan commit `package-lock.json` pada F02. Tidak ada dependency dipasang dalam audit ini.

## M. Frontend Testing Strategy

Belum ada frontend tests yang dijalankan atau tersedia karena frontend belum dibuat. Strategi yang direkomendasikan:

1. **Unit/component:** formatter hari/waktu/status, pagination, field mapping, diagnostics rendering, empty/loading/error states; pakai test runner/library yang disetujui pada F02.
2. **API client contract tests:** mock `fetch` untuk data envelope, list meta, error envelope, JSON malformed, network offline, abort, dan status HTTP 200 UNSAT.
3. **Feature integration:** mock response sesuai fixtures backend; CRUD/no-op, availability full replacement, generate SAT/UNSAT, save expired/stale/consumed, active/history read-only.
4. **E2E browser:** UI → backend lokal pada environment terisolasi; pastikan route dan CORS. Jangan menggunakan database pengguna/production. Data setup/cleanup mengikuti command fixture yang disetujui, bukan membuat endpoint atau seed palsu.
5. **Scenarios minimal:** database kosong, active null, empty history, validation 422, 409 stale/expired, solver timeout/unavailable, backend offline, health degraded, concurrent navigation saat preview.

Status setiap tes harus dilaporkan setelah benar-benar dijalankan; daftar ini adalah rencana, bukan klaim hasil.

## N. Implementation Roadmap

| Tahap | Scope dan dependency | Kriteria selesai | Testing | Risiko |
|---|---|---|---|---|
| **F02 — scaffolding** | Pilih versi/runtime TS/nama npm scripts; setup React+Vite+TS+Tailwind+shadcn/ui minimum, env example, lint/test decision. Tidak perlu backend changes. | `npm install` reproducible dari lockfile; dev server Vite pada 5173; build berhasil; konfigurasi CSS/token awal; tidak menambahkan folder di luar `frontend/`. | install/build, smoke render, lint/typecheck sesuai pilihan. | Node/npm version belum dikunci; dependency shadcn yang dihasilkan harus sesuai Tailwind major version. |
| **F03 — layout, routing, design system** | App shell, sidebar/header, responsive navigation, enam route + 404, tokens dan primitives. Bergantung F02; HTML Stitch lokal tidak tersedia. | semua route render tanpa error; active nav dan responsive/focus states bekerja; visual direction mengikuti referensi tekstual. | component/route tests, keyboard/focus smoke. | Angka visual detail perlu review desain; jangan anggap placeholder sebagai final. |
| **F04 — API client dan shared contracts** | DTO types, base URL env, fetch/error wrapper, query library bila dipilih. Bergantung F02 dan kontrak saat ini. | client membedakan network, HTTP, JSON, success, UNSAT; types sesuai actual serializers; endpoint functions tanpa endpoint baru. | API mock tests; contract fixture typing; verify CORS preflight terhadap server lokal. | API host mismatch, nested serializer drift, uncaught errors. |
| **F05 — Data Master** | Enam tabel/form/detail/status CRUD menggunakan F04. | field/partial update/query pagination sesuai resource; tidak ada DELETE; praktikum nested/FK dibedakan. | component/integration tests untuk 6 resource, validation, duplicate/inactive/empty/pagination. | Validation errors/soft delete dan master vs activity semantics. |
| **F06 — Availability** | Owner selector kelompok/asisten, slot selection dan replace. Bergantung F04/F05. | GET mengisi pilihan; PUT mengirim seluruh `slot_ids`; no-op/empty states benar. | GET/PUT replace, empty array, reference error, offline. | Mengirim hanya delta akan salah karena PUT full replacement. |
| **F07 — Constraint Studio** | Generate/preview/diagnostics/save. Bergantung F04, F05, F06. | SAT/UNSAT/error dipisah; preview in-memory, countdown/expiry hint, save hanya token; success navigasi refresh active. | SAT/UNSAT, error codes, source revision, diagnostics shape, expiry/stale/consumed, no duplicate action. | Preview tidak bisa fetch lagi; jangan menyimpan hasil kedaluwarsa atau menganggap UNSAT error. |
| **F08 — Timetable** | Read active, weekly grid dan table view. Bergantung F04/F07. | active null/filled, invalid state, collisions beberapa lab pada waktu sama ditampilkan benar. | serializer rendering, multi-activity same slot, responsive/table fallback. | Layout kalender dapat menyembunyikan beberapa kegiatan yang paralel. |
| **F09 — Schedule History** | History list/detail/status sort pagination. Bergantung F04/F08. | filter/sort/page mengikuti whitelist; detail snapshot immutable; tidak ada restore/edit. | all status, tie-break, empty page, 404 detail, historic labels unchanged. | Menggunakan label master terbaru merusak representasi sejarah. |
| **F10 — Overview** | Compose health, active summary, dan metadata counts jika dibutuhkan. Bergantung F04, F08, F09. | dashboard tidak menyatakan data unavailable sebagai zero; setiap card berasal dari endpoint/metadata terverifikasi. | parallel failure, one endpoint degraded, active null, counts from meta. | Tidak ada aggregate endpoint; banyak request atau angka tidak lengkap. |
| **F11 — integration testing & polishing** | Backend-integrated browser tests, accessibility/responsive, loading/errors, copy and cleanup. Bergantung F05–F10. | core paths berfungsi end-to-end; tidak ada API call nonkontrak; docs/run instructions akurat. | E2E data isolated; backend offline; CORS; SAT/UNSAT/save/history; manual accessibility review. | Test data/state cleanup dan environment SWI-Prolog lokal. |

## O. Open Questions dan Risks

### Perlu keputusan/konfirmasi tim

1. Versi Node.js/npm dan versi dependency utama; TypeScript path alias; lint/test/browser E2E tools.
2. Apakah memilih React Router, TanStack Query, React Hook Form, dan Zod; rekomendasi bagian L bukan keputusan final.
3. Desain Stitch final yang dapat diakses (URL/export/HTML), nilai color/font tokens, layout breakpoint, serta persetujuan visual.
4. Bentuk informasi Overview tanpa aggregate API dan apakah banyak request list dapat diterima.
5. Format waktu/hari yang dilokalkan dan teks Bahasa Indonesia untuk tiap error code; pastikan timestamp UTC tidak disalahartikan sebagai waktu lokal.
6. Cara aman menyediakan fixture/demo data untuk browser E2E tanpa menambah seed endpoint atau mengubah database pengguna.
7. Apakah TASK-BOARD perlu diperbarui terpisah untuk menandai implementasi backend/solver yang checklist-nya tertinggal. Blueprint tidak mengubah TASK-BOARD.

### Risiko integrasi utama

- CORS hanya mengizinkan dua origin localhost Vite di port 5173. Jangan berganti host (`localhost` ↔ `127.0.0.1`) tanpa menyesuaikan konfigurasi sesuai review.
- Backend berjalan pada port 5000 sesuai README; jika memakai Vite proxy, dokumentasikan dan uji konfigurasi. Tidak ada proxy saat ini.
- Error `409`, `422`, `502`, `503`, `504` memiliki makna berbeda; jangan tampilkan semua sebagai generic failure. Error HTTP 200 dengan status UNSAT tetap hasil valid.
- Preview bersifat single-use/TTL; navigasi, reload, multi-tab, dan double-click harus ditangani tanpa mengirim assignment client.
- Query pagination/default/filter dan search berbeda antara master dan history. Jangan membuat query params yang tidak dikontrak.
- Tidak ada authentication pada MVP lokal. CORS bukan mekanisme auth/security boundary.
- Desain Constraint Studio dapat menyiratkan solver trace/per-rule result; data seperti itu tidak tersedia.

### Keputusan untuk memulai F02

Kontrak dan backend cukup siap untuk scaffolding frontend, tetapi F02 sebaiknya mengunci Node/npm version, pilihan TypeScript dan package scripts, routing/data-fetching/form/testing dependencies, serta sumber desain Stitch yang akan direview. Persetujuan formal/review tim pada Gerbang 0 `TASK-BOARD.md` masih terbuka dan tidak boleh dianggap selesai hanya karena Blueprint ini tersedia.
