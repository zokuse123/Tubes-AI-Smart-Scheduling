import { apiClient } from '../client'
import type { RequestOptions } from '../client'
import { successSchema } from '../types/common'
import { healthSchema } from '../types/health'

const responseSchema = successSchema(healthSchema)
export const healthApi = {
  get: (options?: RequestOptions) => apiClient.get('health', responseSchema, {
    ...options,
    statusSchemas: {
      200: successSchema(healthSchema.refine((health) => health.status === 'healthy')),
      503: successSchema(healthSchema.refine((health) => health.status === 'degraded')),
    },
  }),
}
