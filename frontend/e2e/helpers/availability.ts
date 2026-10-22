import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { assistantAvailabilitySchema, groupAvailabilitySchema } from '../../src/api/types/availability'
import { getData, navigate, uiMutation } from './http.ts'

async function selectOwner(page: Page, type: 'kelompok' | 'asisten', id: number) {
  await navigate(page, 'Availability', '/availability')
  await page.getByLabel('Jenis resource', { exact: true }).selectOption(type)
  await page.getByLabel(type === 'kelompok' ? 'Pilih kelompok' : 'Pilih asisten', { exact: true }).selectOption(String(id))
}
export async function allowSlot(page: Page, type: 'kelompok' | 'asisten', id: number, slotId: number) {
  await selectOwner(page, type, id)
  const slot = page.getByRole('checkbox', { name: `Senin 08:00–10:00 · ID #${slotId}`, exact: true })
  await slot.check()
  await uiMutation(page, 'PUT', `${type}/${id}/ketersediaan`, { slot_ids: [slotId] }, () => page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click())
  await expect(page.getByText('Ketersediaan berhasil disimpan.', { exact: true })).toBeVisible()
  const data = type === 'kelompok'
    ? await getData(page, `${type}/${id}/ketersediaan`, groupAvailabilitySchema)
    : await getData(page, `${type}/${id}/ketersediaan`, assistantAvailabilitySchema)
  expect(data.slot_ids).toEqual([slotId])
  // Persistence, not just local draft: reload, reselect, and read the checked state.
  await page.reload()
  await selectOwner(page, type, id)
  await expect(page.getByRole('checkbox', { name: `Senin 08:00–10:00 · ID #${slotId}`, exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Simpan perubahan', exact: true })).toBeDisabled()
}
