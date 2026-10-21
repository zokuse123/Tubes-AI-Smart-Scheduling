import type { z } from 'zod'
import { ApiError, transportError } from './errors'
import { apiErrorEnvelopeSchema } from './types/common'

export type RequestOptions = { signal?: AbortSignal }
export type QueryParams = Record<string, string | number | boolean | undefined>
type ResponseOptions<T> = RequestOptions & {
  query?: QueryParams
  /** Explicit exceptions such as health's 503 data envelope, validated per status. */
  statusSchemas?: Readonly<Record<number, z.ZodType<T>>>
}
type Fetch = typeof globalThis.fetch

export function normalizeApiBaseUrl(configured?: string, development = import.meta.env.DEV): string {
  const value = configured?.trim() || (development ? 'http://127.0.0.1:5000/api/v1' : '')
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error()
    return parsed.href.replace(/\/+$/, '')
  } catch {
    throw new ApiError('request', 'Konfigurasi URL API tidak valid.')
  }
}

export function createApiClient(config: { baseUrl?: string; fetch?: Fetch } = {}) {
  // Resolve lazily: importing services never performs a request or requires a production URL.
  const fetcher: Fetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init))

  async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, schema: z.ZodType<T>, body: unknown, options: ResponseOptions<T> = {}): Promise<T> {
    const { signal } = options
    if (signal?.aborted) throw new ApiError('aborted', 'Permintaan dibatalkan.')
    const base = normalizeApiBaseUrl(config.baseUrl ?? import.meta.env.VITE_API_BASE_URL)
    const url = new URL(`${base}/${path.replace(/^\/+/, '')}`)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    let serialized: string | undefined
    if (method !== 'GET') {
      try {
        serialized = JSON.stringify(body)
        if (serialized === undefined) throw new Error()
      } catch {
        throw new ApiError('request', 'Body permintaan harus dapat dikirim sebagai JSON.')
      }
    }
    let response: Response
    try {
      response = await fetcher(url.href, {
        method, signal,
        headers: method === 'GET' ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(serialized === undefined ? {} : { body: serialized }),
      })
    } catch (error) {
      throw transportError(error, signal)
    }

    let text: string
    try {
      text = await response.text()
    } catch (error) {
      throw transportError(error, signal, response.status)
    }
    if (signal?.aborted) throw new ApiError('aborted', 'Permintaan dibatalkan.', response.status)
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      if (!response.ok) throw new ApiError('http', 'Layanan mengembalikan respons error yang tidak valid.', response.status)
      throw new ApiError('parse', 'Respons layanan bukan JSON yang valid.', response.status)
    }

    if (!response.ok) {
      const backendError = apiErrorEnvelopeSchema.safeParse(payload)
      if (backendError.success) {
        const { code, message, details } = backendError.data.error
        throw new ApiError('backend', message, response.status, code, details)
      }
      if (!options.statusSchemas?.[response.status]) {
        throw new ApiError('http', 'Layanan mengembalikan respons error yang tidak valid.', response.status)
      }
    }
    const parsed = (options.statusSchemas?.[response.status] ?? schema).safeParse(payload)
    if (!parsed.success) throw new ApiError('protocol', 'Bentuk respons layanan tidak sesuai kontrak API.', response.status)
    return parsed.data
  }

  return {
    get: <T>(path: string, schema: z.ZodType<T>, options?: ResponseOptions<T>) => request('GET', path, schema, undefined, options),
    post: <T>(path: string, body: unknown, schema: z.ZodType<T>, options?: ResponseOptions<T>) => request('POST', path, schema, body, options),
    patch: <T>(path: string, body: unknown, schema: z.ZodType<T>, options?: ResponseOptions<T>) => request('PATCH', path, schema, body, options),
    put: <T>(path: string, body: unknown, schema: z.ZodType<T>, options?: ResponseOptions<T>) => request('PUT', path, schema, body, options),
  }
}

export const apiClient = createApiClient()
