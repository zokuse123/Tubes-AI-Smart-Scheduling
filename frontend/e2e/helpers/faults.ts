import { expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { apiUrl } from '../system.ts'
import { expectNetworkFailure, startUIWrite } from './http.ts'

export function gate() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail })
  // Propagate to the awaiting test without creating an unhandled rejection in a route callback.
  void promise.catch(() => {})
  return { promise, resolve, reject }
}
export const faultHeaders = { 'content-type': 'application/json', 'access-control-allow-origin': 'http://localhost:5173' }
export async function abortUIWrite(page: Page, path: string, payload: unknown, button: string) {
  expectNetworkFailure(page, path)
  await page.route(`${apiUrl}/${path}`, (route) => route.abort('failed'))
  const failed = page.waitForEvent('requestfailed', (request) => request.url() === `${apiUrl}/${path}`)
  await startUIWrite(page, 'POST', path, payload, () => page.getByRole('button', { name: button, exact: true }).click())
  expect((await failed).failure()).not.toBeNull()
}
export async function releaseCaptured(route: Route, response: Awaited<ReturnType<Route['fetch']>>) {
  try { await route.fulfill({ response }) }
  catch (error) {
    // Navigation deliberately aborted this request; do not mask unrelated errors.
    if (!route.request().failure()?.errorText.includes('ERR_ABORTED')) throw error
  }
}
