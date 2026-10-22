import type { Page } from '@playwright/test'
import { createMaster } from './master-data.ts'
import { allowSlot } from './availability.ts'

export async function createDataset(page: Page, prefix: string, parallel = false) {
  const activities: { id: number; subjectId: number; groupId: number; assistantId: number; subjectName: string }[] = []
  const labs: { id: number; name: string }[] = []
  for (let index = 0; index < (parallel ? 2 : 1); index++) {
    const subjectName = `${prefix} Mata ${index + 1}`
    const subject = await createMaster(page, 'mata-praktikum', { nama: subjectName })
    const group = await createMaster(page, 'kelompok', { nama: `${prefix} Kelompok ${index + 1}`, jumlah_peserta: 20 })
    const assistant = await createMaster(page, 'asisten', { nama: `${prefix} Asisten ${index + 1}` })
    const labName = `${prefix} Lab ${index + 1}`
    const lab = await createMaster(page, 'laboratorium', { nama: labName, kapasitas: 30 })
    const activity = await createMaster(page, 'praktikum', { mata_praktikum_id: subject.id, kelompok_id: group.id, asisten_id: assistant.id })
    activities.push({ id: activity.id, subjectId: subject.id, groupId: group.id, assistantId: assistant.id, subjectName })
    labs.push({ id: lab.id, name: labName })
  }
  const slot = await createMaster(page, 'slot-waktu', { hari: 1, jam_mulai: '08:00', jam_selesai: '10:00' })
  return { activities, labs, slotId: slot.id }
}
export type Dataset = Awaited<ReturnType<typeof createDataset>>
export async function allowDataset(page: Page, dataset: Dataset) {
  for (const activity of dataset.activities) {
    await allowSlot(page, 'kelompok', activity.groupId, dataset.slotId)
    await allowSlot(page, 'asisten', activity.assistantId, dataset.slotId)
  }
}
