import { test, expect } from './fixtures.ts'
import { allowDataset, createDataset } from './helpers/dataset.ts'
import { toggleMaster, updateMaster } from './helpers/master-data.ts'
import { generateSat, openHistoryDetail, readActive, readHistory, readHistoryDetail, savePreview } from './helpers/scheduling.ts'
import { getData, navigate } from './helpers/http.ts'
import { readPersistence } from './helpers/persistence.ts'
import { asistenSchema } from '../src/api/types/master'

test.beforeEach(async ({ page, isolatedSystem }) => {
  // Per-test database is fresh; this assertion also catches leaked worker state.
  expect(await readActive(page)).toBeNull()
  expect((await readHistory(page)).meta.total_items).toBe(0)
  expect(readPersistence(isolatedSystem).revision).toBe(0)
})

test('C01: create/read all six masters, update/status and persisted availability through UI', async ({ page, audit }) => {
  const dataset = await createDataset(page, 'C01')
  const activity = dataset.activities[0]!
  await updateMaster(page, 'asisten', activity.assistantId, { nama: 'C01 Asisten Edited' })
  expect((await getData(page, `asisten/${activity.assistantId}`, asistenSchema)).nama).toBe('C01 Asisten Edited')
  await toggleMaster(page, 'laboratorium', dataset.labs[0]!.id, false)
  await toggleMaster(page, 'laboratorium', dataset.labs[0]!.id, true)
  await allowDataset(page, dataset)
  expect(audit.writes.filter((write) => write.method === 'POST')).toHaveLength(6)
  expect(audit.writes.filter((write) => write.method === 'PATCH')).toHaveLength(3)
  expect(audit.writes.filter((write) => write.method === 'PUT')).toHaveLength(2)
  expect(await readActive(page)).toBeNull()
  expect((await readHistory(page)).meta.total_items).toBe(0)
})

