import { apiClient } from '../client'
import type { RequestOptions } from '../client'
import { assistantAvailabilitySchema, groupAvailabilitySchema } from '../types/availability'
import type { ReplaceAvailability } from '../types/availability'
import { successSchema } from '../types/common'
import type { Identifier } from '../types/common'
import { entityPath } from './paths'

export const availabilityApi = {
  group: {
    get: (id: Identifier, options?: RequestOptions) => apiClient.get(`${entityPath('kelompok', id)}/ketersediaan`, successSchema(groupAvailabilitySchema), options),
    replace: (id: Identifier, payload: ReplaceAvailability, options?: RequestOptions) => apiClient.put(`${entityPath('kelompok', id)}/ketersediaan`, payload, successSchema(groupAvailabilitySchema), options),
  },
  assistant: {
    get: (id: Identifier, options?: RequestOptions) => apiClient.get(`${entityPath('asisten', id)}/ketersediaan`, successSchema(assistantAvailabilitySchema), options),
    replace: (id: Identifier, payload: ReplaceAvailability, options?: RequestOptions) => apiClient.put(`${entityPath('asisten', id)}/ketersediaan`, payload, successSchema(assistantAvailabilitySchema), options),
  },
}
