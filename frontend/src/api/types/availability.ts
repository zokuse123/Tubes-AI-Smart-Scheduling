import { z } from 'zod'
import { identifierSchema } from './common'
import type { ApiSuccess } from './common'

const fields = { owner_id: identifierSchema, slot_ids: z.array(identifierSchema) }
export const groupAvailabilitySchema = z.object({ ...fields, owner_type: z.literal('kelompok') })
export const assistantAvailabilitySchema = z.object({ ...fields, owner_type: z.literal('asisten') })
export type GroupAvailability = z.infer<typeof groupAvailabilitySchema>
export type AssistantAvailability = z.infer<typeof assistantAvailabilitySchema>
export type GroupAvailabilityResponse = ApiSuccess<GroupAvailability>
export type AssistantAvailabilityResponse = ApiSuccess<AssistantAvailability>
export type AvailabilityOwner = GroupAvailability['owner_type'] | AssistantAvailability['owner_type']
/** Full replacement of the entire allowlist, including an empty array. */
export type ReplaceAvailability = { slot_ids: number[] }
