import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { scheduleApi } from '@/api/services/scheduling'
import { queryKeys } from '@/api/queryKeys'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorFeedback, LoadingState } from '@/features/master-data/Feedback'
import { SnapshotView } from '@/features/timetable/SnapshotView'

export function TimetablePage() {
  const query = useQuery({ queryKey: queryKeys.schedules.active(), queryFn: ({ signal }) => scheduleApi.active({ signal }) })
  const schedule = query.data?.data
  return <>
    <PageHeader section="AI Scheduling" title="Timetable" description="Baca jadwal aktif dari snapshot tersimpan. Grid dan tabel tidak mengubah hasil solver." badge="Read-only · Flask REST API" />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Link to="/constraint-studio" className="rounded text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Buka Constraint Studio</Link><Button variant="outline" disabled={query.isFetching} onClick={() => { void query.refetch() }}>Refresh jadwal aktif</Button></div>
    {query.isPending && <LoadingState />}
    {query.isFetching && !query.isPending && <p role="status" className="mb-4 rounded-md border border-primary/25 bg-accent p-4 text-sm">Memeriksa jadwal aktif… Data yang ditampilkan berasal dari pembacaan sebelumnya.</p>}
    {query.isError && <div className="mb-5 space-y-3"><ErrorFeedback error={query.error} retry={() => { void query.refetch() }} /><p className="text-sm text-muted-foreground">{schedule ? 'Data cache mungkin tidak mutakhir. Snapshot di bawah belum terkonfirmasi sebagai jadwal aktif terbaru.' : 'Keberadaan jadwal aktif belum dapat dipastikan. Kegagalan request bukan bukti bahwa jadwal kosong.'}</p></div>}
    {!query.isError && !query.isFetching && schedule === null && <Card><CardContent><h2 className="text-sm font-semibold">Belum ada jadwal aktif</h2><p className="mt-2 text-sm text-muted-foreground">Generate dan simpan jadwal melalui Constraint Studio untuk membuat versi aktif. Tidak ada solver yang dijalankan dari halaman ini.</p></CardContent></Card>}
    {schedule && <SnapshotView key={`${schedule.id}:${schedule.source_revision}:${schedule.created_at}`} schedule={schedule} unconfirmed={query.isFetching || query.isError} />}
  </>
}
