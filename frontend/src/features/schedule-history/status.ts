import type { ScheduleStatus } from '@/api/types/scheduling'

export const statusDescriptions: Record<ScheduleStatus, string> = {
  active: 'Status active berarti versi berlaku pada saat status tersebut dibaca; paling banyak satu versi aktif.',
  invalid: 'Versi kehilangan validitas karena perubahan data sumber yang relevan. Snapshot tetap tersimpan dan tidak dapat diaktifkan ulang.',
  archived: 'Versi digantikan jadwal baru tanpa sebelumnya terinvalidasi. Arsip bukan berarti solver gagal; snapshot tetap tersimpan.',
}
