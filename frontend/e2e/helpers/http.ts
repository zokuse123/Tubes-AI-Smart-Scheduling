import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import { successSchema } from '../../src/api/types/common'
import { apiUrl } from '../system.ts'

type Intent = { method: string; path: string; payload: unknown }
export type BrowserAudit = { pending: Intent[]; writes: Intent[]; unexpected: string[]; pageErrors: string[]; consoleErrors: string[] }
const audits = new WeakMap<Page, BrowserAudit>()

export function observeBrowser(page: Page): BrowserAudit {
  const audit: BrowserAudit = { pending: [], writes: [], unexpected: [], pageErrors: [], consoleErrors: [] }
  audits.set(page, audit)
  page.on('pageerror', (error) => audit.pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') audit.consoleErrors.push(message.text()) })
  page.on('request', (request) => {
    if (!new URL(request.url()).pathname.startsWith('/api/')) return
    if (!request.url().startsWith(`${apiUrl}/`)) audit.unexpected.push(`Wrong backend: ${request.url()}`)
    if (['GET', 'OPTIONS'].includes(request.method())) return
    const path = new URL(request.url()).pathname.replace('/api/v1/', '')
    const intent = audit.pending[0]
    const observed = { method: request.method(), path, payload: request.postDataJSON() }
    audit.writes.push(observed)
    if (!intent || intent.method !== observed.method || intent.path !== path || !isDeepStrictEqual(intent.payload, observed.payload)) {
      audit.unexpected.push(`Unexpected mutation: ${request.method()} ${path}`)
    } else audit.pending.shift()
  })
  return audit
}

/** Register ONE expected write immediately before a real UI action, never intercept. */
export async function uiMutation(page: Page, method: string, path: string, payload: unknown, action: () => Promise<unknown>, status = 200) {
  const audit = audits.get(page)
  if (!audit) throw new Error('Browser audit fixture is required')
  audit.pending.push({ method, path, payload })
  const responsePromise = page.waitForResponse((response) => response.url() === `${apiUrl}/${path}` && response.request().method() === method)
  await action()
  const response = await responsePromise
  expect(response.status()).toBe(status)
  expect(response.request().postDataJSON()).toEqual(payload)
  expect(await response.headerValue('access-control-allow-origin')).toBe('http://localhost:5173')
  return response
}

export async function getData<T>(page: Page, path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await page.request.get(`${apiUrl}/${path}`)
  expect(response.status()).toBe(200)
  return successSchema(schema).parse(await response.json()).data
}

export async function navigate(page: Page, title: string, path: string) {
  if (!page.url().startsWith('http://localhost:5173')) await page.goto('/')
  if (new URL(page.url()).pathname !== path) await page.getByRole('navigation', { name: 'Navigasi utama desktop' }).getByRole('link', { name: title, exact: true }).click()
  await expect(page).toHaveURL(`http://localhost:5173${path}`)
}
