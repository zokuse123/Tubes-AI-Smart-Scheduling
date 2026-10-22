import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { resources } from '@/features/master-data/resources'
import { VersionStatus } from '@/features/schedule-history/VersionStatus'
import { ReadPanel } from '@/features/overview/ReadPanel'
import { countFilters, useOverview } from '@/features/overview/queries'

const workflow = [
  { to: '/data-master', title: 'Data Master', description: 'Kelola katalog dan enam sumber data.' },
  { to: '/availability', title: 'Availability', description: 'Atur allowlist kelompok dan asisten.' },
  { to: '/constraint-studio', title: 'Constraint Studio', description: 'Generate, tinjau preview, lalu simpan secara eksplisit.' },
  { to: '/timetable', title: 'Timetable', description: 'Tinjau snapshot jadwal yang sedang aktif.' },
  { to: '/schedule-history', title: 'Schedule History', description: 'Baca riwayat dan snapshot versi immutable.' },
]
const linkStyle = 'text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring'

export function OverviewPage() {
  const dashboard = useOverview()
  return <>
    <PageHeader section="Workspace" title="Overview" badge="Read-only · Flask REST API" description="Ringkasan data dan layanan penjadwalan. Setiap bagian dibaca secara independen dari backend." />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">Tanpa polling otomatis. Refresh membaca ulang seluruh ringkasan.</p>
      <Button variant="outline" disabled={dashboard.refreshing} onClick={() => { void dashboard.refresh() }}><RefreshCw size={15} aria-hidden="true" />{dashboard.refreshing ? 'Memperbarui dashboard…' : 'Refresh dashboard'}</Button>
    </div>
    <Card role="region" aria-label="System Health" className="mb-5">
      <CardHeader><CardTitle>System Health</CardTitle></CardHeader>
      <CardContent><ReadPanel query={dashboard.health}>{({ data }, unconfirmed) => <>
        <Badge tone={unconfirmed ? 'neutral' : data.status === 'healthy' ? 'success' : 'destructive'}>{data.status}{unconfirmed ? ' (status terakhir)' : ''}</Badge>
        <dl className="my-4 grid gap-3 sm:grid-cols-3">{Object.entries(data.components).map(([name, value]) => <div key={name} className="rounded-md bg-muted/50 p-3"><dt className="text-xs uppercase text-muted-foreground">{name}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl>
        <p className="text-xs text-muted-foreground">Pemeriksaan backend: <time dateTime={data.checked_at}>{data.checked_at}</time>. Health bukan bukti adanya solusi penjadwalan.</p>
      </>}</ReadPanel></CardContent>
    </Card>
    <section aria-labelledby="master-summary-title">
      <h2 id="master-summary-title" className="mb-2 text-sm font-semibold">Ringkasan Data Master</h2>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">Jumlah berasal dari metadata filter masing-masing, bukan panjang halaman. Pembacaan terpisah bukan snapshot atomik; perubahan bersamaan dapat membuat angka berbeda waktu. Keberadaan data tidak membuktikan kesiapan CSP, kapasitas, atau availability.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{resources.map((resource, index) => <Card role="region" aria-label={resource.label} key={resource.key}>
        <CardHeader><CardTitle>{resource.label}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">{countFilters.map((filter, offset) => <div role="group" aria-label={`${resource.label} ${filter.label}`} key={filter.value}>
          <p className="text-xs text-muted-foreground">{filter.label}</p>
          <ReadPanel query={dashboard.counts[index * 3 + offset]!}>{(data) => <p className="font-mono text-2xl font-semibold tabular-nums">{data.meta.total_items}</p>}</ReadPanel>
        </div>)}</CardContent>
      </Card>)}</div>
    </section>
    <div className="my-5 grid gap-5 lg:grid-cols-2">
      <Card role="region" aria-label="Jadwal aktif"><CardHeader><CardTitle>Jadwal aktif</CardTitle></CardHeader><CardContent>
        <ReadPanel query={dashboard.active}>{({ data }, unconfirmed) => data === null ? <p className="text-sm">{unconfirmed ? 'Pembacaan terakhir: belum ada jadwal aktif.' : 'Belum ada jadwal aktif.'} <Link className={linkStyle} to="/constraint-studio">Buka Constraint Studio</Link></p> : <div className="space-y-3">
          <p className="text-lg font-semibold">Versi #{data.id}</p><VersionStatus status={data.status} unconfirmed={unconfirmed} />
          <p className="text-sm">{data.summary.total_assignment} assignment · {data.summary.total_praktikum} praktikum</p>
          <p className="text-xs text-muted-foreground">Source revision: {data.source_revision}</p>
          <p className="text-xs">Disimpan: <time dateTime={data.created_at}>{data.created_at}</time></p>
        </div>}</ReadPanel>
        <Link className={`${linkStyle} mt-4 inline-block`} to="/timetable">Lihat Timetable</Link>
      </CardContent></Card>
      <Card role="region" aria-label="Ringkasan riwayat"><CardHeader><CardTitle>Ringkasan riwayat</CardTitle></CardHeader><CardContent>
        <ReadPanel query={dashboard.history}>{({ data, meta }, unconfirmed) => <div className="space-y-3">
          <p className="text-sm">Total versi tersimpan: <strong className="font-mono text-xl">{meta.total_items}</strong></p>
          {data[0] ? <><p className="text-lg font-semibold">Versi terbaru #{data[0].id}</p><VersionStatus status={data[0].status} unconfirmed={unconfirmed} /><p className="text-xs"><time dateTime={data[0].created_at}>{data[0].created_at}</time> · Source revision: {data[0].source_revision}</p><p className="text-xs text-muted-foreground">Terbaru berdasarkan waktu simpan dan ID, tidak selalu aktif.</p></> : <p className="text-sm">{unconfirmed ? 'Pembacaan terakhir: belum ada riwayat tersimpan.' : 'Belum ada riwayat tersimpan.'}</p>}
        </div>}</ReadPanel>
        <Link className={`${linkStyle} mt-4 inline-block`} to="/schedule-history">Lihat Schedule History</Link>
      </CardContent></Card>
    </div>
    <nav aria-label="Alur kerja penjadwalan">
      <h2 className="mb-3 text-sm font-semibold">Alur kerja · kunjungi sesuai kebutuhan</h2>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{workflow.map(({ to, title, description }, index) => <li key={to}><Link to={to} className="block h-full rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-ring"><span className="flex items-center justify-between text-xs text-primary">0{index + 1}<ArrowUpRight size={16} aria-hidden="true" /></span><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p></Link></li>)}</ol>
    </nav>
  </>
}