test('C02: real SAT preview, explicit save, persisted timetable/history and overview', async ({ page, isolatedSystem, audit }) => {
  const dataset = await createDataset(page, 'C02')
  await allowDataset(page, dataset)
  const preview = await generateSat(page, 1)
  expect(preview.assignments[0]).toMatchObject({ praktikum_id: dataset.activities[0]!.id, slot_waktu: { id: dataset.slotId }, laboratorium: { id: dataset.labs[0]!.id } })
  expect(await readActive(page)).toBeNull()
  expect((await readHistory(page)).meta.total_items).toBe(0)
  const before = readPersistence(isolatedSystem)
  expect(before.previews).toHaveLength(1)
  expect(before.previews[0]!.status).toBe('ready')
  expect(Object.keys(before.previews[0]!.hasil_json).sort()).toEqual(['assignments', 'schema_version', 'source_revision', 'status'])
  expect(before.previews[0]!.hasil_json).toMatchObject({ schema_version: 1, status: 'success', source_revision: preview.source_revision })
  expect(before.previews[0]!.snapshot_json).not.toHaveProperty('solver_diagnostics')
  expect(before.previews[0]!.snapshot_json).not.toHaveProperty('domain_candidates')
  expect(before.versions).toEqual([])
  const saved = await savePreview(page, preview)
  const after = readPersistence(isolatedSystem)
  expect(after.previews[0]!.status).toBe('consumed')
  expect(after.previews[0]!.hasil_json).toEqual(before.previews[0]!.hasil_json)
  expect(after.versions).toHaveLength(1)
  expect(after.details).toBe(1)
  expect(audit.writes.filter((write) => write.path === 'jadwal/simpan')).toHaveLength(1)
  await navigate(page, 'Timetable', '/timetable')
  await expect(page.getByRole('article', { name: `Praktikum #${dataset.activities[0]!.id}`, exact: true })).toBeVisible()
  expect((await readActive(page))!.assignments).toEqual(preview.assignments)
  const detailPanel = await openHistoryDetail(page, saved.id)
  await expect(detailPanel.getByRole('table', { name: 'Tabel penempatan jadwal' }).getByRole('row')).toHaveCount(2)
  expect((await readHistoryDetail(page, saved.id)).assignments).toEqual(preview.assignments)
  await navigate(page, 'Overview', '/')
  await expect(page.getByRole('button', { name: 'Refresh dashboard', exact: true })).toBeEnabled()
  await expect(page.getByRole('region', { name: 'Jadwal aktif' }).getByText(`Versi #${saved.id}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ringkasan riwayat' })).toContainText('Total versi tersimpan: 1')
  for (const label of ['Mata Praktikum', 'Kelompok', 'Asisten', 'Laboratorium', 'Slot Waktu', 'Praktikum']) await expect(page.getByRole('group', { name: `${label} Total`, exact: true }).getByText('1', { exact: true })).toBeVisible()
})

test('C03: two real simultaneous assignments survive grid/table/filter/reload unchanged', async ({ page }) => {
  const dataset = await createDataset(page, 'C03', true)
  await allowDataset(page, dataset)
  const preview = await generateSat(page, 2)
  expect(preview.assignments.map((assignment) => assignment.praktikum_id).sort((a, b) => a - b)).toEqual(dataset.activities.map((activity) => activity.id).sort((a, b) => a - b))
  expect(new Set(preview.assignments.map((assignment) => assignment.slot_waktu.id))).toEqual(new Set([dataset.slotId]))
  expect(new Set(preview.assignments.map((assignment) => assignment.laboratorium.id)).size).toBe(2)
  for (const assignment of preview.assignments) {
    const activity = dataset.activities.find((item) => item.id === assignment.praktikum_id)!
    expect(assignment.kelompok.id).toBe(activity.groupId)
    expect(assignment.asisten.id).toBe(activity.assistantId)
    expect(assignment.mata_praktikum.id).toBe(activity.subjectId)
    expect(dataset.labs.map((lab) => lab.id)).toContain(assignment.laboratorium.id)
    expect(assignment.laboratorium.kapasitas).toBeGreaterThanOrEqual(assignment.kelompok.jumlah_peserta)
  }
  const saved = await savePreview(page, preview)
  await navigate(page, 'Timetable', '/timetable')
  const grid = page.getByRole('region', { name: 'Grid jadwal mingguan' })
  await expect(grid.getByRole('article')).toHaveCount(2)
  await page.getByRole('button', { name: 'Tabel', exact: true }).click()
  const table = page.getByRole('table', { name: 'Tabel penempatan jadwal' })
  await expect(table.getByRole('row')).toHaveCount(3)
  const selected = preview.assignments[0]!
  await page.getByLabel('Laboratorium', { exact: true }).selectOption(String(selected.laboratorium.id))
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table.getByRole('cell', { name: `#${selected.praktikum_id}`, exact: true })).toBeVisible()
  expect(await readActive(page)).toEqual(saved)
  await page.getByRole('button', { name: 'Reset filter', exact: true }).click()
  await expect(table.getByRole('row')).toHaveCount(3)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Grid jadwal mingguan' }).getByRole('article')).toHaveCount(2)
  expect(await readActive(page)).toEqual(saved)
  expect((await readHistoryDetail(page, saved.id)).assignments).toEqual(saved.assignments)
})

test('C04: used-capacity invalidation, repair, v1 invalid / v2 archived / v3 active', async ({ page, isolatedSystem, audit }) => {
  const dataset = await createDataset(page, 'C04')
  await allowDataset(page, dataset)
  const v1 = await savePreview(page, await generateSat(page, 1))
  const original = await readHistoryDetail(page, v1.id)
  // Actual mutation rule: 31 participants exceed the USED lab's capacity of 30.
  await updateMaster(page, 'kelompok', dataset.activities[0]!.groupId, { jumlah_peserta: 31 })
  expect(await readActive(page)).toBeNull()
  expect((await readHistoryDetail(page, v1.id)).status).toBe('invalid')
  await navigate(page, 'Timetable', '/timetable')
  await expect(page.getByRole('heading', { name: 'Belum ada jadwal aktif', exact: true })).toBeVisible()
  let panel = await openHistoryDetail(page, v1.id)
  await expect(panel.getByText('invalid', { exact: true })).toBeVisible()
  await updateMaster(page, 'kelompok', dataset.activities[0]!.groupId, { jumlah_peserta: 20 })
  expect(await readActive(page)).toBeNull() // Repair never restores an invalid version.
  const v2 = await savePreview(page, await generateSat(page, 1))
  const v3 = await savePreview(page, await generateSat(page, 1))
  expect(new Set([v1.id, v2.id, v3.id]).size).toBe(3)
  const history = await readHistory(page)
  expect(history.meta.total_items).toBe(3)
  expect(Object.fromEntries(history.data.map((version) => [version.id, version.status]))).toEqual({ [v1.id]: 'invalid', [v2.id]: 'archived', [v3.id]: 'active' })
  expect((await readActive(page))!.id).toBe(v3.id)
  for (const [id, status] of [[v1.id, 'invalid'], [v2.id, 'archived'], [v3.id, 'active']] as const) {
    panel = await openHistoryDetail(page, id)
    await expect(panel.getByText(status, { exact: true })).toBeVisible()
  }
  const old = await readHistoryDetail(page, v1.id)
  expect(old.assignments).toEqual(original.assignments)
  expect(old.snapshot).toEqual(original.snapshot)
  const persisted = readPersistence(isolatedSystem)
  expect(persisted.versions.map(({ status }) => status)).toEqual(['invalid', 'archived', 'active'])
  expect(persisted.previews.map(({ status }) => status)).toEqual(['consumed', 'consumed', 'consumed'])
  expect(persisted.details).toBe(3)
  expect(audit.writes.filter((write) => write.path === 'jadwal/simpan')).toHaveLength(3)
})

test('C05: label edit changes live master/revision but not old snapshot or active validity', async ({ page, isolatedSystem }) => {
  const dataset = await createDataset(page, 'C05')
  await allowDataset(page, dataset)
  const saved = await savePreview(page, await generateSat(page, 1))
  const original = await readHistoryDetail(page, saved.id)
  const before = readPersistence(isolatedSystem)
  const activity = dataset.activities[0]!
  const replacement = 'C05 Mata Renamed'
  await updateMaster(page, 'mata-praktikum', activity.subjectId, { nama: replacement })
  await expect(page.getByRole('table', { name: 'Daftar Mata Praktikum', exact: true }).getByRole('cell', { name: replacement, exact: true })).toBeVisible()
  const panel = await openHistoryDetail(page, saved.id)
  await expect(panel.getByText('active', { exact: true })).toBeVisible()
  await expect(panel.getByRole('table').getByRole('cell', { name: `${activity.subjectName} · #${activity.subjectId}`, exact: true })).toBeVisible()
  await expect(panel.getByText(replacement, { exact: false })).toHaveCount(0)
  const after = await readHistoryDetail(page, saved.id)
  expect(after.status).toBe('active')
  expect(after.assignments).toEqual(original.assignments)
  expect(after.snapshot).toEqual(original.snapshot)
  expect(await readActive(page)).toEqual(saved)
  const persisted = readPersistence(isolatedSystem)
  expect(persisted.revision).toBe(before.revision + 1)
  expect(persisted.versions[0]!.snapshot_json).toEqual(before.versions[0]!.snapshot_json)
})
