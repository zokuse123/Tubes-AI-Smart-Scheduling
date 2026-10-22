import { Timestamp } from '@/components/Timestamp'
import type { ScheduleHistoryDetail } from '@/api/types/scheduling'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScheduleTable } from '@/features/timetable/ScheduleTable'
import { compareAssignments } from '@/features/timetable/presentation'
import { VersionStatus } from './VersionStatus'
import { statusDescriptions } from './status'

export function HistoryDetail({ detail, unconfirmed }: { detail: ScheduleHistoryDetail; unconfirmed: boolean }) {
  const assignments = [...detail.assignments].sort(compareAssignments)
  return <div className="space-y-4">
    <Card><CardHeader className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Snapshot versi #{detail.id}</h3><VersionStatus status={detail.status} unconfirmed={unconfirmed} /></CardHeader><CardContent className="space-y-5">
      {unconfirmed && <p role="status" className="text-sm text-muted-foreground">Snapshot cache ditampilkan; status versi belum terkonfirmasi pada pembacaan terbaru.</p>}
      <p className="text-sm leading-6">{statusDescriptions[detail.status]}</p>
      <dl className="grid gap-4 text-xs sm:grid-cols-2 xl:grid-cols-3">
        <div><dt className="text-muted-foreground">Waktu versi (WIB)</dt><dd className="mt-1 break-all font-mono"><Timestamp value={detail.created_at} /></dd></div>
        <div><dt className="text-muted-foreground">Source revision versi</dt><dd className="mt-1 font-mono">{detail.source_revision}</dd></div>
        <div><dt className="text-muted-foreground">Kegiatan / penempatan (backend)</dt><dd className="mt-1 font-mono">{detail.summary.total_praktikum} / {detail.summary.total_assignment}</dd></div>
        <div><dt className="text-muted-foreground">Schema snapshot</dt><dd className="mt-1 font-mono">{detail.snapshot.schema_version}</dd></div>
        <div><dt className="text-muted-foreground">Source revision snapshot</dt><dd className="mt-1 font-mono">{detail.snapshot.source_revision}</dd></div>
        <div><dt className="text-muted-foreground">Snapshot digenerate (WIB)</dt><dd className="mt-1 break-all font-mono"><Timestamp value={detail.snapshot.generated_at} /></dd></div>
        <div><dt className="text-muted-foreground">Snapshot disimpan (WIB)</dt><dd className="mt-1 break-all font-mono"><Timestamp value={detail.snapshot.saved_at} /></dd></div>
        {detail.invalidated_at && <div><dt className="text-muted-foreground">Diinvalidasi (WIB)</dt><dd className="mt-1 break-all font-mono"><Timestamp value={detail.invalidated_at} /></dd></div>}
        {detail.archived_at && <div><dt className="text-muted-foreground">Diarsipkan (WIB)</dt><dd className="mt-1 break-all font-mono"><Timestamp value={detail.archived_at} /></dd></div>}
      </dl>
      <p className="text-xs leading-5 text-muted-foreground">Assignment dan label historis berasal dari snapshot immutable, bukan katalog master terkini. Halaman ini hanya baca; tidak menghitung ulang CSP atau mengaktifkan kembali versi historis.</p>
    </CardContent></Card>
    <h3 className="text-sm font-semibold">Penempatan historis versi #{detail.id}</h3>
    <p role="status" className="text-xs text-muted-foreground">Menampilkan seluruh {assignments.length} penempatan snapshot.</p>
    {assignments.length ? <ScheduleTable assignments={assignments} /> : <p className="rounded-lg border border-border bg-card p-5 text-sm">Snapshot ini tidak memuat penempatan.</p>}
  </div>
}
