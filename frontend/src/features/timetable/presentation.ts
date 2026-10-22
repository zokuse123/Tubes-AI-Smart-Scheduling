import type { Assignment } from '@/api/types/scheduling'

export type Filters = { day: string; lab: string; group: string }
export const emptyFilters: Filters = { day: 'all', lab: 'all', group: 'all' }

export function compareAssignments(a: Assignment, b: Assignment) {
  return a.slot_waktu.hari - b.slot_waktu.hari
    || a.slot_waktu.jam_mulai.localeCompare(b.slot_waktu.jam_mulai)
    || a.slot_waktu.jam_selesai.localeCompare(b.slot_waktu.jam_selesai)
    || a.slot_waktu.id - b.slot_waktu.id
    || a.laboratorium.id - b.laboratorium.id
    || a.praktikum_id - b.praktikum_id
}

export function visibleAssignments(assignments: readonly Assignment[], filters: Filters) {
  return assignments.filter((assignment) =>
    (filters.day === 'all' || assignment.slot_waktu.hari === Number(filters.day))
    && (filters.lab === 'all' || assignment.laboratorium.id === Number(filters.lab))
    && (filters.group === 'all' || assignment.kelompok.id === Number(filters.group)),
  ).sort(compareAssignments)
}

/** Keep slot identity even when two labels happen to describe the same interval. */
export function groupSlots(assignments: readonly Assignment[]) {
  const slots = new Map<string, { slot: Assignment['slot_waktu']; assignments: Assignment[] }>()
  for (const assignment of [...assignments].sort(compareAssignments)) {
    const slot = assignment.slot_waktu
    const key = `${slot.hari}:${slot.jam_mulai}:${slot.jam_selesai}:${slot.id}`
    const group = slots.get(key)
    if (group) group.assignments.push(assignment)
    else slots.set(key, { slot, assignments: [assignment] })
  }
  return [...slots.values()]
}
