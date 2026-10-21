import * as api from '@/api/services/master'
import type { ApiList, ApiSuccess } from '@/api/types/common'
import type { ActiveFilter, SortOrder } from '@/api/types/common'
import type { Asisten, Day, Kelompok, Laboratorium, MasterResource, MataPraktikum, Praktikum, SlotWaktu } from '@/api/types/master'

export type MasterEntity = MataPraktikum | Kelompok | Asisten | Laboratorium | SlotWaktu | Praktikum
export type FormValues = Record<string, string>
export type Filters = { page: number; page_size: number; is_active: ActiveFilter; sort_by: 'id' | 'created_at' | 'updated_at'; sort_order: SortOrder; search?: string }
type Field = { name: string; label: string; kind: 'text' | 'integer' | 'day' | 'time' | 'reference' }
type ResourceConfig = { key: MasterResource; label: string; searchable: boolean; fields: readonly Field[] }
export const resources: readonly ResourceConfig[] = [
  { key: 'mata-praktikum', label: 'Mata Praktikum', searchable: true, fields: [{ name: 'nama', label: 'Nama', kind: 'text' }] },
  { key: 'kelompok', label: 'Kelompok', searchable: true, fields: [{ name: 'nama', label: 'Nama', kind: 'text' }, { name: 'jumlah_peserta', label: 'Jumlah peserta', kind: 'integer' }] },
  { key: 'asisten', label: 'Asisten', searchable: true, fields: [{ name: 'nama', label: 'Nama', kind: 'text' }] },
  { key: 'laboratorium', label: 'Laboratorium', searchable: true, fields: [{ name: 'nama', label: 'Nama', kind: 'text' }, { name: 'kapasitas', label: 'Kapasitas', kind: 'integer' }] },
  { key: 'slot-waktu', label: 'Slot Waktu', searchable: false, fields: [{ name: 'hari', label: 'Hari', kind: 'day' }, { name: 'jam_mulai', label: 'Jam mulai', kind: 'time' }, { name: 'jam_selesai', label: 'Jam selesai', kind: 'time' }] },
  { key: 'praktikum', label: 'Praktikum', searchable: false, fields: [{ name: 'mata_praktikum_id', label: 'Mata praktikum', kind: 'reference' }, { name: 'kelompok_id', label: 'Kelompok', kind: 'reference' }, { name: 'asisten_id', label: 'Asisten', kind: 'reference' }] },
]
export const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'] as const
export const referenceResources = { mata_praktikum_id: 'mata-praktikum', kelompok_id: 'kelompok', asisten_id: 'asisten' } as const

export function configFor(resource: MasterResource) {
  const config = resources.find((item) => item.key === resource)
  if (!config) throw new Error('Unknown master resource')
  return config
}

export function readList(resource: MasterResource, filters: Filters, signal?: AbortSignal): Promise<ApiList<MasterEntity>> {
  const { search, ...common } = filters
  switch (resource) {
    case 'mata-praktikum': return api.mataPraktikumApi.list({ ...common, ...(search === undefined ? {} : { search }) }, { signal })
    case 'kelompok': return api.kelompokApi.list({ ...common, ...(search === undefined ? {} : { search }) }, { signal })
    case 'asisten': return api.asistenApi.list({ ...common, ...(search === undefined ? {} : { search }) }, { signal })
    case 'laboratorium': return api.laboratoriumApi.list({ ...common, ...(search === undefined ? {} : { search }) }, { signal })
    case 'slot-waktu': return api.slotWaktuApi.list(common, { signal })
    case 'praktikum': return api.praktikumApi.list(common, { signal })
  }
}

export function readDetail(resource: MasterResource, id: number, signal?: AbortSignal): Promise<ApiSuccess<MasterEntity>> {
  switch (resource) {
    case 'mata-praktikum': return api.mataPraktikumApi.detail(id, { signal })
    case 'kelompok': return api.kelompokApi.detail(id, { signal })
    case 'asisten': return api.asistenApi.detail(id, { signal })
    case 'laboratorium': return api.laboratoriumApi.detail(id, { signal })
    case 'slot-waktu': return api.slotWaktuApi.detail(id, { signal })
    case 'praktikum': return api.praktikumApi.detail(id, { signal })
  }
}

export function createRecord(resource: MasterResource, values: FormValues): Promise<ApiSuccess<MasterEntity>> {
  const nama = values.nama?.trim() ?? ''
  switch (resource) {
    case 'mata-praktikum': return api.mataPraktikumApi.create({ nama })
    case 'asisten': return api.asistenApi.create({ nama })
    case 'kelompok': return api.kelompokApi.create({ nama, jumlah_peserta: Number(values.jumlah_peserta) })
    case 'laboratorium': return api.laboratoriumApi.create({ nama, kapasitas: Number(values.kapasitas) })
    case 'slot-waktu': return api.slotWaktuApi.create({ hari: Number(values.hari) as Day, jam_mulai: values.jam_mulai ?? '', jam_selesai: values.jam_selesai ?? '' })
    case 'praktikum': return api.praktikumApi.create({ mata_praktikum_id: Number(values.mata_praktikum_id), kelompok_id: Number(values.kelompok_id), asisten_id: Number(values.asisten_id) })
  }
}

