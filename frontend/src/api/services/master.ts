import { apiClient } from '../client'
import type { RequestOptions } from '../client'
import { listSchema, successSchema } from '../types/common'
import type { Identifier } from '../types/common'
import * as master from '../types/master'
import { entityPath } from './paths'

export const mataPraktikumApi = {
  list: (query?: master.MataPraktikumQuery, options?: RequestOptions) => apiClient.get('mata-praktikum', listSchema(master.mataPraktikumSchema), { ...options, query }),
  detail: (id: Identifier, options?: RequestOptions) => apiClient.get(entityPath('mata-praktikum', id), successSchema(master.mataPraktikumSchema), options),
  create: (payload: master.CreateMataPraktikum, options?: RequestOptions) => apiClient.post('mata-praktikum', payload, successSchema(master.mataPraktikumSchema), options),
  update: (id: Identifier, payload: master.UpdateMataPraktikum, options?: RequestOptions) => apiClient.patch(entityPath('mata-praktikum', id), payload, successSchema(master.mataPraktikumSchema), options),
  setStatus: (id: Identifier, payload: master.StatusUpdate, options?: RequestOptions) => apiClient.patch(`${entityPath('mata-praktikum', id)}/status`, payload, successSchema(master.mataPraktikumSchema), options),
}

export const kelompokApi = {
  list: (query?: master.KelompokQuery, options?: RequestOptions) => apiClient.get('kelompok', listSchema(master.kelompokSchema), { ...options, query }),
  detail: (id: Identifier, options?: RequestOptions) => apiClient.get(entityPath('kelompok', id), successSchema(master.kelompokSchema), options),
  create: (payload: master.CreateKelompok, options?: RequestOptions) => apiClient.post('kelompok', payload, successSchema(master.kelompokSchema), options),
  update: (id: Identifier, payload: master.UpdateKelompok, options?: RequestOptions) => apiClient.patch(entityPath('kelompok', id), payload, successSchema(master.kelompokSchema), options),
  setStatus: (id: Identifier, payload: master.StatusUpdate, options?: RequestOptions) => apiClient.patch(`${entityPath('kelompok', id)}/status`, payload, successSchema(master.kelompokSchema), options),
}

export const asistenApi = {
  list: (query?: master.AsistenQuery, options?: RequestOptions) => apiClient.get('asisten', listSchema(master.asistenSchema), { ...options, query }),
  detail: (id: Identifier, options?: RequestOptions) => apiClient.get(entityPath('asisten', id), successSchema(master.asistenSchema), options),
  create: (payload: master.CreateAsisten, options?: RequestOptions) => apiClient.post('asisten', payload, successSchema(master.asistenSchema), options),
  update: (id: Identifier, payload: master.UpdateAsisten, options?: RequestOptions) => apiClient.patch(entityPath('asisten', id), payload, successSchema(master.asistenSchema), options),
  setStatus: (id: Identifier, payload: master.StatusUpdate, options?: RequestOptions) => apiClient.patch(`${entityPath('asisten', id)}/status`, payload, successSchema(master.asistenSchema), options),
}

export const laboratoriumApi = {
  list: (query?: master.LaboratoriumQuery, options?: RequestOptions) => apiClient.get('laboratorium', listSchema(master.laboratoriumSchema), { ...options, query }),
  detail: (id: Identifier, options?: RequestOptions) => apiClient.get(entityPath('laboratorium', id), successSchema(master.laboratoriumSchema), options),
  create: (payload: master.CreateLaboratorium, options?: RequestOptions) => apiClient.post('laboratorium', payload, successSchema(master.laboratoriumSchema), options),
  update: (id: Identifier, payload: master.UpdateLaboratorium, options?: RequestOptions) => apiClient.patch(entityPath('laboratorium', id), payload, successSchema(master.laboratoriumSchema), options),
  setStatus: (id: Identifier, payload: master.StatusUpdate, options?: RequestOptions) => apiClient.patch(`${entityPath('laboratorium', id)}/status`, payload, successSchema(master.laboratoriumSchema), options),
}

export const slotWaktuApi = {
  list: (query?: master.SlotWaktuQuery, options?: RequestOptions) => apiClient.get('slot-waktu', listSchema(master.slotWaktuSchema), { ...options, query }),
  detail: (id: Identifier, options?: RequestOptions) => apiClient.get(entityPath('slot-waktu', id), successSchema(master.slotWaktuSchema), options),
  create: (payload: master.CreateSlotWaktu, options?: RequestOptions) => apiClient.post('slot-waktu', payload, successSchema(master.slotWaktuSchema), options),
  update: (id: Identifier, payload: master.UpdateSlotWaktu, options?: RequestOptions) => apiClient.patch(entityPath('slot-waktu', id), payload, successSchema(master.slotWaktuSchema), options),
  setStatus: (id: Identifier, payload: master.StatusUpdate, options?: RequestOptions) => apiClient.patch(`${entityPath('slot-waktu', id)}/status`, payload, successSchema(master.slotWaktuSchema), options),
}

export const praktikumApi = {
  list: (query?: master.PraktikumQuery, options?: RequestOptions) => apiClient.get('praktikum', listSchema(master.praktikumSchema), { ...options, query }),
  detail: (id: Identifier, options?: RequestOptions) => apiClient.get(entityPath('praktikum', id), successSchema(master.praktikumSchema), options),
  create: (payload: master.CreatePraktikum, options?: RequestOptions) => apiClient.post('praktikum', payload, successSchema(master.praktikumSchema), options),
  update: (id: Identifier, payload: master.UpdatePraktikum, options?: RequestOptions) => apiClient.patch(entityPath('praktikum', id), payload, successSchema(master.praktikumSchema), options),
  setStatus: (id: Identifier, payload: master.StatusUpdate, options?: RequestOptions) => apiClient.patch(`${entityPath('praktikum', id)}/status`, payload, successSchema(master.praktikumSchema), options),
}
