import { z } from 'zod'
import { identifierSchema, sourceRevisionSchema, timestampSchema } from './common'
import type { ApiList, ApiSuccess, PreviewId, SortOrder } from './common'
import { groupReferenceSchema, laboratoryReferenceSchema, namedReferenceSchema, slotReferenceSchema } from './master'

export const assignmentSchema = z.object({
  praktikum_id: identifierSchema,
  mata_praktikum: namedReferenceSchema,
  kelompok: groupReferenceSchema,
  asisten: namedReferenceSchema,
  slot_waktu: slotReferenceSchema,
  laboratorium: laboratoryReferenceSchema,
})
export const scheduleSummarySchema = z.object({
  total_praktikum: z.number().int().nonnegative(),
  total_assignment: z.number().int().nonnegative(),
})
export const domainCandidateSchema = z.object({
  praktikum_id: identifierSchema,
  slot_count: z.number().int().nonnegative(),
  laboratory_count: z.number().int().nonnegative(),
  theoretical_pairs: z.number().int().nonnegative(),
})
export const verificationSchema = z.object({ overall: z.enum(['passed', 'not_applicable']) })
export const solverDiagnosticsSchema = z.object({
  wall_time_ms: z.number().int().nonnegative(),
  domain_candidates: z.array(domainCandidateSchema),
  verification: verificationSchema,
})

const previewMetadataSchema = z.object({
  preview_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  preview_status: z.literal('ready'),
  source_revision: sourceRevisionSchema,
  created_at: timestampSchema,
  expires_at: timestampSchema,
})
export const generateSuccessSchema = previewMetadataSchema.extend({
  status: z.literal('success'),
  summary: scheduleSummarySchema,
  assignments: z.array(assignmentSchema),
  solver_diagnostics: solverDiagnosticsSchema.extend({ verification: z.object({ overall: z.literal('passed') }) }),
})
export const generateUnsatisfiableSchema = z.object({
  status: z.literal('unsatisfiable'),
  source_revision: sourceRevisionSchema,
  message: z.string(),
  assignments: z.tuple([]),
  solver_diagnostics: solverDiagnosticsSchema.extend({ verification: z.object({ overall: z.literal('not_applicable') }) }),
})
export const generateResultSchema = z.discriminatedUnion('status', [generateSuccessSchema, generateUnsatisfiableSchema])
export type GenerateRequest = Record<string, never>
export type GenerateSuccess = z.infer<typeof generateSuccessSchema>
export type GenerateUnsatisfiable = z.infer<typeof generateUnsatisfiableSchema>
export type GenerateResult = z.infer<typeof generateResultSchema>
export type GenerateResponse = ApiSuccess<GenerateResult>
export type Assignment = z.infer<typeof assignmentSchema>
export type ScheduleSummary = z.infer<typeof scheduleSummarySchema>
export type DomainCandidate = z.infer<typeof domainCandidateSchema>
export type Verification = z.infer<typeof verificationSchema>
export type SolverDiagnostics = z.infer<typeof solverDiagnosticsSchema>
export type PreviewMetadata = z.infer<typeof previewMetadataSchema>
export type SavePreviewRequest = { preview_id: PreviewId }

export const scheduleStatusSchema = z.enum(['active', 'invalid', 'archived'])
export const scheduleMetadataSchema = z.object({
  id: identifierSchema,
  status: scheduleStatusSchema,
  source_revision: sourceRevisionSchema,
  created_at: timestampSchema,
  invalidated_at: timestampSchema.nullable(),
  archived_at: timestampSchema.nullable(),
  summary: scheduleSummarySchema.readonly(),
})
const scheduleSchema = scheduleMetadataSchema.extend({ assignments: z.array(assignmentSchema).readonly() })
export const activeScheduleSchema = scheduleSchema.extend({
  status: z.literal('active'), invalidated_at: z.null(), archived_at: z.null(),
}).readonly()
export const historySnapshotSchema = z.object({
  schema_version: z.literal(1), source_revision: sourceRevisionSchema,
  generated_at: timestampSchema, saved_at: timestampSchema,
}).readonly()
export const historyDetailSchema = scheduleSchema.extend({ snapshot: historySnapshotSchema }).readonly()
export type ScheduleStatus = z.infer<typeof scheduleStatusSchema>
export type ScheduleHistoryItem = Readonly<z.infer<typeof scheduleMetadataSchema>>
export type ScheduleHistoryCollection = ApiList<ScheduleHistoryItem>
export type Schedule = Readonly<z.infer<typeof scheduleSchema>>
export type ActiveSchedule = z.infer<typeof activeScheduleSchema>
export type SavePreviewResult = ActiveSchedule
export type SavePreviewResponse = ApiSuccess<SavePreviewResult>
export type ActiveScheduleResponse = ApiSuccess<ActiveSchedule | null>
export type ScheduleHistoryDetail = z.infer<typeof historyDetailSchema>
export type HistorySnapshot = z.infer<typeof historySnapshotSchema>
export type HistoryQuery = {
  page?: number; page_size?: number; sort_by?: 'created_at' | 'id'
  sort_order?: SortOrder; status?: ScheduleStatus | 'all'
}
