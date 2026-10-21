import type { Asisten, Kelompok, Laboratorium, MataPraktikum, Praktikum, SlotWaktu } from '../types/master'
import type { Health } from '../types/health'
import type { ActiveSchedule, Assignment, GenerateSuccess, GenerateUnsatisfiable, ScheduleHistoryDetail, ScheduleHistoryItem } from '../types/scheduling'

// Test-only fixtures following Flask serializers and API-CONTRACT, never imported by UI.
export const timestamp = '2026-10-18T08:30:00.000Z'
const base = { is_active: true, created_at: timestamp, updated_at: timestamp }
export const mata: MataPraktikum = { ...base, id: 1, nama: 'Kecerdasan Buatan' }
export const kelompok: Kelompok = { ...base, id: 2, nama: 'IF-3A', jumlah_peserta: 24 }
export const asisten: Asisten = { ...base, id: 3, nama: 'Rina' }
export const lab: Laboratorium = { ...base, id: 5, nama: 'Lab AI', kapasitas: 30 }
export const slot: SlotWaktu = { ...base, id: 4, hari: 1, jam_mulai: '08:00', jam_selesai: '10:00' }
export const praktikum: Praktikum = {
  ...base, id: 11, mata_praktikum_id: 1, kelompok_id: 2, asisten_id: 3,
  mata_praktikum: { id: 1, nama: mata.nama },
  kelompok: { id: 2, nama: kelompok.nama, jumlah_peserta: kelompok.jumlah_peserta },
  asisten: { id: 3, nama: asisten.nama },
}
export const assignment: Assignment = {
  praktikum_id: praktikum.id, mata_praktikum: praktikum.mata_praktikum,
  kelompok: praktikum.kelompok, asisten: praktikum.asisten,
  slot_waktu: { id: 4, hari: 1, jam_mulai: '08:00', jam_selesai: '10:00' },
  laboratorium: { id: 5, nama: lab.nama, kapasitas: lab.kapasitas },
}
export const sat: GenerateSuccess = {
  status: 'success', preview_id: '550e8400-e29b-41d4-a716-446655440000', preview_status: 'ready',
  source_revision: 7, created_at: timestamp, expires_at: '2026-10-18T09:00:00.000Z',
  summary: { total_praktikum: 1, total_assignment: 1 }, assignments: [assignment],
  solver_diagnostics: {
    wall_time_ms: 42,
    domain_candidates: [{ praktikum_id: 11, slot_count: 3, laboratory_count: 2, theoretical_pairs: 6 }],
    verification: { overall: 'passed' },
  },
}
export const unsat: GenerateUnsatisfiable = {
  status: 'unsatisfiable', source_revision: 7, message: 'Tidak ditemukan jadwal yang memenuhi seluruh aturan.', assignments: [],
  solver_diagnostics: { wall_time_ms: 10, domain_candidates: [{ praktikum_id: 11, slot_count: 0, laboratory_count: 2, theoretical_pairs: 0 }], verification: { overall: 'not_applicable' } },
}
export const historyItem: ScheduleHistoryItem = {
  id: 21, status: 'active', source_revision: 7, created_at: '2026-10-18T08:35:00.000Z',
  invalidated_at: null, archived_at: null, summary: { total_praktikum: 1, total_assignment: 1 },
}
export const saved: ActiveSchedule = { ...historyItem, status: 'active', invalidated_at: null, archived_at: null, assignments: [assignment] }
export const historyDetail: ScheduleHistoryDetail = {
  ...saved, snapshot: { schema_version: 1, source_revision: 7, generated_at: timestamp, saved_at: saved.created_at },
}
export const health: Health = { status: 'healthy', components: { backend: 'available', database: 'available', solver: 'available' }, checked_at: timestamp }
export const degraded: Health = { ...health, status: 'degraded', components: { ...health.components, solver: 'unavailable' } }
export const meta = { page: 1, page_size: 20, total_items: 1, total_pages: 1 }

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}
