import { randomUUID } from 'node:crypto'
import { test, expect } from './fixtures.ts'
import { apiUrl } from './system.ts'
import { createDataset, allowDataset } from './helpers/dataset.ts'
import { generateSat, savePreview, readActive, readHistory } from './helpers/scheduling.ts'
import { expectNetworkFailure, navigate, startUIWrite, uiMutation } from './helpers/http.ts'
import { abortUIWrite, faultHeaders, gate } from './helpers/faults.ts'
import { readPersistence } from './helpers/persistence.ts'

for (const code of ['PREVIEW_EXPIRED', 'PREVIEW_NOT_FOUND']) {
  test(`D04 CONTROLLED UI: ${code} discards preview without backend writes`, async ({ page, isolatedSystem, audit }) => {
    const dataset = await createDataset(page, code)
    await allowDataset(page, dataset)
    const preview = await generateSat(page, 1)
    if (code === 'PREVIEW_NOT_FOUND') {
      const real = await page.request.post(`${apiUrl}/jadwal/simpan`, { data: { preview_id: randomUUID() } })
      expect(real.status()).toBe(404)
      expect((await real.json()).error.code).toBe(code)
    }
    expectNetworkFailure(page, 'jadwal/simpan')
    await page.route(`${apiUrl}/jadwal/simpan`, (route) => route.fulfill({ status: code === 'PREVIEW_EXPIRED' ? 409 : 404, headers: faultHeaders, body: JSON.stringify({ error: { code, message: 'Preview tidak dapat digunakan.', details: null } }) }))
    await uiMutation(page, 'POST', 'jadwal/simpan', { preview_id: preview.preview_id }, () => page.getByRole('button', { name: 'Simpan Jadwal', exact: true }).click(), code === 'PREVIEW_EXPIRED' ? 409 : 404)
    await expect(page.getByText(code, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Simpan Jadwal', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Generate Schedule', exact: true })).toBeEnabled()
    const persisted = readPersistence(isolatedSystem)
    expect(persisted.versions).toEqual([])
    expect(persisted.previews[0]!.status).toBe('ready') // UI fault did NOT expire/delete backend preview.
    expect(audit.writes.filter(({ path }) => path === 'jadwal/simpan')).toHaveLength(1)
  })
}

test('D04 BROWSER CLOCK ONLY: local expiry blocks UI save, without claiming backend expiry', async ({ page, isolatedSystem }) => {
  await page.clock.install({ time: new Date() })
  const dataset = await createDataset(page, 'D04 clock')
  await allowDataset(page, dataset)
  await generateSat(page, 1)
  await page.clock.fastForward(31 * 60 * 1000)
  await expect(page.getByRole('button', { name: 'Simpan Jadwal', exact: true })).toBeDisabled()
  await expect(page.getByText(/Preview melewati expires_at menurut jam perangkat/)).toBeVisible()
  expect(readPersistence(isolatedSystem)).toMatchObject({ versions: [], details: 0 })
  expect(readPersistence(isolatedSystem).previews[0]!.status).toBe('ready')
})

