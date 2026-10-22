import { test, expect } from './fixtures.ts'

test('cold loads and lazy navigation keep the shell usable without duplicate initial GETs', async ({ page }) => {
  const modules: string[] = []
  const gets: string[] = []
  const completed: string[] = []
  const cancelled: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/src/pages/')) modules.push(url.pathname)
    if (url.pathname.startsWith('/api/v1/') && request.method() === 'GET') gets.push(url.pathname + url.search)
  })
  page.on('requestfinished', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/v1/') && request.method() === 'GET') completed.push(url.pathname + url.search)
  })
  page.on('requestfailed', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/v1/') && request.method() === 'GET') {
      expect(request.failure()?.errorText).toBe('net::ERR_ABORTED')
      cancelled.push(url.pathname + url.search)
    }
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'System Health' }).getByText('healthy', { exact: true })).toBeVisible()
  await expect(page.getByText('Belum ada riwayat tersimpan.', { exact: true })).toBeVisible()
  expect(modules).toEqual(['/src/pages/OverviewPage.tsx'])
  await expect.poll(() => completed.length + cancelled.length).toBe(gets.length)
  expect(completed).toHaveLength(21)
  expect(new Set(gets).size).toBe(21)
  for (const url of new Set(gets)) expect(gets.filter((item) => item === url).length).toBeLessThanOrEqual(2)
  const main = await page.getByRole('main').elementHandle()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/src/pages/AvailabilityPage.tsx*', async (route) => { await gate; await route.continue() })
  try {
    await page.getByRole('navigation', { name: 'Navigasi utama desktop' }).getByRole('link', { name: 'Availability', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Memuat halaman' })).toBeVisible()
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navigasi utama desktop' })).toBeVisible()
    expect(await main!.evaluate((element) => element.isConnected)).toBe(true)
  } finally { release() }
  await expect(page.getByRole('heading', { level: 1, name: 'Resource Availability', exact: true })).toBeVisible()
  await expect(page.getByText('Belum ada kelompok aktif. Tambahkan atau aktifkan resource melalui Data Master.', { exact: true })).toBeVisible()
  expect(modules).toEqual(['/src/pages/OverviewPage.tsx', '/src/pages/AvailabilityPage.tsx'])
  await expect.poll(() => completed.length + cancelled.length).toBe(gets.length)
  expect(completed).toHaveLength(23) // Overview 21 + owner catalog + slots, no polling/retry.
  expect(new Set(gets).size).toBe(23)
  for (const url of new Set(gets)) expect(gets.filter((item) => item === url).length).toBeLessThanOrEqual(2)
  console.log(`[runtime] development StrictMode: ${gets.length} GET attempts; ${completed.length} completed; ${cancelled.length} cancelled; 23 unique query URLs`)
})

test('three independent cold document loads render without runtime errors', async ({ page }) => {
  // Runtime smoke, not a production speed benchmark: Vite development server and local APIs.
  for (const [path, title] of [['/constraint-studio', 'Constraint Studio'], ['/timetable', 'Timetable'], ['/schedule-history', 'Schedule History']] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navigasi utama desktop' }).getByRole('link', { name: title, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('main')).toBeVisible()
  }
})
