import { CalendarDays, Columns3, LockKeyhole } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PagePlaceholder } from '@/components/PagePlaceholder'
import { ScopeCard } from '@/components/ScopeCard'

export function TimetablePage() {
  return (
    <>
      <PageHeader section="AI Scheduling" title="Timetable" description="Tinjau jadwal praktikum aktif beserta alokasi waktu, laboratorium, kelompok, dan asisten." />
      <PagePlaceholder className="min-h-[26rem]" title="Jadwal mingguan" icon={CalendarDays} description="Tampilan jadwal akan diisi dari versi aktif yang dikembalikan backend. Halaman ini belum membaca atau menampilkan assignment." />
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <ScopeCard title="Tampilan jadwal" items={[
          { title: 'Grid mingguan dan tabel', description: 'Tampilan akan mendukung kegiatan paralel pada laboratorium berbeda tanpa menyembunyikan assignment.', icon: Columns3 },
        ]} />
        <ScopeCard title="Jadwal hanya baca" items={[
          { title: 'Hasil penjadwalan tersimpan', description: 'Assignment berasal dari hasil solver yang telah disimpan, tanpa pengubahan manual di halaman ini.', icon: LockKeyhole },
        ]} />
      </div>
    </>
  )
}