test('D05 CONTROLLED GET failure is unknown, never an empty active schedule', async ({ page }) => {
  expectNetworkFailure(page, 'jadwal/aktif')
  await page.route(`${apiUrl}/jadwal/aktif`, (route) => route.abort('failed'))
  await page.goto('/timetable')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText(/Keberadaan jadwal aktif belum dapat dipastikan/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Belum ada jadwal aktif', exact: true })).toHaveCount(0)
  await page.unroute(`${apiUrl}/jadwal/aktif`)
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Belum ada jadwal aktif', exact: true })).toBeVisible()
})

test('D05 CONTROLLED generate abort never reaches solver, never becomes UNSAT or retries', async ({ page, isolatedSystem, audit }) => {
  await page.goto('/constraint-studio')
  await abortUIWrite(page, 'jadwal/generate', {}, 'Generate Schedule')
  await expect(page.getByRole('heading', { name: 'Generate gagal', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate Schedule', exact: true })).toBeEnabled()
  await expect(page.getByText('UNSAT', { exact: true })).toHaveCount(0)
  expect(readPersistence(isolatedSystem)).toMatchObject({ revision: 0, previews: [], versions: [], details: 0 })
  expect(audit.writes.filter(({ path }) => path === 'jadwal/generate')).toHaveLength(1)
})

test('D05 CONTROLLED save aborted before forwarding preserves ready backend preview, no version', async ({ page, isolatedSystem, audit }) => {
  const dataset = await createDataset(page, 'D05 save')
  await allowDataset(page, dataset)
  const preview = await generateSat(page, 1)
  await abortUIWrite(page, 'jadwal/simpan', { preview_id: preview.preview_id }, 'Simpan Jadwal')
  await expect(page.getByText(/Status simpan belum dapat dipastikan/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Simpan Jadwal', exact: true })).toHaveCount(0)
  expect(readPersistence(isolatedSystem)).toMatchObject({ versions: [], details: 0 })
  expect(readPersistence(isolatedSystem).previews[0]!.status).toBe('ready')
  expect(audit.writes.filter(({ path }) => path === 'jadwal/simpan')).toHaveLength(1)
})

for (const mode of ['malformed-json', 'invalid-dto']) {
  test(`D05 CONTROLLED ${mode} generate output cannot become SAT or persist`, async ({ page, isolatedSystem, audit }) => {
    await page.route(`${apiUrl}/jadwal/generate`, (route) => route.fulfill({ status: 200, headers: faultHeaders, body: mode === 'malformed-json' ? '{"internal_path":"C:/private/solver",' : JSON.stringify({ data: { status: 'success', internal_path: 'C:/private/solver' } }) }))
    await page.goto('/constraint-studio')
    await uiMutation(page, 'POST', 'jadwal/generate', {}, () => page.getByRole('button', { name: 'Generate Schedule', exact: true }).click())
    await expect(page.getByRole('heading', { name: 'Generate gagal', exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByText('SAT', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Simpan Jadwal', exact: true })).toHaveCount(0)
    await expect(page.getByText(/C:\/private\/solver/)).toHaveCount(0)
    expect(readPersistence(isolatedSystem)).toMatchObject({ previews: [], versions: [] })
    expect(audit.writes).toHaveLength(1)
  })
}

test('D05 CONTROLLED degraded 503 is valid; failed refresh marks cached active/health unconfirmed', async ({ page }) => {
  const dataset = await createDataset(page, 'D05 cache')
  await allowDataset(page, dataset)
  const saved = await savePreview(page, await generateSat(page, 1))
  await navigate(page, 'Overview', '/')
  await expect(page.getByRole('button', { name: 'Refresh dashboard', exact: true })).toBeEnabled()
  const health = (await (await page.request.get(`${apiUrl}/health`)).json()).data
  expectNetworkFailure(page, 'health')
  await page.route(`${apiUrl}/health`, (route) => route.fulfill({ status: 503, headers: faultHeaders, body: JSON.stringify({ data: { ...health, status: 'degraded', components: { ...health.components, solver: 'unavailable' } } }) }))
  await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click()
  const card = page.getByRole('region', { name: 'System Health' })
  await expect(card.getByText('degraded', { exact: true })).toBeVisible()
  await expect(card.getByRole('alert')).toHaveCount(0)
  await page.unroute(`${apiUrl}/health`)
  expectNetworkFailure(page, 'jadwal/aktif')
  await page.route(`${apiUrl}/health`, (route) => route.abort('failed'))
  await page.route(`${apiUrl}/jadwal/aktif`, (route) => route.abort('failed'))
  await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click()
  await expect(card.getByText(/Data terakhir — kondisi terkini belum terkonfirmasi/)).toBeVisible()
  const active = page.getByRole('region', { name: 'Jadwal aktif', exact: true })
  await expect(active.getByText('active (status terakhir)', { exact: true })).toBeVisible()
  await expect(active.getByText(`Versi #${saved.id}`, { exact: true })).toBeVisible()
  await expect(active.getByRole('alert')).toBeVisible()
})

test('D05 CONTROLLED history detail 404 preserves list without inventing replacement detail', async ({ page }) => {
  const dataset = await createDataset(page, 'D05 history')
  await allowDataset(page, dataset)
  const saved = await savePreview(page, await generateSat(page, 1))
  expectNetworkFailure(page, `jadwal/riwayat/${saved.id}`)
  await page.route(`${apiUrl}/jadwal/riwayat/${saved.id}`, (route) => route.fulfill({ status: 404, headers: faultHeaders, body: JSON.stringify({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Versi tidak ditemukan.', details: null } }) }))
  await navigate(page, 'Schedule History', '/schedule-history')
  await page.getByRole('button', { name: `Lihat versi #${saved.id}`, exact: true }).click()
  await expect(page.getByText('RESOURCE_NOT_FOUND', { exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Daftar versi jadwal' })).toBeVisible()
  await expect(page.getByRole('heading', { name: `Snapshot versi #${saved.id}`, exact: true })).toHaveCount(0)
  expect((await readHistory(page)).meta.total_items).toBe(1)
})

for (const drop of [true, false]) {
  test(`${drop ? 'D06 UNCERTAIN' : 'D07 DELAYED'} save: prove real commit before releasing response`, async ({ page, isolatedSystem, audit }) => {
    const dataset = await createDataset(page, drop ? 'D06' : 'D07 save')
    await allowDataset(page, dataset)
    const preview = await generateSat(page, 1)
    const committed = gate(), release = gate(), handled = gate()
    if (drop) expectNetworkFailure(page, 'jadwal/simpan')
    await page.route(`${apiUrl}/jadwal/simpan`, async (route) => {
      try {
        const response = await route.fetch({ maxRetries: 0 }) // Actual Flask request, no replay.
        expect(response.status()).toBe(201)
        const persisted = readPersistence(isolatedSystem)
        expect(persisted.versions).toHaveLength(1)
        expect(persisted.details).toBe(1)
        expect(persisted.previews.find((row) => row.id === preview.preview_id)!.status).toBe('consumed')
        expect((await readActive(page))!.id).toBe((await response.json()).data.id)
        committed.resolve()
        await release.promise
        if (drop) await route.abort('failed')
        else await route.fulfill({ response })
      } catch (error) { committed.reject(error); handled.reject(error) }
      finally { handled.resolve() }
    })
    try {
      await startUIWrite(page, 'POST', 'jadwal/simpan', { preview_id: preview.preview_id }, () => page.getByRole('button', { name: 'Simpan Jadwal', exact: true }).click())
      await committed.promise
      await expect(page.getByRole('button', { name: 'Menyimpan jadwal…', exact: true })).toBeDisabled()
      await expect(page.getByRole('heading', { name: 'Jadwal berhasil disimpan', exact: true })).toHaveCount(0)
    } finally { release.resolve() }
    await handled.promise
    if (drop) await expect(page.getByText(/Status simpan belum dapat dipastikan/)).toBeVisible()
    else await expect(page.getByRole('heading', { name: 'Jadwal berhasil disimpan', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Simpan Jadwal', exact: true })).toHaveCount(0)
    await navigate(page, 'Timetable', '/timetable')
    await expect(page.getByRole('article', { name: `Praktikum #${dataset.activities[0]!.id}`, exact: true })).toBeVisible()
    await navigate(page, 'Schedule History', '/schedule-history')
    await expect(page.getByRole('table', { name: 'Daftar versi jadwal' }).getByRole('row')).toHaveCount(2)
    expect((await readHistory(page)).meta.total_items).toBe(1)
    expect(readPersistence(isolatedSystem).versions).toHaveLength(1)
    expect(audit.writes.filter(({ path }) => path === 'jadwal/simpan')).toHaveLength(1)
  })
}

test('D05 CONTROLLED availability PUT abort retains the dirty draft and permits explicit recovery', async ({ page, audit }) => {
  const dataset = await createDataset(page, 'D05 draft')
  const owner = dataset.activities[0]!.groupId
  const path = `kelompok/${owner}/ketersediaan`
  await navigate(page, 'Availability', '/availability')
  await page.getByLabel('Pilih kelompok', { exact: true }).selectOption(String(owner))
  const checkbox = page.getByRole('checkbox', { name: `Senin 08:00–10:00 · ID #${dataset.slotId}`, exact: true })
  await checkbox.check()
  expectNetworkFailure(page, path)
  await page.route(`${apiUrl}/${path}`, (route) => route.abort('failed'))
  const failed = page.waitForEvent('requestfailed', (request) => request.url() === `${apiUrl}/${path}`)
  await startUIWrite(page, 'PUT', path, { slot_ids: [dataset.slotId] }, () => page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click())
  await failed
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(checkbox).toBeChecked()
  await expect(page.getByRole('button', { name: 'Simpan perubahan', exact: true })).toBeEnabled()
  expect((await (await page.request.get(`${apiUrl}/${path}`)).json()).data.slot_ids).toEqual([])
  expect(audit.writes.filter(({ method }) => method === 'PUT')).toHaveLength(1)
  await page.unroute(`${apiUrl}/${path}`)
  await uiMutation(page, 'PUT', path, { slot_ids: [dataset.slotId] }, () => page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click())
  await expect(page.getByText('Ketersediaan berhasil disimpan.', { exact: true })).toBeVisible()
  expect((await (await page.request.get(`${apiUrl}/${path}`)).json()).data.slot_ids).toEqual([dataset.slotId])
})
