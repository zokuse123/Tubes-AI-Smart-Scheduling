import { scheduleStatusLabels } from '@/lib/presentation'
import { Timestamp } from '@/components/Timestamp'
import { useState } from 'react'
import type { ActiveSchedule } from '@/api/types/scheduling'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/controls'
import { referenceLabel } from '@/features/constraint-studio/presentation'
import { days } from '@/features/master-data/resources'
import { emptyFilters, visibleAssignments } from './presentation'
import { WeeklyGrid } from './WeeklyGrid'
import { ScheduleTable } from './ScheduleTable'

export function SnapshotView({ schedule, unconfirmed }: { schedule: ActiveSchedule; unconfirmed: boolean }) {
  const [filters, setFilters] = useState(emptyFilters)
  const [mode, setMode] = useState<'grid' | 'table'>('grid')
  const assignments = visibleAssignments(schedule.assignments, filters)
  const presentDays = [...new Set(schedule.assignments.map((assignment) => assignment.slot_waktu.hari))].sort((a, b) => a - b)
  const labs = [...new Map(schedule.assignments.map((assignment) => [assignment.laboratorium.id, assignment.laboratorium])).values()].sort((a, b) => a.id - b.id)
  const groups = [...new Map(schedule.assignments.map((assignment) => [assignment.kelompok.id, assignment.kelompok])).values()].sort((a, b) => a.id - b.id)
  const filtered = Object.values(filters).some((value) => value !== 'all')
  return <div className="space-y-5">
    <Card><CardHeader className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{unconfirmed ? 'Snapshot terakhir — belum terkonfirmasi aktif' : 'Jadwal aktif'}</CardTitle><Badge tone={unconfirmed ? 'neutral' : 'success'}>{unconfirmed ? `Status terakhir: ${scheduleStatusLabels[schedule.status]}` : scheduleStatusLabels[schedule.status]}</Badge></CardHeader><CardContent>
      <dl className="grid gap-5 text-sm sm:grid-cols-2 xl:grid-cols-5">
        <div><dt className="text-xs text-muted-foreground">Versi jadwal</dt><dd className="mt-1 font-mono">#{schedule.id}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Disimpan (WIB)</dt><dd className="mt-1 break-all font-mono text-xs"><Timestamp value={schedule.created_at} /></dd></div>
        <div><dt className="text-xs text-muted-foreground">Source revision</dt><dd className="mt-1 font-mono">{schedule.source_revision}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Kegiatan (ringkasan backend)</dt><dd className="mt-1 font-mono">{schedule.summary.total_praktikum}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Penempatan (ringkasan backend)</dt><dd className="mt-1 font-mono">{schedule.summary.total_assignment}</dd></div>
      </dl>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">Jadwal hanya baca. Nama, ID, dan alokasi berasal dari snapshot tersimpan, bukan katalog master terkini. Tidak ada metrik solver atau verifikasi individual pada respons jadwal aktif.</p>
    </CardContent></Card>
    <Card><CardContent className="flex flex-wrap items-end gap-4">
      <div role="group" aria-label="Mode tampilan" className="flex gap-2"><Button variant={mode === 'grid' ? 'default' : 'outline'} aria-pressed={mode === 'grid'} onClick={() => setMode('grid')}>Grid</Button><Button variant={mode === 'table' ? 'default' : 'outline'} aria-pressed={mode === 'table'} onClick={() => setMode('table')}>Tabel</Button></div>
      <div><label htmlFor="timetable-day" className="mb-1.5 block text-xs font-medium">Hari</label><Select id="timetable-day" value={filters.day} onChange={(event) => setFilters((current) => ({ ...current, day: event.target.value }))}><option value="all">Semua hari</option>{presentDays.map((day) => <option key={day} value={day}>{days[day - 1]}</option>)}</Select></div>
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-48"><label htmlFor="timetable-lab" className="mb-1.5 block text-xs font-medium">Laboratorium</label><Select id="timetable-lab" value={filters.lab} onChange={(event) => setFilters((current) => ({ ...current, lab: event.target.value }))}><option value="all">Semua laboratorium</option>{labs.map((lab) => <option key={lab.id} value={lab.id}>{referenceLabel(lab)}</option>)}</Select></div>
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-48"><label htmlFor="timetable-group" className="mb-1.5 block text-xs font-medium">Kelompok</label><Select id="timetable-group" value={filters.group} onChange={(event) => setFilters((current) => ({ ...current, group: event.target.value }))}><option value="all">Semua kelompok</option>{groups.map((group) => <option key={group.id} value={group.id}>{referenceLabel(group)}</option>)}</Select></div>
      <Button variant="outline" disabled={!filtered} onClick={() => setFilters(emptyFilters)}>Reset filter</Button>
    </CardContent></Card>
    <p role="status" className="text-xs text-muted-foreground">Menampilkan {assignments.length} dari {schedule.assignments.length} penempatan snapshot.</p>
    {!assignments.length ? <Card><CardContent><p className="text-sm">{schedule.assignments.length ? 'Tidak ada penempatan sesuai filter.' : 'Snapshot ini tidak memuat penempatan.'}</p>{filtered && <p className="mt-2 text-xs text-muted-foreground">Gunakan Reset filter untuk menampilkan seluruh snapshot.</p>}</CardContent></Card> : mode === 'grid' ? <WeeklyGrid assignments={assignments} /> : <ScheduleTable assignments={assignments} />}
  </div>
}
