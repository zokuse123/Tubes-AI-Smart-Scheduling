import { z } from 'zod'

export const identifierSchema = z.number().int().positive()
export const sourceRevisionSchema = z.number().int().nonnegative()
export const timestampSchema = z.iso.datetime({ precision: 3 })
export type Identifier = z.infer<typeof identifierSchema>
export type SourceRevision = z.infer<typeof sourceRevisionSchema>
/** Canonical backend UTC timestamp, with milliseconds and trailing Z. */
export type Timestamp = z.infer<typeof timestampSchema>
export type PreviewId = string
export type SortOrder = 'asc' | 'desc'
export type ActiveFilter = 'true' | 'false' | 'all'
export type AtLeastOne<T> = { [K in keyof T]: Pick<T, K> & Partial<Omit<T, K>> }[keyof T]

export type ApiSuccess<T> = { data: T }
export type ApiList<T> = { data: T[]; meta: PaginationMeta }

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  page_size: z.number().int().min(1).max(100),
  total_items: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
})
export type PaginationMeta = z.infer<typeof paginationMetaSchema>

export function successSchema<T>(data: z.ZodType<T>) {
  return z.strictObject({ data })
}

export function listSchema<T>(item: z.ZodType<T>) {
  return z.strictObject({ data: z.array(item), meta: paginationMetaSchema })
}

export const apiErrorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string(),
    details: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown()), z.null()]),
  }),
})
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>
export type ApiErrorDetails = ApiErrorEnvelope['error']['details']

export type ListQuery<Sort extends string> = {
  page?: number
  page_size?: number
  sort_by?: Sort
  sort_order?: SortOrder
  is_active?: ActiveFilter
}
