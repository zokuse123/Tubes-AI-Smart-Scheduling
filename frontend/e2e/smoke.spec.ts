import { test, expect } from './fixtures.ts'
import { apiUrl } from './system.ts'

test('real Chromium infrastructure smoke: empty fixture, health, CORS and all six routes', async ({ page, isolatedSystem }) => {
  expect(isolatedSystem.database).toContain('smart-lab-e2e-')
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const mutations: string[] = []
  const unexpectedApis: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      if (!request.url().startsWith(`${apiUrl}/`)) unexpectedApis.push(request.url())
      if (!['GET', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${request.url()}`)
    }
  })
  const healthResponse = page.waitForResponse((response) => response.url() === `${apiUrl}/health` && response.request().method() === 'GET')
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Navigasi utama desktop' })
  await expect(navigation.getByRole('link')).toHaveCount(6)
  const health = await healthResponse
  expect(health.status()).toBe(200)
  expect(await health.headerValue('access-control-allow-origin')).toBe('http://localhost:5173')
  const actualHealth = await health.json()
  expect(actualHealth.data.status).toBe('healthy')
  expect(actualHealth.data.components).toEqual({ backend: 'available', database: 'available', solver: 'available' })
  const healthCard = page.getByRole('region', { name: 'System Health' })
  await expect(healthCard.getByText('healthy', { exact: true })).toBeVisible()
  await expect(healthCard.getByText('available', { exact: true })).toHaveCount(3)
  await expect(healthCard.locator('time')).toHaveAttribute('datetime', actualHealth.data.checked_at)
  await expect(page.getByRole('button', { name: 'Refresh dashboard', exact: true })).toBeEnabled()
  for (const label of ['Mata Praktikum', 'Kelompok', 'Asisten', 'Laboratorium', 'Slot Waktu', 'Praktikum']) {
    for (const status of ['Total', 'Aktif', 'Nonaktif']) await expect(page.getByRole('group', { name: `${label} ${status}`, exact: true }).getByText('0', { exact: true })).toBeVisible()
  }
  await expect(page.getByText('Belum ada jadwal aktif.', { exact: false })).toBeVisible()
  await expect(page.getByText('Belum ada riwayat tersimpan.', { exact: true })).toBeVisible()
  const routes = [
    ['Data Master', 'Data Master', '/data-master', 'Tidak ada data sesuai filter.'],
    ['Availability', 'Resource Availability', '/availability', 'Belum ada kelompok aktif. Tambahkan atau aktifkan resource melalui Data Master.'],
    ['Constraint Studio', 'Constraint Studio', '/constraint-studio', 'Belum ada hasil generate'],
    ['Timetable', 'Timetable', '/timetable', 'Belum ada jadwal aktif'],
    ['Schedule History', 'Schedule History', '/schedule-history', 'Belum ada versi jadwal tersimpan. Generate dan simpan melalui Constraint Studio.'],
    ['Overview', 'Overview', '/', 'Belum ada riwayat tersimpan.'],
  ] as const
  for (const [link, title, path, empty] of routes) {
    await navigation.getByRole('link', { name: link, exact: true }).click()
    await expect(page).toHaveURL(`http://localhost:5173${path}`)
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
    await expect(navigation.getByRole('link', { name: link, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText(empty, { exact: true })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Refresh dashboard', exact: true })).toBeEnabled()
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
  expect(mutations).toEqual([])
  expect(unexpectedApis).toEqual([])
})
