import type { Assignment } from '@/api/types/scheduling'
import { days } from '@/features/master-data/resources'
import { referenceLabel } from '@/features/constraint-studio/presentation'
import { groupSlots } from './presentation'

export function WeeklyGrid({ assignments }: { assignments: readonly Assignment[] }) {
  const slots = groupSlots(assignments)
  const presentDays = [...new Set(slots.map(({ slot }) => slot.hari))]
  return <div role="region" aria-label="Grid jadwal mingguan" className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
    {presentDays.map((day) => <section key={day} aria-label={`Jadwal ${days[day - 1]}`} className="min-w-0 space-y-4 rounded-lg border border-border bg-muted/35 p-3">
      <h2 className="border-b border-border pb-3 text-sm font-semibold">{days[day - 1]}</h2>
      {slots.filter(({ slot }) => slot.hari === day).map(({ slot, assignments: activities }) => <section key={`${slot.id}:${slot.jam_mulai}:${slot.jam_selesai}`} aria-label={`${days[day - 1]} ${slot.jam_mulai}–${slot.jam_selesai} slot #${slot.id}`} className="space-y-2">
        <h3 className="font-mono text-xs font-medium">{slot.jam_mulai}–{slot.jam_selesai}<span className="ml-2 text-[10px] text-muted-foreground">Slot #{slot.id}</span></h3>
        <ul className="space-y-3">{activities.map((assignment) => <li key={assignment.praktikum_id}><article aria-label={`Praktikum #${assignment.praktikum_id}`} className="min-w-0 space-y-3 rounded-lg border border-primary/20 bg-card p-4 shadow-sm">
          <div><p className="font-mono text-[10px] text-muted-foreground">Praktikum #{assignment.praktikum_id}</p><h4 className="mt-1 break-words text-sm font-semibold">{referenceLabel(assignment.mata_praktikum)}</h4></div>
          <dl className="space-y-3 text-xs">
            <div><dt className="text-muted-foreground">Kelompok</dt><dd className="mt-1 break-words">{referenceLabel(assignment.kelompok)}<span className="mt-1 block text-muted-foreground">{assignment.kelompok.jumlah_peserta} peserta</span></dd></div>
            <div><dt className="text-muted-foreground">Asisten</dt><dd className="mt-1 break-words">{referenceLabel(assignment.asisten)}</dd></div>
            <div className="border-t border-border pt-3"><dt className="text-muted-foreground">Laboratorium</dt><dd className="mt-1 break-words font-medium">{referenceLabel(assignment.laboratorium)}<span className="mt-1 block font-normal text-muted-foreground">Kapasitas {assignment.laboratorium.kapasitas}</span></dd></div>
          </dl>
          <p className="font-mono text-[10px] text-muted-foreground">{slot.jam_mulai}–{slot.jam_selesai}</p>
        </article></li>)}</ul>
      </section>)}
    </section>)}
  </div>
}
