import type { ScheduleStatus } from '@/api/types/scheduling'

export const scheduleStatusLabels: Record<ScheduleStatus, string> = {
  active: 'Aktif', invalid: 'Tidak Valid', archived: 'Diarsipkan',
}

const jakarta = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** Presentation only: accept canonical UTC, never infer a local offset. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return 'Waktu tidak tersedia'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) return 'Waktu tidak tersedia'
  return `${jakarta.format(date)} WIB`
}
