import { test as base, expect } from '@playwright/test'
import { withIsolatedSystem } from './system.ts'
import type { IsolatedSystem } from './system.ts'

export const test = base.extend<object, { isolatedSystem: IsolatedSystem }>({
  // Playwright parses this dependency pattern; it must be destructured, even empty.
  // oxlint-disable-next-line no-empty-pattern
  isolatedSystem: [async ({}, run) => {
    await withIsolatedSystem(run)
  }, { scope: 'worker', auto: true, timeout: 180_000 }],
})
export { expect }
