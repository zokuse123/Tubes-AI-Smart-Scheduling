import { test as base, expect } from '@playwright/test'
import { withIsolatedSystem } from './system.ts'
import type { IsolatedSystem } from './system.ts'
import { observeBrowser } from './helpers/http.ts'
import type { BrowserAudit } from './helpers/http.ts'

export const test = base.extend<{ isolatedSystem: IsolatedSystem; audit: BrowserAudit }>({
  // Playwright parses this dependency pattern; it must be destructured, even empty.
  // oxlint-disable-next-line no-empty-pattern
  isolatedSystem: [async ({}, run) => {
    await withIsolatedSystem(run)
  }, { auto: true, timeout: 180_000 }],
  audit: [async ({ page, isolatedSystem }, run) => {
    expect(isolatedSystem.database).toContain('smart-lab-e2e-')
    const audit = observeBrowser(page)
    await run(audit)
    expect(audit.unexpected).toEqual([])
    expect(audit.pending).toEqual([])
    expect(audit.pageErrors).toEqual([])
    expect(audit.consoleErrors).toEqual([])
  }, { auto: true }],
})
export { expect }
