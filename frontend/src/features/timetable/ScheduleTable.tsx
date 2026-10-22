import type { Assignment } from '@/api/types/scheduling'
import { TableScroll } from '@/components/TableScroll'
import { days } from '@/features/master-data/resources'
import { referenceLabel } from '@/features/constraint-studio/presentation'

export function ScheduleTable({ assignments }: { assignments: readonly Assignment[] }) {
  return <TableScroll label="Area gulir tabel jadwal" className="rounded-lg border border-border bg-card">
    <table className="w-full text-left text-sm" aria-label="Tabel penempatan jadwal">
      <caption className="sr-only">Penempatan dari snapshot jadwal tersimpan, diurutkan berdasarkan hari, jam, slot, laboratorium, dan ID praktikum.</caption>
      <thead className="border-b border-border bg-muted/60 text-xs text-muted-foreground"><tr>{['Hari', 'Jam', 'Praktikum', 'Mata praktikum', 'Kelompok', 'Asisten', 'Laboratorium'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-border">{assignments.map((assignment) => <tr key={assignment.praktikum_id}>
        <td className="px-4 py-3">{days[assignment.slot_waktu.hari - 1]}</td>
        <td className="min-w-36 px-4 py-3"><span className="block font-mono text-xs">{assignment.slot_waktu.jam_mulai}–{assignment.slot_waktu.jam_selesai}</span><span className="text-xs text-muted-foreground">Slot #{assignment.slot_waktu.id}</span></td>
        <td className="px-4 py-3 font-mono text-xs">#{assignment.praktikum_id}</td>
        <td className="min-w-36 px-4 py-3">{referenceLabel(assignment.mata_praktikum)}</td>
        <td className="min-w-36 px-4 py-3">{referenceLabel(assignment.kelompok)}<span className="mt-1 block text-xs text-muted-foreground">{assignment.kelompok.jumlah_peserta} peserta</span></td>
        <td className="min-w-28 px-4 py-3">{referenceLabel(assignment.asisten)}</td>
        <td className="min-w-36 px-4 py-3">{referenceLabel(assignment.laboratorium)}<span className="mt-1 block text-xs text-muted-foreground">Kapasitas {assignment.laboratorium.kapasitas}</span></td>
      </tr>)}</tbody>
    </table>
  </TableScroll>
}
