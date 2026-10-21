import { FileCheck2, Layers, Workflow } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PagePlaceholder } from '@/components/PagePlaceholder'
import { ScopeCard } from '@/components/ScopeCard'

export function ConstraintStudioPage() {
  return (
    <>
      <PageHeader section="AI Scheduling" title="Constraint Studio" description="Ruang kerja untuk menyusun, meninjau, dan menyimpan hasil penjadwalan melalui solver SWI-Prolog CLP(FD)." />
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <ScopeCard className="h-full" title="Mesin penjadwalan" items={[
          { title: 'SWI-Prolog CLP(FD)', description: 'Pencarian solusi dijalankan Prolog dengan sembilan hard constraint C01–C09. Antarmuka React berkomunikasi melalui Flask.', icon: Workflow },
        ]} />
        <ScopeCard className="h-full" title="Domain dan verifikasi" items={[
          { title: 'Diagnostik hasil', description: 'Durasi, domain kandidat awal, dan hasil verifikasi hanya ditampilkan dari respons solver yang nyata.', icon: Layers },
        ]} />
      </div>
      <PagePlaceholder title="Workspace solver dan preview" icon={FileCheck2} description="Generate, preview, diagnostik, dan penyimpanan jadwal belum diaktifkan. Belum ada proses solver yang dijalankan atau hasil yang ditampilkan." />
    </>
  )
}
