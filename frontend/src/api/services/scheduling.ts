import { apiClient } from '../client'
import type { RequestOptions } from '../client'
import { listSchema, successSchema } from '../types/common'
import type { Identifier } from '../types/common'
import { activeScheduleSchema, generateResultSchema, historyDetailSchema, scheduleMetadataSchema } from '../types/scheduling'
import type { GenerateRequest, HistoryQuery, SavePreviewRequest } from '../types/scheduling'
import { entityPath } from './paths'

export const scheduleApi = {
  generate: (options?: RequestOptions) => apiClient.post('jadwal/generate', {} satisfies GenerateRequest, successSchema(generateResultSchema), options),
  save: (payload: SavePreviewRequest, options?: RequestOptions) => apiClient.post('jadwal/simpan', payload, successSchema(activeScheduleSchema), options),
  active: (options?: RequestOptions) => apiClient.get('jadwal/aktif', successSchema(activeScheduleSchema.nullable()), options),
  history: (query?: HistoryQuery, options?: RequestOptions) => apiClient.get('jadwal/riwayat', listSchema(scheduleMetadataSchema.readonly()), { ...options, query }),
  historyDetail: (id: Identifier, options?: RequestOptions) => apiClient.get(entityPath('jadwal/riwayat', id), successSchema(historyDetailSchema), options),
}
