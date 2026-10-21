import { Archive, History, LockKeyhole } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PagePlaceholder } from '@/components/PagePlaceholder'
import { ScopeCard } from '@/components/ScopeCard'

export function ScheduleHistoryPage() {
  return (
    <>
      <PageHeader section="AI Scheduling" title="Schedule History" description="Telusuri versi jadwal tersimpan dan tinjau snapshot historis yang tetap terjaga setelah data master berubah." />
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <PagePlaceholder title="Daftar versi jadwal" icon={History} description="Daftar versi, filter status, dan pagination akan tersedia setelah integrasi riwayat. Belum ada arsip yang dimuat." />
        <div className="space-y-5">
          <PagePlaceholder title="Detail snapshot" icon={Archive} description="Assignment historis dan metadata versi akan ditampilkan dari snapshot tersimpan. Belum ada versi yang dipilih." />
          <ScopeCard title="Riwayat immutable" items={[
            { title: 'Peninjauan hanya baca', description: 'Snapshot mempertahankan data saat jadwal disimpan. Versi historis tidak diedit atau diaktifkan kembali dari halaman ini.', icon: LockKeyhole },
          ]} />
        </div>
      </div>
    </>
  )
}
