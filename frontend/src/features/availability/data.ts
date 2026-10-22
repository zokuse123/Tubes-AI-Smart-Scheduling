import { ApiError } from '@/api/errors'
import { availabilityApi } from '@/api/services/availability'
import { asistenApi, kelompokApi, slotWaktuApi } from '@/api/services/master'
import type { AvailabilityOwner, AssistantAvailabilityResponse, GroupAvailabilityResponse } from '@/api/types/availability'
import type { ApiList } from '@/api/types/common'
import type { Asisten, Kelompok, SlotWaktu } from '@/api/types/master'

export type Owner = Kelompok | Asisten
export const catalogKey = (resource: AvailabilityOwner | 'slot-waktu') => ['master', resource, 'list', 'availability-catalog'] as const

async function allPages<T extends { id: number }>(load: (page: number) => Promise<ApiList<T>>) {
  const first = await load(1)
  const rows = [...first.data]
  for (let page = 2; page <= first.meta.total_pages; page += 1) rows.push(...(await load(page)).data)
  return [...new Map(rows.map((row) => [row.id, row])).values()]
}

export async function readOwners(type: AvailabilityOwner, signal?: AbortSignal): Promise<Owner[]> {
  const query = { is_active: 'true', page_size: 100, sort_by: 'id', sort_order: 'asc' } as const
  const rows = await allPages<Owner>((page) => type === 'kelompok'
    ? kelompokApi.list({ ...query, page }, { signal })
    : asistenApi.list({ ...query, page }, { signal }))
  return rows.filter((row) => row.is_active)
}

export function readSlots(signal?: AbortSignal): Promise<SlotWaktu[]> {
  return allPages((page) => slotWaktuApi.list({ page, page_size: 100, is_active: 'all', sort_by: 'id', sort_order: 'asc' }, { signal }))
}

function verifyOwner(result: GroupAvailabilityResponse | AssistantAvailabilityResponse, type: AvailabilityOwner, id: number) {
  if (result.data.owner_type !== type || result.data.owner_id !== id || new Set(result.data.slot_ids).size !== result.data.slot_ids.length) {
    throw new ApiError('protocol', 'Respons ketersediaan tidak sesuai resource atau memuat slot duplikat.')
  }
  return result
}

export async function readAvailability(type: AvailabilityOwner, id: number, signal?: AbortSignal): Promise<GroupAvailabilityResponse | AssistantAvailabilityResponse> {
  return verifyOwner(await (type === 'kelompok' ? availabilityApi.group : availabilityApi.assistant).get(id, { signal }), type, id)
}

export function sameIds(left: readonly number[], right: readonly number[]) {
  const a = new Set(left)
  const b = new Set(right)
  return a.size === b.size && [...a].every((id) => b.has(id))
}

export async function replaceAvailability(type: AvailabilityOwner, id: number, ids: readonly number[]) {
  // Active-only UI preflight; the API permits inactive owners. Not a locking guarantee.
  if (!(await readOwners(type)).some((owner) => owner.id === id)) {
    throw new ApiError('request', 'Resource tidak lagi aktif atau tidak tersedia. Muat ulang katalog; draft tetap dipertahankan.')
  }
  return verifyOwner(await (type === 'kelompok' ? availabilityApi.group : availabilityApi.assistant).replace(id, { slot_ids: [...new Set(ids)].sort((a, b) => a - b) }), type, id)
}