/** Select just changed writable fields; do not send timestamps, status, or nested data. */
export function changedValues(resource: MasterResource, before: FormValues, after: FormValues): FormValues {
  return Object.fromEntries(configFor(resource).fields.flatMap(({ name, kind }) => {
    const value = after[name]?.trim() ?? ''
    const old = before[name]?.trim() ?? ''
    const equal = kind === 'integer' || kind === 'reference' || kind === 'day' ? Number(value) === Number(old) : value === old
    return equal ? [] : [[name, value]]
  }))
}

export function updateRecord(resource: MasterResource, id: number, changes: FormValues): Promise<ApiSuccess<MasterEntity>> {
  // Payload branches preserve F04's resource-specific types and nonempty PATCH contract.
  switch (resource) {
    case 'mata-praktikum': return api.mataPraktikumApi.update(id, { nama: changes.nama ?? '' })
    case 'asisten': return api.asistenApi.update(id, { nama: changes.nama ?? '' })
    case 'kelompok': {
      const other = changes.jumlah_peserta === undefined ? {} : { jumlah_peserta: Number(changes.jumlah_peserta) }
      return api.kelompokApi.update(id, changes.nama !== undefined ? { nama: changes.nama, ...other } : { jumlah_peserta: Number(changes.jumlah_peserta) })
    }
    case 'laboratorium': {
      const other = changes.kapasitas === undefined ? {} : { kapasitas: Number(changes.kapasitas) }
      return api.laboratoriumApi.update(id, changes.nama !== undefined ? { nama: changes.nama, ...other } : { kapasitas: Number(changes.kapasitas) })
    }
    case 'slot-waktu': {
      const times = { ...(changes.jam_mulai === undefined ? {} : { jam_mulai: changes.jam_mulai }), ...(changes.jam_selesai === undefined ? {} : { jam_selesai: changes.jam_selesai }) }
      if (changes.hari !== undefined) return api.slotWaktuApi.update(id, { hari: Number(changes.hari) as Day, ...times })
      if (changes.jam_mulai !== undefined) return api.slotWaktuApi.update(id, { ...times, jam_mulai: changes.jam_mulai })
      return api.slotWaktuApi.update(id, { jam_selesai: changes.jam_selesai ?? '' })
    }
    case 'praktikum': {
      const others = { ...(changes.kelompok_id === undefined ? {} : { kelompok_id: Number(changes.kelompok_id) }), ...(changes.asisten_id === undefined ? {} : { asisten_id: Number(changes.asisten_id) }) }
      if (changes.mata_praktikum_id !== undefined) return api.praktikumApi.update(id, { mata_praktikum_id: Number(changes.mata_praktikum_id), ...others })
      if (changes.kelompok_id !== undefined) return api.praktikumApi.update(id, { ...others, kelompok_id: Number(changes.kelompok_id) })
      return api.praktikumApi.update(id, { asisten_id: Number(changes.asisten_id) })
    }
  }
}

export function setRecordStatus(resource: MasterResource, id: number, is_active: boolean): Promise<ApiSuccess<MasterEntity>> {
  const payload = { is_active }
  switch (resource) {
    case 'mata-praktikum': return api.mataPraktikumApi.setStatus(id, payload)
    case 'kelompok': return api.kelompokApi.setStatus(id, payload)
    case 'asisten': return api.asistenApi.setStatus(id, payload)
    case 'laboratorium': return api.laboratoriumApi.setStatus(id, payload)
    case 'slot-waktu': return api.slotWaktuApi.setStatus(id, payload)
    case 'praktikum': return api.praktikumApi.setStatus(id, payload)
  }
}

export function rawField(record: MasterEntity, name: string): string {
  const value: unknown = Object.getOwnPropertyDescriptor(record, name)?.value
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}
export function initialValues(resource: MasterResource, record?: MasterEntity): FormValues {
  return Object.fromEntries(configFor(resource).fields.map(({ name }) => [name, record ? rawField(record, name) : '']))
}
export function displayField(record: MasterEntity, name: string) {
  if (name === 'hari' && 'hari' in record) return days[record.hari - 1] ?? ''
  if ('mata_praktikum' in record) {
    if (name === 'mata_praktikum_id') return `${record.mata_praktikum.nama} · #${record.mata_praktikum_id}`
    if (name === 'kelompok_id') return `${record.kelompok.nama} · #${record.kelompok_id}`
    if (name === 'asisten_id') return `${record.asisten.nama} · #${record.asisten_id}`
  }
  return rawField(record, name)
}
