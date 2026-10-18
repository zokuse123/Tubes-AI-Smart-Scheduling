# AGENTS.md — Smart Lab Scheduling System

## Prinsip wajib
1. Sebelum mengubah kode, baca `docs/PROJECT-SPEC.md`, `docs/DATA-MODEL.md`, `docs/AI-RULES.md`, `docs/API-CONTRACT.md`, `docs/DECISIONS.md`, dan `docs/TASK-BOARD.md`.
2. Dokumen berstatus draft **bukan izin untuk mengimplementasikan asumsi yang belum disetujui**. Jika ambigu, jelaskan pertanyaan dan berhenti pada titik tersebut.
3. Jangan mengubah skema, endpoint, nama field, kode error, constraint, atau keputusan desain secara sepihak. Ajukan perubahan untuk review tiga anggota.
4. Lingkup kepemilikan: Galang `prolog/`, Iqbal `frontend/`, Zicco `backend/`. Perubahan lintas folder harus disepakati.
5. Satu tugas kecil per sesi. Awali dengan audit read-only, rencana, daftar file yang perlu diubah, risiko, dan pengujian. Implementasikan hanya setelah pengguna menyetujui.
6. Jangan menghapus/memindahkan proyek belajar Prolog lama. Jangan melakukan operasi git destruktif, force push, atau mengubah file anggota lain tanpa izin.
7. Backend tidak boleh menyelesaikan CSP sendiri; penentuan jadwal wajib di Prolog.
8. Selalu jalankan tes yang relevan jika tersedia. Laporkan perintah, hasil, kegagalan, dan tes yang tidak bisa dijalankan. Jangan mengaku tes lulus tanpa menjalankannya.
9. Semua perubahan yang memengaruhi revisi data/jadwal harus konsisten secara transaksional. Jangan percaya assignment atau status jadwal dari klien.
10. Tutup setiap tugas dengan: ringkasan, file berubah, hasil tes, keputusan terbuka, dan usulan commit. Jangan mengklaim sudah merge tanpa bukti.

## Instruksi awal agen
Jika belum ada kode atau spesifikasi final, **jangan langsung generate aplikasi**. Baca dokumen, identifikasi konflik/keputusan yang belum selesai, dan tawarkan rencana tahap pertama.
