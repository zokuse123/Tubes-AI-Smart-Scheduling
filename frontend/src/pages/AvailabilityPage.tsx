import { CalendarRange, GraduationCap, Users } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PagePlaceholder } from '@/components/PagePlaceholder'
import { ScopeCard } from '@/components/ScopeCard'

export function AvailabilityPage() {
  return (
    <>
      <PageHeader section="Workspace" title="Resource Availability" description="Atur ketersediaan waktu kelompok dan asisten sebagai masukan untuk penjadwalan praktikum." />
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <PagePlaceholder className="min-h-[26rem]" title="Matriks ketersediaan mingguan" icon={CalendarRange} description="Pilihan resource dan matriks slot mingguan akan ditampilkan setelah integrasi API. Belum ada ketersediaan yang dimuat atau diubah." />
        <ScopeCard title="Resource ketersediaan" items={[
          { title: 'Kelompok', description: 'Ketersediaan setiap kelompok menentukan slot yang dapat digunakan kegiatan praktikum.', icon: Users },
          { title: 'Asisten', description: 'Ketersediaan setiap asisten menjadi batasan waktu pendampingan praktikum.', icon: GraduationCap },
        ]} />
      </div>
    </>
  )
}
