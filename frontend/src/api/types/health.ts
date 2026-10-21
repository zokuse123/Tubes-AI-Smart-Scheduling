import { z } from 'zod'
import { timestampSchema } from './common'

export const healthSchema = z.object({
  status: z.enum(['healthy', 'degraded']),
  components: z.object({
    backend: z.literal('available'),
    database: z.enum(['available', 'unavailable']),
    solver: z.enum(['available', 'unavailable']),
  }),
  checked_at: timestampSchema,
}).refine((health) => (health.status === 'healthy') === (
  health.components.database === 'available' && health.components.solver === 'available'
))
export type Health = z.infer<typeof healthSchema>
