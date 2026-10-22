import { test, expect } from './fixtures.ts'
import { apiUrl } from './system.ts'
import { createDataset, allowDataset } from './helpers/dataset.ts'
import { generateSat, savePreview, readActive, readHistory } from './helpers/scheduling.ts'
import { navigate, startUIWrite } from './helpers/http.ts'
import { gate, releaseCaptured } from './helpers/faults.ts'
import { readPersistence } from './helpers/persistence.ts'

test('D07 REAL CAPTURED GET: old active response cannot overwrite newer version after navigation', async ({ page, context }) => {
  const dataset = await createDataset(page, 'D07 GET')
  await allowDataset(page, dataset)
  const first = await savePreview(page, await generateSat(page, 1))
  const captured = gate(), release = gate(), handled = gate()
  let intercepted = false
  await page.route(`${apiUrl}/jadwal/aktif`, async (route) => {
    if (intercepted) { await route.continue(); return }
    intercepted = true
    try {
      const response = await route.fetch({ maxRetries: 0 })
      expect((await response.json()).data.id).toBe(first.id)
      captured.resolve()
      await release.promise
      await releaseCaptured(route, response)
    } catch (error) { captured.reject(error); handled.reject(error) }
    finally { handled.resolve() }
  })
  try {
    await navigate(page, 'Timetable', '/timetable')
    await captured.promise
    const other = await context.newPage()
    let second
    try { second = await savePreview(other, await generateSat(other, 1)) } finally { await other.close() }
    await navigate(page, 'Schedule History', '/schedule-history')
    await navigate(page, 'Timetable', '/timetable')
    await expect(page.getByText(`#${second.id}`, { exact: true })).toBeVisible()
    release.resolve()
    await handled.promise
    await expect(page.getByText(`#${second.id}`, { exact: true })).toBeVisible()
    expect((await readActive(page))!.id).toBe(second.id)
  } finally { release.resolve() }
})

test('D07 REAL CAPTURED GENERATE: departed older result cannot replace new preview', async ({ page, isolatedSystem, audit }) => {
  const dataset = await createDataset(page, 'D07 generate')
  await allowDataset(page, dataset)
  await navigate(page, 'Constraint Studio', '/constraint-studio')
  const captured = gate(), release = gate(), handled = gate()
  let intercepted = false
  let oldId = ''
  await page.route(`${apiUrl}/jadwal/generate`, async (route) => {
    if (intercepted) { await route.continue(); return }
    intercepted = true
    try {
      const response = await route.fetch({ maxRetries: 0 })
      expect(response.status()).toBe(200)
      oldId = (await response.json()).data.preview_id
      captured.resolve()
      await release.promise
      await releaseCaptured(route, response)
    } catch (error) { captured.reject(error); handled.reject(error) }
    finally { handled.resolve() }
  })
  try {
    await startUIWrite(page, 'POST', 'jadwal/generate', {}, () => page.getByRole('button', { name: 'Generate Schedule', exact: true }).click())
    await captured.promise
    await navigate(page, 'Timetable', '/timetable')
    await navigate(page, 'Constraint Studio', '/constraint-studio')
    const newer = await generateSat(page, 1)
    expect(newer.preview_id).not.toBe(oldId)
    release.resolve()
    await handled.promise
    await expect(page.getByText(newer.preview_id, { exact: true })).toBeVisible()
    await expect(page.getByText(oldId, { exact: true })).toHaveCount(0)
    await savePreview(page, newer)
    const persisted = readPersistence(isolatedSystem)
    expect(persisted.previews.find((row) => row.id === oldId)!.status).toBe('ready')
    expect(persisted.previews.find((row) => row.id === newer.preview_id)!.status).toBe('consumed')
    expect(persisted.versions).toHaveLength(1)
    expect(audit.writes.filter(({ path }) => path === 'jadwal/generate')).toHaveLength(2)
    expect((await readHistory(page)).meta.total_items).toBe(1)
  } finally { release.resolve() }
})

test('D07 REAL UI: dirty availability survives rejected navigation, POP guard and clean reload', async ({ page, audit }) => {
  const dataset = await createDataset(page, 'D07 draft')
  await navigate(page, 'Availability', '/availability')
  await page.getByLabel('Pilih kelompok', { exact: true }).selectOption(String(dataset.activities[0]!.groupId))
  const checkbox = page.getByRole('checkbox', { name: `Senin 08:00–10:00 · ID #${dataset.slotId}`, exact: true })
  await checkbox.check()
  await page.getByRole('navigation', { name: 'Navigasi utama desktop' }).getByRole('link', { name: 'Timetable', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Tinggalkan halaman availability?' })).toBeVisible()
  await page.getByRole('button', { name: 'Tetap di halaman', exact: true }).click()
  await expect(checkbox).toBeChecked()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Tinggalkan halaman availability?' })).toBeVisible()
  await page.getByRole('button', { name: 'Buang dan tinggalkan', exact: true }).click()
  await expect(page).toHaveURL('http://localhost:5173/data-master')
  await page.goForward()
  await expect(page).toHaveURL('http://localhost:5173/availability')
  await page.getByLabel('Pilih kelompok', { exact: true }).selectOption(String(dataset.activities[0]!.groupId))
  await expect(checkbox).not.toBeChecked()
  await page.reload()
  await page.getByLabel('Pilih kelompok', { exact: true }).selectOption(String(dataset.activities[0]!.groupId))
  await expect(checkbox).not.toBeChecked()
  expect(audit.writes.filter(({ method }) => method === 'PUT')).toHaveLength(0)
})
