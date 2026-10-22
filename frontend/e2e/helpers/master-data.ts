import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import * as dto from '../../src/api/types/master'
import { navigate, uiMutation } from './http.ts'

const resources = {
  'mata-praktikum': { label: 'Mata Praktikum', schema: dto.mataPraktikumSchema },
  kelompok: { label: 'Kelompok', schema: dto.kelompokSchema },
  asisten: { label: 'Asisten', schema: dto.asistenSchema },
  laboratorium: { label: 'Laboratorium', schema: dto.laboratoriumSchema },
  'slot-waktu': { label: 'Slot Waktu', schema: dto.slotWaktuSchema },
  praktikum: { label: 'Praktikum', schema: dto.praktikumSchema },
} as const
const labels: Record<string, string> = { nama: 'Nama', jumlah_peserta: 'Jumlah peserta', kapasitas: 'Kapasitas', hari: 'Hari', jam_mulai: 'Jam mulai', jam_selesai: 'Jam selesai', mata_praktikum_id: 'Mata praktikum', kelompok_id: 'Kelompok', asisten_id: 'Asisten' }
type Fields = Record<string, string | number>

export async function openMaster(page: Page, resource: dto.MasterResource) {
  await navigate(page, 'Data Master', '/data-master')
  await page.getByRole('tab', { name: resources[resource].label, exact: true }).click()
}
async function fill(page: Page, fields: Fields) {
  const dialog = page.getByRole('dialog')
  for (const [field, value] of Object.entries(fields)) {
    const control = dialog.getByLabel(labels[field]!, { exact: true })
    if (field === 'hari' || field.endsWith('_id')) await control.selectOption(String(value))
    else await control.fill(String(value))
  }
}
export async function createMaster(page: Page, resource: dto.MasterResource, fields: Fields) {
  await openMaster(page, resource)
  await page.getByRole('button', { name: `Tambah ${resources[resource].label}`, exact: true }).click()
  await fill(page, fields)
  const response = await uiMutation(page, 'POST', resource, fields, () => page.getByRole('dialog').getByRole('button', { name: 'Simpan data', exact: true }).click(), 201)
  const record = resources[resource].schema.parse((await response.json()).data)
  expect(record).toMatchObject(fields)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const table = page.getByRole('table', { name: `Daftar ${resources[resource].label}`, exact: true })
  await expect(table.getByRole('cell', { name: `#${record.id}`, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ubah data', exact: true })).toBeEnabled()
  return record
}
async function selectRecord(page: Page, resource: dto.MasterResource, id: number) {
  await openMaster(page, resource)
  await page.getByRole('button', { name: `Lihat detail ${resources[resource].label} #${id}`, exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ubah data', exact: true })).toBeEnabled()
}
export async function updateMaster(page: Page, resource: dto.MasterResource, id: number, fields: Fields) {
  await selectRecord(page, resource, id)
  await page.getByRole('button', { name: 'Ubah data', exact: true }).click()
  await fill(page, fields)
  const response = await uiMutation(page, 'PATCH', `${resource}/${id}`, fields, () => page.getByRole('dialog').getByRole('button', { name: 'Simpan data', exact: true }).click())
  expect((await response.json()).data).toMatchObject(fields)
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
export async function toggleMaster(page: Page, resource: dto.MasterResource, id: number, active: boolean) {
  await openMaster(page, resource)
  await page.getByLabel('Status', { exact: true }).selectOption('all')
  await page.getByRole('button', { name: `Lihat detail ${resources[resource].label} #${id}`, exact: true }).click()
  await page.getByRole('button', { name: active ? 'Aktifkan' : 'Nonaktifkan', exact: true }).click()
  const response = await uiMutation(page, 'PATCH', `${resource}/${id}/status`, { is_active: active }, () => page.getByRole('dialog').getByRole('button', { name: active ? 'Ya, aktifkan' : 'Ya, nonaktifkan', exact: true }).click())
  expect((await response.json()).data.is_active).toBe(active)
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
