import { BookOpen, Database, Link2, Power } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PagePlaceholder } from '@/components/PagePlaceholder'
import { ScopeCard } from '@/components/ScopeCard'

export function MasterDataPage() {
  return (
    <>
      <PageHeader section="Workspace" title="Data Master" description="Kelola katalog mata praktikum, kelompok, asisten, laboratorium, slot waktu, dan kegiatan praktikum." />
      <ul aria-label="Resource data master" className="mb-5 flex flex-wrap gap-2">
        {['Mata Praktikum', 'Kelompok', 'Asisten', 'Laboratorium', 'Slot Waktu', 'Praktikum'].map((name) => (
          <li key={name} className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">{name}</li>
        ))}
      </ul>
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <PagePlaceholder title="Data resource" icon={Database} description="Daftar, formulir, dan pengelolaan status resource akan tersedia setelah integrasi data master. Belum ada data yang dimuat." />
        <ScopeCard title="Model data praktikum" items={[
          { title: 'Katalog mata praktikum', description: 'Mata praktikum menyimpan jenis praktikum yang dapat digunakan oleh banyak kegiatan.', icon: BookOpen },
          { title: 'Kegiatan praktikum', description: 'Setiap kegiatan mengacu pada satu mata praktikum, satu kelompok, dan satu asisten.', icon: Link2 },
          { title: 'Status resource', description: 'Data master menggunakan aktivasi dan penonaktifan, tanpa penghapusan permanen melalui antarmuka.', icon: Power },
        ]} />
      </div>
    </>
  )
}
