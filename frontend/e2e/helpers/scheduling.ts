import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { activeScheduleSchema, generateSuccessSchema, historyDetailSchema, scheduleMetadataSchema } from '../../src/api/types/scheduling'
import type { GenerateSuccess } from '../../src/api/types/scheduling'
import { listSchema } from '../../src/api/types/common'
import { apiUrl } from '../system.ts'
import { getData, navigate, uiMutation } from './http.ts'

export const readActive = (page: Page) => getData(page, 'jadwal/aktif', activeScheduleSchema.nullable())
export const readHistoryDetail = (page: Page, id: number) => getData(page, `jadwal/riwayat/${id}`, historyDetailSchema)
export async function readHistory(page: Page) {
  const response = await page.request.get(`${apiUrl}/jadwal/riwayat?page=1&page_size=20&sort_by=created_at&sort_order=desc&status=all`)
  expect(response.status()).toBe(200)
  return listSchema(scheduleMetadataSchema).parse(await response.json())
}
export async function generateSat(page: Page, expectedCount: number) {
  await navigate(page, 'Constraint Studio', '/constraint-studio')
  const response = await uiMutation(page, 'POST', 'jadwal/generate', {}, () => page.getByRole('button', { name: 'Generate Schedule', exact: true }).click())
  const generated = generateSuccessSchema.parse((await response.json()).data)
  expect(generated.assignments).toHaveLength(expectedCount)
  expect(generated.summary).toEqual({ total_praktikum: expectedCount, total_assignment: expectedCount })
  expect(generated.solver_diagnostics.verification.overall).toBe('passed')
  expect(generated.solver_diagnostics.domain_candidates).toHaveLength(expectedCount)
  await expect(page.getByText('SAT', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Simpan Jadwal', exact: true })).toBeEnabled()
  const preview = page.getByRole('table', { name: 'Preview penempatan praktikum', exact: true })
  await expect(preview.getByRole('row')).toHaveCount(expectedCount + 1)
  for (const assignment of generated.assignments) await expect(preview.getByRole('cell', { name: `#${assignment.praktikum_id}`, exact: true })).toBeVisible()
  return generated
}
export async function savePreview(page: Page, preview: GenerateSuccess) {
  const before = await readHistory(page)
  const response = await uiMutation(page, 'POST', 'jadwal/simpan', { preview_id: preview.preview_id }, () => page.getByRole('button', { name: 'Simpan Jadwal', exact: true }).click(), 201)
  const saved = activeScheduleSchema.parse((await response.json()).data)
  expect(saved.assignments).toEqual(preview.assignments)
  await expect(page.getByRole('heading', { name: 'Jadwal berhasil disimpan', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Simpan Jadwal', exact: true })).toHaveCount(0)
  expect(await readActive(page)).toEqual(saved)
  expect((await readHistory(page)).meta.total_items).toBe(before.meta.total_items + 1)
  return saved
}
export async function openHistoryDetail(page: Page, id: number) {
  await navigate(page, 'Schedule History', '/schedule-history')
  await page.getByRole('button', { name: `Lihat versi #${id}`, exact: true }).click()
  await expect(page.getByRole('heading', { name: `Snapshot versi #${id}`, exact: true })).toBeVisible()
  return page.getByRole('region', { name: 'Panel detail riwayat', exact: true })
}
