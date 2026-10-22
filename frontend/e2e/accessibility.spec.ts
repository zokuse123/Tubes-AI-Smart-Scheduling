/// <reference lib="dom" />
import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures.ts'
import { createDataset, allowDataset } from './helpers/dataset.ts'
import { generateSat, savePreview } from './helpers/scheduling.ts'
import { uiMutation } from './helpers/http.ts'

const routes = [
  ['Overview', 'Overview', '/'], ['Data Master', 'Data Master', '/data-master'],
  ['Availability', 'Resource Availability', '/availability'], ['Constraint Studio', 'Constraint Studio', '/constraint-studio'],
  ['Timetable', 'Timetable', '/timetable'], ['Schedule History', 'Schedule History', '/schedule-history'],
] as const

// Use only Tab to reach the target; a bounded loop also detects inaccessible/trapped controls.
async function tabTo(page: Page, target: Locator) {
  for (let count = 0; count < 100; count++) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}
async function keyboardActivate(page: Page, target: Locator) {
  await tabTo(page, target)
  await page.keyboard.press('Enter')
}
async function go(page: Page, link: string, title: string, path: string, mobile: boolean) {
  if (mobile) {
    const trigger = page.getByRole('button', { name: 'Buka navigasi', exact: true })
    await keyboardActivate(page, trigger)
    await expect(page.getByRole('dialog', { name: 'Navigasi aplikasi' })).toBeVisible()
  }
  const nav = page.getByRole('navigation', { name: mobile ? 'Navigasi utama mobile' : 'Navigasi utama desktop', exact: true })
  await keyboardActivate(page, nav.getByRole('link', { name: link, exact: true }))
  await expect(page).toHaveURL(`http://localhost:5173${path}`)
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
  if (mobile) {
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Buka navigasi', exact: true })).toBeFocused()
  }
}
async function noOverflow(page: Page) {
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }))
  if (width.document > width.viewport + 1) console.log('Overflow elements', await page.locator('main *').evaluateAll((elements) => elements.filter((element) => element.getBoundingClientRect().right > innerWidth).slice(0, 12).map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width }))))
  expect(width.document, 'unintended document-level horizontal overflow').toBeLessThanOrEqual(width.viewport + 1)
}

for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`responsive six routes and populated schedule at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    // Real UI setup at desktop; switch to the audited viewport after persisting real CSP output.
    const dataset = await createDataset(page, 'Nama panjang laboratorium dan praktikum untuk audit responsif')
    await allowDataset(page, dataset)
    const saved = await savePreview(page, await generateSat(page, 1))
    await page.setViewportSize(viewport)
    for (const [link, title, path] of routes) {
      await go(page, link, title, path, viewport.width < 1024)
      await expect(page.getByRole('main')).toBeVisible()
      await noOverflow(page)
      if (path === '/data-master') {
        await page.getByRole('tab', { name: 'Mata Praktikum', exact: true }).click()
        const add = page.getByRole('button', { name: 'Tambah Mata Praktikum', exact: true })
        await expect(add).toBeInViewport()
        await keyboardActivate(page, add)
        const dialog = page.getByRole('dialog', { name: 'Tambah Mata Praktikum', exact: true })
        await expect(dialog.getByLabel('Nama', { exact: true })).toHaveJSProperty('required', true)
        const bounds = await dialog.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
        await page.keyboard.press('Escape')
        await expect(add).toBeFocused()
      }
      if (path === '/constraint-studio') await expect(page.getByRole('button', { name: 'Generate Schedule', exact: true })).toBeInViewport()
      if (path === '/timetable') {
        await expect(page.getByRole('region', { name: 'Grid jadwal mingguan', exact: true })).toBeVisible()
        await page.screenshot({ path: testInfo.outputPath('timetable-responsive.png'), fullPage: true })
        await keyboardActivate(page, page.getByRole('button', { name: 'Tabel', exact: true }))
        const region = page.getByRole('region', { name: 'Area gulir tabel jadwal', exact: true })
        await tabTo(page, region)
        await expect(region).toBeFocused()
        const canScroll = await region.evaluate((element) => element.scrollWidth > element.clientWidth)
        if (viewport.width < 1024) expect(canScroll).toBe(true)
        if (canScroll) {
          await page.keyboard.press('ArrowRight')
          await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
        }
        await noOverflow(page)
      }
      if (path === '/schedule-history') {
        await keyboardActivate(page, page.getByRole('button', { name: `Lihat versi #${saved.id}`, exact: true }))
        await expect(page.getByRole('heading', { name: `Snapshot versi #${saved.id}`, exact: true })).toBeVisible()
        await noOverflow(page)
      }
    }
  })
}

