import { ApiError } from '../errors'
import type { Identifier } from '../types/common'

export function entityPath(resource: string, id: Identifier): string {
  // Prevent precision loss and path injection before constructing an entity URL.
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError('request', 'ID resource harus integer positif yang dapat direpresentasikan dengan aman.')
  return `${resource}/${id}`
}
