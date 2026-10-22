import type { Assignment } from '@/api/types/scheduling'
import { days } from '@/features/master-data/resources'
import { referenceLabel } from './presentation'

export function AssignmentsTable({ assignments }: { assignments: readonly Assignment[] }) {
  return <div className="overflow-x-auto">
    <table className="w-full text-left text-sm" aria-label="Preview penempatan praktikum">
      <thead className="border-b border-border bg-muted/60 text-xs text-muted-foreground"><tr>{['Praktikum', 'Mata praktikum', 'Kelompok', 'Asisten', 'Waktu', 'Laboratorium'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-border">{assignments.map((assignment) => <tr key={assignment.praktikum_id}>
        <td className="px-4 py-3 font-mono text-xs">#{assignment.praktikum_id}</td>
        <td className="min-w-36 px-4 py-3">{referenceLabel(assignment.mata_praktikum)}</td>
        <td className="min-w-36 px-4 py-3">{referenceLabel(assignment.kelompok)}<span className="mt-1 block text-xs text-muted-foreground">{assignment.kelompok.jumlah_peserta} peserta</span></td>
        <td className="min-w-28 px-4 py-3">{referenceLabel(assignment.asisten)}</td>
        <td className="min-w-36 px-4 py-3"><span className="block">{days[assignment.slot_waktu.hari - 1]}</span><span className="block font-mono text-xs">{assignment.slot_waktu.jam_mulai}–{assignment.slot_waktu.jam_selesai}</span><span className="text-xs text-muted-foreground">Slot #{assignment.slot_waktu.id}</span></td>
        <td className="min-w-36 px-4 py-3">{referenceLabel(assignment.laboratorium)}<span className="mt-1 block text-xs text-muted-foreground">Kapasitas {assignment.laboratorium.kapasitas}</span></td>
      </tr>)}</tbody>
    </table>
  </div>
}