test('keyboard form validation, cancel/submit, availability, Generate and Save with visible focus', async ({ page }) => {
  const dataset = await createDataset(page, 'Keyboard')
  await go(page, 'Data Master', 'Data Master', '/data-master', false)
  await tabTo(page, page.getByRole('tab', { selected: true }))
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: 'Mata Praktikum', exact: true })).toHaveAttribute('aria-selected', 'true')
  const add = page.getByRole('button', { name: 'Tambah Mata Praktikum', exact: true })
  await keyboardActivate(page, add)
  const dialog = page.getByRole('dialog')
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await keyboardActivate(page, dialog.getByRole('button', { name: 'Simpan data', exact: true }))
  const name = dialog.getByRole('textbox', { name: 'Nama', exact: true })
  await expect(name).toBeFocused()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  const errorId = await name.getAttribute('aria-describedby')
  expect(errorId).toBeTruthy()
  await expect(dialog.locator(`[id="${errorId}"]`)).toBeVisible()
  await keyboardActivate(page, dialog.getByRole('button', { name: 'Batal', exact: true }))
  await expect(add).toBeFocused()
  const ring = await add.evaluate((element) => ({ focus: element.matches(':focus-visible'), shadow: getComputedStyle(element).boxShadow, outline: getComputedStyle(element).outlineWidth }))
  expect(ring.focus).toBe(true)
  expect(ring.shadow !== 'none' || ring.outline !== '0px').toBe(true)
  await page.keyboard.press('Enter')
  await tabTo(page, name)
  await page.keyboard.type('Dibuat dengan keyboard')
  await uiMutation(page, 'POST', 'mata-praktikum', { nama: 'Dibuat dengan keyboard' }, () => keyboardActivate(page, dialog.getByRole('button', { name: 'Simpan data', exact: true })), 201)
  await expect(dialog).toHaveCount(0)
  for (const [type, id] of [['kelompok', dataset.activities[0]!.groupId], ['asisten', dataset.activities[0]!.assistantId]] as const) {
    await go(page, 'Availability', 'Resource Availability', '/availability', false)
    const kind = page.getByLabel('Jenis resource', { exact: true })
    await tabTo(page, kind)
    await page.keyboard.press(type === 'kelompok' ? 'Home' : 'End')
    await page.keyboard.press('Tab')
    const owner = page.getByLabel(type === 'kelompok' ? 'Pilih kelompok' : 'Pilih asisten', { exact: true })
    await tabTo(page, owner)
    await page.keyboard.press('End')
    await page.keyboard.press('Tab')
    const slot = page.getByRole('checkbox', { name: `Senin 08:00–10:00 · ID #${dataset.slotId}`, exact: true })
    await tabTo(page, slot)
    await page.keyboard.press('Space')
    await expect(slot).toBeChecked()
    await uiMutation(page, 'PUT', `${type}/${id}/ketersediaan`, { slot_ids: [dataset.slotId] }, () => keyboardActivate(page, page.getByRole('button', { name: 'Simpan perubahan', exact: true })))
    await expect(page.getByText('Ketersediaan berhasil disimpan.', { exact: true })).toBeVisible()
  }
  await go(page, 'Constraint Studio', 'Constraint Studio', '/constraint-studio', false)
  const generated = await uiMutation(page, 'POST', 'jadwal/generate', {}, () => keyboardActivate(page, page.getByRole('button', { name: 'Generate Schedule', exact: true })))
  const preview = (await generated.json()).data
  await expect(page.getByText('SAT', { exact: true })).toBeVisible()
  await uiMutation(page, 'POST', 'jadwal/simpan', { preview_id: preview.preview_id }, () => keyboardActivate(page, page.getByRole('button', { name: 'Simpan Jadwal', exact: true })), 201)
  await expect(page.getByRole('heading', { name: 'Jadwal berhasil disimpan', exact: true })).toBeVisible()
  await go(page, 'Timetable', 'Timetable', '/timetable', false)
})
