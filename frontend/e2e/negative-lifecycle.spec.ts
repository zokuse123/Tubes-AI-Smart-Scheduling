import { test, expect } from './fixtures.ts'
import { apiUrl } from './system.ts'
import { createDataset, allowDataset } from './helpers/dataset.ts'
import { createMaster, updateMaster } from './helpers/master-data.ts'
import { allowSlot } from './helpers/availability.ts'
import { expectNetworkFailure, navigate, uiMutation } from './helpers/http.ts'
import { generateSat, savePreview, readActive, readHistory } from './helpers/scheduling.ts'
import { readPersistence } from './helpers/persistence.ts'
import { generateUnsatisfiableSchema } from '../src/api/types/scheduling'

test('D01 REAL: valid group-conflict dataset is UNSAT with domains, no preview or version', async ({ page, isolatedSystem }) => {
  const dataset = await createDataset(page, 'D01')
  await allowDataset(page, dataset)
  const assistant = await createMaster(page, 'asisten', { nama: 'D01 second assistant' })
  await createMaster(page, 'laboratorium', { nama: 'D01 second lab', kapasitas: 30 })
  await createMaster(page, 'praktikum', { mata_praktikum_id: dataset.activities[0]!.subjectId, kelompok_id: dataset.activities[0]!.groupId, asisten_id: assistant.id })
  await allowSlot(page, 'asisten', assistant.id, dataset.slotId)
  await navigate(page, 'Constraint Studio', '/constraint-studio')
  const response = await uiMutation(page, 'POST', 'jadwal/generate', {}, () => page.getByRole('button', { name: 'Generate Schedule', exact: true }).click())
  const result = generateUnsatisfiableSchema.parse((await response.json()).data)
  expect(result).not.toHaveProperty('preview_id')
  expect(result.assignments).toEqual([])
  expect(result.solver_diagnostics.domain_candidates).toHaveLength(2)
  for (const candidate of result.solver_diagnostics.domain_candidates) expect(candidate).toMatchObject({ slot_count: 1, laboratory_count: 2, theoretical_pairs: 2 })
  expect(result.solver_diagnostics.verification.overall).toBe('not_applicable')
  await expect(page.getByText('UNSAT', { exact: true })).toBeVisible()
  await expect(page.getByText('not_applicable', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Simpan Jadwal', exact: true })).toHaveCount(0)
  await expect(page.getByRole('table', { name: 'Domain kandidat awal' }).getByRole('row')).toHaveCount(3)
  await page.getByText('Aturan sistem C01–C09', { exact: true }).click()
  await expect(page.getByText('Definisi aturan, bukan laporan PASS/FAIL individual untuk run ini.', { exact: true })).toBeVisible()
  const definitions = page.locator('details').getByRole('listitem')
  await expect(definitions).toHaveCount(9)
  await expect(definitions.filter({ hasText: /\b(?:PASS|FAIL)\b/ })).toHaveCount(0)
  expect(await readActive(page)).toBeNull()
  expect((await readHistory(page)).meta.total_items).toBe(0)
  expect(readPersistence(isolatedSystem)).toMatchObject({ previews: [], versions: [], details: 0 })
})

test('D02 REAL: label revision stales preview without invalidating the saved active version', async ({ page, context, isolatedSystem }) => {
  const dataset = await createDataset(page, 'D02')
  await allowDataset(page, dataset)
  const saved = await savePreview(page, await generateSat(page, 1))
  const preview = await generateSat(page, 1)
  const other = await context.newPage()
  try { await updateMaster(other, 'mata-praktikum', dataset.activities[0]!.subjectId, { nama: 'D02 Renamed' }) }
  finally { await other.close() }
  expect(readPersistence(isolatedSystem).revision).toBe(preview.source_revision + 1)
  expect((await readActive(page))!.id).toBe(saved.id)
  expectNetworkFailure(page, 'jadwal/simpan')
  const response = await uiMutation(page, 'POST', 'jadwal/simpan', { preview_id: preview.preview_id }, () => page.getByRole('button', { name: 'Simpan Jadwal', exact: true }).click(), 409)
  expect((await response.json()).error.code).toBe('STALE_PREVIEW')
  await expect(page.getByText('STALE_PREVIEW', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Simpan Jadwal', exact: true })).toHaveCount(0)
  expect(readPersistence(isolatedSystem).previews.find((row) => row.id === preview.preview_id)!.status).toBe('stale')
  const replay = await page.request.post(`${apiUrl}/jadwal/simpan`, { data: { preview_id: preview.preview_id } })
  expect(replay.status()).toBe(409)
  expect((await replay.json()).error.code).toBe('STALE_PREVIEW')
  expect((await readHistory(page)).meta.total_items).toBe(1)
  await savePreview(page, await generateSat(page, 1)) // Explicit recovery with new revision.
  expect((await readHistory(page)).meta.total_items).toBe(2)
})

test('D03 REAL: UI saves once; controlled HTTP replay is consumed, without duplicate persistence', async ({ page, isolatedSystem, audit }) => {
  const dataset = await createDataset(page, 'D03')
  await allowDataset(page, dataset)
  const preview = await generateSat(page, 1)
  const saved = await savePreview(page, preview)
  const before = readPersistence(isolatedSystem)
  const response = await page.request.post(`${apiUrl}/jadwal/simpan`, { data: { preview_id: preview.preview_id } })
  expect(response.status()).toBe(409)
  expect((await response.json()).error.code).toBe('PREVIEW_CONSUMED')
  expect(readPersistence(isolatedSystem)).toEqual(before)
  expect(await readActive(page)).toEqual(saved)
  expect((await readHistory(page)).meta.total_items).toBe(1)
  expect(audit.writes.filter(({ path }) => path === 'jadwal/simpan')).toHaveLength(1)
})

test('D08 REAL HTTP: concurrent same-preview saves consume atomically exactly once', async ({ page, isolatedSystem }) => {
  const dataset = await createDataset(page, 'D08')
  await allowDataset(page, dataset)
  const preview = await generateSat(page, 1)
  // Controlled HTTP concurrency, not UI double-click or random sleep.
  const responses = await Promise.all([0, 1].map(() => page.request.post(`${apiUrl}/jadwal/simpan`, { data: { preview_id: preview.preview_id } })))
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 409])
  const rejected = responses.find((response) => response.status() === 409)!
  expect((await rejected.json()).error.code).toBe('PREVIEW_CONSUMED')
  const persisted = readPersistence(isolatedSystem)
  expect(persisted.versions).toHaveLength(1)
  expect(persisted.details).toBe(1)
  expect(persisted.previews[0]!.status).toBe('consumed')
  expect((await readHistory(page)).meta.total_items).toBe(1)
  expect((await readActive(page))!.id).toBe(persisted.versions[0]!.id)
})
