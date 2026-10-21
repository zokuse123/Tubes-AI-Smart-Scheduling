import type { ApiErrorDetails } from './types/common'

export type ApiErrorKind = 'backend' | 'http' | 'network' | 'aborted' | 'parse' | 'protocol' | 'request'

export class ApiError extends Error {
  readonly name = 'ApiError'
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly code: string | null
  readonly details: ApiErrorDetails
  constructor(
    kind: ApiErrorKind,
    message: string,
    status: number | null = null,
    code: string | null = null,
    details: ApiErrorDetails = null,
  ) {
    super(message)
    this.kind = kind
    this.status = status
    this.code = code
    this.details = details
  }
}

export function isAbortFailure(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
}

export function transportError(error: unknown, signal?: AbortSignal, status: number | null = null) {
  return isAbortFailure(error, signal)
    ? new ApiError('aborted', 'Permintaan dibatalkan.', status)
    : new ApiError('network', 'Tidak dapat menghubungi layanan. Periksa koneksi dan coba kembali.', status)
}
