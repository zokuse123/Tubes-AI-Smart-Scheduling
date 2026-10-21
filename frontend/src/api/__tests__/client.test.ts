import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApiClient, normalizeApiBaseUrl } from '../client'
import { ApiError } from '../errors'
import { listSchema, successSchema } from '../types/common'
import { jsonResponse } from './fixtures'

const baseUrl = 'http://127.0.0.1:5000/api/v1'
const entitySchema = z.object({ id: z.number().int() })
const responseSchema = successSchema(entitySchema)
function setup() {
  const fetch = vi.fn<typeof globalThis.fetch>()
  return { fetch, client: createApiClient({ baseUrl, fetch }) }
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('HTTP client', () => {
  it('sends GET with Accept, without a body or JSON Content-Type, and returns the envelope', async () => {
    const { client, fetch } = setup()
    fetch.mockResolvedValue(jsonResponse({ data: { id: 2 } }))
    expect(await client.get('/example', responseSchema)).toEqual({ data: { id: 2 } })
    expect(fetch).toHaveBeenCalledWith(`${baseUrl}/example`, { method: 'GET', signal: undefined, headers: { Accept: 'application/json' } })
  })

  it.each(['post', 'patch', 'put'] as const)('serializes %s JSON and preserves the payload', async (method) => {
    const { client, fetch } = setup()
    fetch.mockResolvedValue(jsonResponse({ data: { id: 2 } }))
    await client[method]('example', { is_active: false, slot_ids: [] }, responseSchema)
    expect(fetch).toHaveBeenCalledWith(`${baseUrl}/example`, expect.objectContaining({
      method: method.toUpperCase(), body: '{"is_active":false,"slot_ids":[]}',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    }))
  })

  it('normalizes base slashes and URL-encodes query values without dropping false, zero, or empty strings', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ data: { id: 2 } }))
    const client = createApiClient({ baseUrl: `${baseUrl}///`, fetch })
    await client.get('/example', responseSchema, { query: { search: 'A%_ &/B', is_active: false, page: 0, empty: '', absent: undefined } })
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/v1/example')
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: 'A%_ &/B', is_active: 'false', page: '0', empty: '' })
  })

  it('uses the configured environment URL lazily', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:5999/api/v1/')
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ data: { id: 1 } }))
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient()
    expect(fetch).not.toHaveBeenCalled()
    await client.get('example', responseSchema)
    expect(fetch.mock.calls[0]?.[0]).toBe('http://localhost:5999/api/v1/example')
  })

  it('has a development-only fallback and rejects invalid or credential-bearing configuration', () => {
    expect(normalizeApiBaseUrl(undefined, true)).toBe(baseUrl)
    expect(normalizeApiBaseUrl('  http://localhost:5000/api/v1/// ', false)).toBe('http://localhost:5000/api/v1')
    for (const configured of [undefined, '/api/v1', 'file:///local', 'https://user:secret@host/api', 'https://host/api?secret=1', 'https://host/api#hash']) {
      expect(() => normalizeApiBaseUrl(configured, false)).toThrow(ApiError)
    }
  })

  it('preserves legal null data and empty paginated lists', async () => {
    const { client, fetch } = setup()
    fetch.mockResolvedValueOnce(jsonResponse({ data: null })).mockResolvedValueOnce(jsonResponse({ data: [], meta: { page: 1, page_size: 20, total_items: 0, total_pages: 0 } }))
    expect(await client.get('active', successSchema(entitySchema.nullable()))).toEqual({ data: null })
    expect(await client.get('list', listSchema(entitySchema))).toMatchObject({ data: [], meta: { total_pages: 0 } })
  })

  it.each([null, { field: 'nama' }, { fields: ['nama'] }, ['field error']])('preserves valid backend error details: %j', async (details) => {
    const { client, fetch } = setup()
    fetch.mockResolvedValue(jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid.', details } }, 422))
    await expect(client.get('example', responseSchema)).rejects.toMatchObject({ name: 'ApiError', kind: 'backend', status: 422, code: 'VALIDATION_ERROR', message: 'Data tidak valid.', details })
  })

  it.each([new Response('<html>private traceback path</html>', { status: 502 }), jsonResponse({ message: 'private traceback path' }, 500)])('sanitizes HTTP errors without a valid backend envelope', async (response) => {
    const { client, fetch } = setup()
    fetch.mockResolvedValue(response)
    const error = await client.get('example', responseSchema).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'http', status: response.status, code: null, details: null })
    expect((error as ApiError).message).not.toMatch(/private|traceback|path/)
  })

  it.each([
    { error: { code: 'VALIDATION_ERROR', message: 'Tidak valid.' } },
    { error: { code: 'VALIDATION_ERROR', message: 'Tidak valid.', details: 'not an object/array/null' } },
    { data: null, error: { code: 'INTERNAL_ERROR', message: 'Error.', details: null } },
  ])('does not trust an invalid backend error envelope: %j', async (payload) => {
    const { client, fetch } = setup()
    fetch.mockResolvedValue(jsonResponse(payload, 422))
    await expect(client.get('example', responseSchema)).rejects.toMatchObject({ kind: 'http', status: 422, code: null, details: null })
  })

  it('distinguishes a network failure without exposing the native exception', async () => {
    const { client, fetch } = setup()
    fetch.mockRejectedValue(new TypeError('secret local path'))
    const error = await client.get('example', responseSchema).catch((value: unknown) => value)
    expect(error).toMatchObject({ kind: 'network', status: null, code: null })
    expect((error as ApiError).message).not.toContain('secret')
  })

  it.each(['', '{"data":', '<html>not JSON</html>'])('classifies malformed successful JSON as parse failure: %j', async (body) => {
    const { client, fetch } = setup()
    fetch.mockResolvedValue(new Response(body, { status: 200 }))
    await expect(client.get('example', responseSchema)).rejects.toMatchObject({ kind: 'parse', status: 200 })
  })

  it.each([null, [], {}, { data: null }, { data: { id: '2' } }, { data: { id: 2 }, error: {} }, { error: { code: 'INTERNAL_ERROR', message: 'Error', details: null } }])('rejects an invalid success envelope or DTO: %j', async (payload) => {
    const { client, fetch } = setup()
    fetch.mockResolvedValue(jsonResponse(payload))
    await expect(client.get('example', responseSchema)).rejects.toMatchObject({ kind: 'protocol', status: 200 })
  })

  it('rejects list responses missing pagination metadata', async () => {
    const { client, fetch } = setup()
    fetch.mockResolvedValue(jsonResponse({ data: [] }))
    await expect(client.get('example', listSchema(entitySchema))).rejects.toMatchObject({ kind: 'protocol' })
  })

  it('passes AbortSignal to fetch and rejects an already aborted request without calling fetch', async () => {
    const { client, fetch } = setup()
    const controller = new AbortController()
    fetch.mockResolvedValue(jsonResponse({ data: { id: 2 } }))
    await client.get('example', responseSchema, { signal: controller.signal })
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
    controller.abort()
    await expect(client.get('example', responseSchema, { signal: controller.signal })).rejects.toMatchObject({ kind: 'aborted' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('classifies cancellation while fetch is pending', async () => {
    const { client, fetch } = setup()
    const controller = new AbortController()
    fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }))
    const pending = client.get('example', responseSchema, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('preserves cancellation during body reading and distinguishes other stream errors', async () => {
    const { client, fetch } = setup()
    const response = jsonResponse({ data: { id: 1 } })
    vi.spyOn(response, 'text').mockRejectedValue(new DOMException('aborted', 'AbortError'))
    fetch.mockResolvedValueOnce(response)
    await expect(client.get('example', responseSchema)).rejects.toMatchObject({ kind: 'aborted', status: 200 })
    const disconnected = jsonResponse({ data: { id: 1 } })
    vi.spyOn(disconnected, 'text').mockRejectedValue(new TypeError('private transport details'))
    fetch.mockResolvedValueOnce(disconnected)
    await expect(client.get('example', responseSchema)).rejects.toMatchObject({ kind: 'network', status: 200 })
  })

  it('reports a non-serializable request safely before calling fetch', async () => {
    const { client, fetch } = setup()
    await expect(client.post('example', { value: 1n }, responseSchema)).rejects.toMatchObject({ kind: 'request', status: null })
    expect(fetch).not.toHaveBeenCalled()
  })
})
