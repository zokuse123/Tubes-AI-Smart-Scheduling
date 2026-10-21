import { ArrowUpRight, CalendarDays, CalendarRange, Database, History, LayoutDashboard, Workflow } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { PagePlaceholder } from '@/components/PagePlaceholder'
import { ScopeCard } from '@/components/ScopeCard'

const shortcuts = [
  { to: '/data-master', title: 'Data Master', description: 'Katalog dan sumber daya praktikum.', icon: Database },
  { to: '/availability', title: 'Availability', description: 'Ketersediaan kelompok dan asisten.', icon: CalendarRange },
  { to: '/constraint-studio', title: 'Constraint Studio', description: 'Ruang kerja penjadwalan berbasis CSP.', icon: Workflow },
]

export function OverviewPage() {
  return (
    <>
      <PageHeader section="Workspace" title="Overview" description="Ruang kerja penjadwalan praktikum laboratorium, dari persiapan data hingga peninjauan jadwal." />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <PagePlaceholder title="Laboratory Scheduling Overview" icon={LayoutDashboard} description="Ringkasan sumber daya dan kondisi penjadwalan akan ditampilkan setelah integrasi API. Data belum dimuat pada tampilan ini." />
        <ScopeCard title="Alur ruang kerja" items={[
          { title: 'Persiapan data', description: 'Data master dan ketersediaan menjadi masukan penjadwalan.', icon: Database },
          { title: 'Penyusunan jadwal', description: 'Pencarian solusi dilakukan SWI-Prolog melalui backend Flask.', icon: Workflow },
          { title: 'Jadwal aktif', description: 'Hasil yang disimpan ditinjau melalui halaman Timetable.', icon: CalendarDays },
          { title: 'Riwayat versi', description: 'Snapshot jadwal tersimpan dapat ditinjau kembali.', icon: History },
        ]} />
      </div>
      <section aria-labelledby="shortcuts-title" className="mt-7">
        <h2 id="shortcuts-title" className="mb-3 text-sm font-semibold">Akses ruang kerja</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {shortcuts.map(({ to, title, description, icon: Icon }) => (
            <Link key={to} to={to} className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <div className="mb-4 flex items-center justify-between text-primary">
                <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
                <ArrowUpRight size={17} aria-hidden="true" />
              </div>
              <h3 className="text-sm font-medium">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
