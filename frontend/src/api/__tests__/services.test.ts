import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { RequestOptions } from '../client'
import { ApiError } from '../errors'
import { availabilityApi } from '../services/availability'
import { healthApi } from '../services/health'
import { asistenApi, kelompokApi, laboratoriumApi, mataPraktikumApi, praktikumApi, slotWaktuApi } from '../services/master'
import { scheduleApi } from '../services/scheduling'
import type { ApiList, ApiSuccess } from '../types/common'
import type { CreatePraktikum, Kelompok, MataPraktikum, PraktikumQuery, SlotWaktuQuery, UpdateKelompok } from '../types/master'
import type { ActiveSchedule, GenerateResult, GenerateSuccess, GenerateUnsatisfiable, HistorySnapshot, ScheduleHistoryDetail } from '../types/scheduling'
import * as f from './fixtures'

const baseUrl = 'http://127.0.0.1:5000/api/v1'
const fetch = vi.fn<typeof globalThis.fetch>()
beforeEach(() => {
  fetch.mockReset()
  vi.stubGlobal('fetch', fetch)
  vi.stubEnv('VITE_API_BASE_URL', baseUrl)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

type Operation = { name: string; method: string; path: string; body?: unknown; response: unknown; run: (options: RequestOptions) => Promise<unknown> }
const masters = [
  {
    path: 'mata-praktikum', entity: f.mata, createPayload: { nama: f.mata.nama }, updatePayload: { nama: 'Nama baru' },
    list: (o: RequestOptions) => mataPraktikumApi.list(undefined, o), detail: (o: RequestOptions) => mataPraktikumApi.detail(1, o),
    create: (o: RequestOptions) => mataPraktikumApi.create({ nama: f.mata.nama }, o),
    update: (o: RequestOptions) => mataPraktikumApi.update(1, { nama: 'Nama baru' }, o), status: (o: RequestOptions) => mataPraktikumApi.setStatus(1, { is_active: false }, o),
  },
  {
    path: 'kelompok', entity: f.kelompok, createPayload: { nama: f.kelompok.nama, jumlah_peserta: 24 }, updatePayload: { jumlah_peserta: 25 },
    list: (o: RequestOptions) => kelompokApi.list(undefined, o), detail: (o: RequestOptions) => kelompokApi.detail(2, o),
    create: (o: RequestOptions) => kelompokApi.create({ nama: f.kelompok.nama, jumlah_peserta: 24 }, o),
    update: (o: RequestOptions) => kelompokApi.update(2, { jumlah_peserta: 25 }, o), status: (o: RequestOptions) => kelompokApi.setStatus(2, { is_active: false }, o),
  },
  {
    path: 'asisten', entity: f.asisten, createPayload: { nama: f.asisten.nama }, updatePayload: { nama: 'Nama baru' },
    list: (o: RequestOptions) => asistenApi.list(undefined, o), detail: (o: RequestOptions) => asistenApi.detail(3, o),
    create: (o: RequestOptions) => asistenApi.create({ nama: f.asisten.nama }, o),
    update: (o: RequestOptions) => asistenApi.update(3, { nama: 'Nama baru' }, o), status: (o: RequestOptions) => asistenApi.setStatus(3, { is_active: false }, o),
  },
  {
    path: 'laboratorium', entity: f.lab, createPayload: { nama: f.lab.nama, kapasitas: 30 }, updatePayload: { kapasitas: 32 },
    list: (o: RequestOptions) => laboratoriumApi.list(undefined, o), detail: (o: RequestOptions) => laboratoriumApi.detail(5, o),
    create: (o: RequestOptions) => laboratoriumApi.create({ nama: f.lab.nama, kapasitas: 30 }, o),
    update: (o: RequestOptions) => laboratoriumApi.update(5, { kapasitas: 32 }, o), status: (o: RequestOptions) => laboratoriumApi.setStatus(5, { is_active: false }, o),
  },
  {
    path: 'slot-waktu', entity: f.slot, createPayload: { hari: 1, jam_mulai: '08:00', jam_selesai: '10:00' }, updatePayload: { hari: 2 },
    list: (o: RequestOptions) => slotWaktuApi.list(undefined, o), detail: (o: RequestOptions) => slotWaktuApi.detail(4, o),
    create: (o: RequestOptions) => slotWaktuApi.create({ hari: 1, jam_mulai: '08:00', jam_selesai: '10:00' }, o),
    update: (o: RequestOptions) => slotWaktuApi.update(4, { hari: 2 }, o), status: (o: RequestOptions) => slotWaktuApi.setStatus(4, { is_active: false }, o),
  },
  {
    path: 'praktikum', entity: f.praktikum, createPayload: { mata_praktikum_id: 1, kelompok_id: 2, asisten_id: 3 }, updatePayload: { asisten_id: 6 },
    list: (o: RequestOptions) => praktikumApi.list(undefined, o), detail: (o: RequestOptions) => praktikumApi.detail(11, o),
    create: (o: RequestOptions) => praktikumApi.create({ mata_praktikum_id: 1, kelompok_id: 2, asisten_id: 3 }, o),
    update: (o: RequestOptions) => praktikumApi.update(11, { asisten_id: 6 }, o), status: (o: RequestOptions) => praktikumApi.setStatus(11, { is_active: false }, o),
  },
]
const operations: Operation[] = masters.flatMap((m) => [
  { name: `${m.path}.list`, method: 'GET', path: m.path, response: { data: [m.entity], meta: f.meta }, run: m.list },
  { name: `${m.path}.detail`, method: 'GET', path: `${m.path}/${m.entity.id}`, response: { data: m.entity }, run: m.detail },
  { name: `${m.path}.create`, method: 'POST', path: m.path, body: m.createPayload, response: { data: m.entity }, run: m.create },
  { name: `${m.path}.update`, method: 'PATCH', path: `${m.path}/${m.entity.id}`, body: m.updatePayload, response: { data: m.path === 'praktikum' ? { ...f.praktikum, asisten_id: 6, asisten: { id: 6, nama: 'Asisten lainnya' } } : { ...m.entity, ...m.updatePayload } }, run: m.update },
  { name: `${m.path}.setStatus`, method: 'PATCH', path: `${m.path}/${m.entity.id}/status`, body: { is_active: false }, response: { data: { ...m.entity, is_active: false } }, run: m.status },
])
operations.push(
  { name: 'availability.group.get', method: 'GET', path: 'kelompok/2/ketersediaan', response: { data: { owner_type: 'kelompok', owner_id: 2, slot_ids: [4] } }, run: (o) => availabilityApi.group.get(2, o) },
  { name: 'availability.group.replace', method: 'PUT', path: 'kelompok/2/ketersediaan', body: { slot_ids: [4] }, response: { data: { owner_type: 'kelompok', owner_id: 2, slot_ids: [4] } }, run: (o) => availabilityApi.group.replace(2, { slot_ids: [4] }, o) },
  { name: 'availability.assistant.get', method: 'GET', path: 'asisten/3/ketersediaan', response: { data: { owner_type: 'asisten', owner_id: 3, slot_ids: [4] } }, run: (o) => availabilityApi.assistant.get(3, o) },
  { name: 'availability.assistant.replace', method: 'PUT', path: 'asisten/3/ketersediaan', body: { slot_ids: [4] }, response: { data: { owner_type: 'asisten', owner_id: 3, slot_ids: [4] } }, run: (o) => availabilityApi.assistant.replace(3, { slot_ids: [4] }, o) },
  { name: 'schedule.generate', method: 'POST', path: 'jadwal/generate', body: {}, response: { data: f.sat }, run: (o) => scheduleApi.generate(o) },
  { name: 'schedule.save', method: 'POST', path: 'jadwal/simpan', body: { preview_id: f.sat.preview_id }, response: { data: f.saved }, run: (o) => scheduleApi.save({ preview_id: f.sat.preview_id }, o) },
  { name: 'schedule.active', method: 'GET', path: 'jadwal/aktif', response: { data: f.saved }, run: (o) => scheduleApi.active(o) },
  { name: 'schedule.history', method: 'GET', path: 'jadwal/riwayat', response: { data: [f.historyItem], meta: f.meta }, run: (o) => scheduleApi.history(undefined, o) },
  { name: 'schedule.historyDetail', method: 'GET', path: 'jadwal/riwayat/21', response: { data: f.historyDetail }, run: (o) => scheduleApi.historyDetail(21, o) },
  { name: 'health.get', method: 'GET', path: 'health', response: { data: f.health }, run: (o) => healthApi.get(o) },
)

describe('40-operation REST service inventory', () => {
  it('covers exactly the independently specified method/path inventory', () => {
    const expected = ['mata-praktikum', 'kelompok', 'asisten', 'laboratorium', 'slot-waktu', 'praktikum'].flatMap((p) => [
      `GET ${p}`, `GET ${p}/{id}`, `POST ${p}`, `PATCH ${p}/{id}`, `PATCH ${p}/{id}/status`,
    ])
    expected.push('GET kelompok/{id}/ketersediaan', 'PUT kelompok/{id}/ketersediaan', 'GET asisten/{id}/ketersediaan', 'PUT asisten/{id}/ketersediaan',
      'POST jadwal/generate', 'POST jadwal/simpan', 'GET jadwal/aktif', 'GET jadwal/riwayat', 'GET jadwal/riwayat/{id}', 'GET health')
    const actual = operations.map((o) => `${o.method} ${o.path.replace(/\/\d+/g, '/{id}')}`)
    expect(operations).toHaveLength(40)
    expect(new Set(actual).size).toBe(40)
    expect(actual.sort()).toEqual(expected.sort())
  })

  it.each(operations)('$name uses its contracted URL, method, body, response, and AbortSignal', async (operation) => {
    const status = operation.name.endsWith('.create') || operation.name === 'schedule.save' ? 201 : 200
    fetch.mockResolvedValue(f.jsonResponse(operation.response, status))
    const controller = new AbortController()
    expect(await operation.run({ signal: controller.signal })).toEqual(operation.response)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(`${baseUrl}/${operation.path}`, expect.objectContaining({ method: operation.method, signal: controller.signal }))
    const init = fetch.mock.calls[0]?.[1]
    expect(init?.body).toBe(operation.body === undefined ? undefined : JSON.stringify(operation.body))
    expect(new Headers(init?.headers).get('Content-Type')).toBe(operation.body === undefined ? null : 'application/json')
  })
})

describe('service contract edge cases', () => {
  it('treats UNSAT as a successful union branch with revision, empty assignments, and no preview', async () => {
    fetch.mockResolvedValue(f.jsonResponse({ data: f.unsat }))
    const { data } = await scheduleApi.generate()
    expect(data.status).toBe('unsatisfiable')
    if (data.status === 'unsatisfiable') {
      expectTypeOf(data).toEqualTypeOf<GenerateUnsatisfiable>()
      expect(data.source_revision).toBe(7)
      expect(data.assignments).toEqual([])
      expect(data.solver_diagnostics.verification.overall).toBe('not_applicable')
      expect(data).not.toHaveProperty('preview_id')
    } else {
      throw new Error('Expected the UNSAT branch')
    }
  })

  it('narrows SAT with required preview metadata and passed verification', async () => {
    fetch.mockResolvedValue(f.jsonResponse({ data: f.sat }))
    const { data } = await scheduleApi.generate()
    expect(data.status).toBe('success')
    if (data.status === 'success') {
      expectTypeOf(data).toEqualTypeOf<GenerateSuccess>()
      expect(data.preview_id).toBe(f.sat.preview_id)
      expect(data.expires_at).toBe(f.sat.expires_at)
      expect(data.assignments).toEqual(f.sat.assignments)
    }
  })

  it('returns active null without inventing an empty schedule', async () => {
    fetch.mockResolvedValue(f.jsonResponse({ data: null }))
    expect(await scheduleApi.active()).toEqual({ data: null })
  })

  it.each(['group', 'assistant'] as const)('replaces the entire %s availability with an empty allowlist', async (owner) => {
    const type = owner === 'group' ? 'kelompok' : 'asisten'
    fetch.mockResolvedValue(f.jsonResponse({ data: { owner_type: type, owner_id: 2, slot_ids: [] } }))
    await availabilityApi[owner].replace(2, { slot_ids: [] })
    expect(fetch.mock.calls[0]?.[1]?.body).toBe('{"slot_ids":[]}')
  })

  it('encodes allowed master and history queries, preserving literal search characters', async () => {
    fetch.mockResolvedValueOnce(f.jsonResponse({ data: [f.kelompok], meta: { ...f.meta, page: 2 } }))
    await kelompokApi.list({ search: '%_ &', is_active: 'all', sort_by: 'jumlah_peserta', sort_order: 'desc', page: 2 })
    let url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: '%_ &', is_active: 'all', sort_by: 'jumlah_peserta', sort_order: 'desc', page: '2' })
    fetch.mockResolvedValueOnce(f.jsonResponse({ data: [], meta: { ...f.meta, total_items: 0, total_pages: 0 } }))
    await scheduleApi.history({ status: 'invalid', sort_by: 'id', sort_order: 'asc', page_size: 100 })
    url = new URL(String(fetch.mock.calls[1]?.[0]))
    expect(Object.fromEntries(url.searchParams)).toEqual({ status: 'invalid', sort_by: 'id', sort_order: 'asc', page_size: '100' })
  })

  it.each([
    { run: () => scheduleApi.generate(), status: 409, code: 'DATA_NOT_READY' },
    { run: () => scheduleApi.generate(), status: 504, code: 'SOLVER_TIMEOUT' },
    { run: () => scheduleApi.generate(), status: 502, code: 'SOLVER_PROTOCOL_ERROR' },
    { run: () => scheduleApi.generate(), status: 503, code: 'SOLVER_UNAVAILABLE' },
    { run: () => scheduleApi.save({ preview_id: f.sat.preview_id }), status: 409, code: 'PREVIEW_EXPIRED' },
    { run: () => scheduleApi.save({ preview_id: f.sat.preview_id }), status: 409, code: 'STALE_PREVIEW' },
    { run: () => scheduleApi.save({ preview_id: f.sat.preview_id }), status: 409, code: 'PREVIEW_CONSUMED' },
  ])('preserves $code/$status and does not turn errors into UNSAT or retry', async ({ run, code, status }) => {
    fetch.mockResolvedValue(f.jsonResponse({ error: { code, message: 'Pesan aman.', details: null } }, status))
    await expect(run()).rejects.toMatchObject({ kind: 'backend', status, code })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('accepts health degraded data on 503 but still preserves backend error envelopes', async () => {
    fetch.mockResolvedValueOnce(f.jsonResponse({ data: f.degraded }, 503))
    expect(await healthApi.get()).toEqual({ data: f.degraded })
    fetch.mockResolvedValueOnce(f.jsonResponse({ error: { code: 'DATABASE_BUSY', message: 'Sibuk.', details: null } }, 503))
    await expect(healthApi.get()).rejects.toMatchObject({ kind: 'backend', status: 503, code: 'DATABASE_BUSY' })
  })

  it.each([{ status: 503, data: f.health }, { status: 200, data: f.degraded }])('rejects inconsistent health HTTP/status pairs: $status', async ({ status, data }) => {
    fetch.mockResolvedValue(f.jsonResponse({ data }, status))
    await expect(healthApi.get()).rejects.toMatchObject({ kind: 'protocol', status })
  })

  it('rejects malformed diagnostics, nested praktikum, strict day types, and non-active active schedules', async () => {
    fetch.mockResolvedValueOnce(f.jsonResponse({ data: { ...f.sat, solver_diagnostics: { ...f.sat.solver_diagnostics, wall_time_ms: '42' } } }))
    await expect(scheduleApi.generate()).rejects.toMatchObject({ kind: 'protocol' })
    fetch.mockResolvedValueOnce(f.jsonResponse({ data: { ...f.praktikum, kelompok: { id: 2, nama: 'IF-3A' } } }))
    await expect(praktikumApi.detail(11)).rejects.toMatchObject({ kind: 'protocol' })
    fetch.mockResolvedValueOnce(f.jsonResponse({ data: { ...f.slot, hari: true } }))
    await expect(slotWaktuApi.detail(4)).rejects.toMatchObject({ kind: 'protocol' })
    fetch.mockResolvedValueOnce(f.jsonResponse({ data: { ...f.saved, status: 'invalid', invalidated_at: f.timestamp } }))
    await expect(scheduleApi.active()).rejects.toMatchObject({ kind: 'protocol' })
  })

  it.each([
    { ...f.sat, solver_diagnostics: undefined },
    { ...f.sat, preview_id: undefined },
    { ...f.sat, preview_id: f.sat.preview_id.toUpperCase() },
    { ...f.sat, solver_diagnostics: { ...f.sat.solver_diagnostics, wall_time_ms: -1 } },
    { ...f.sat, solver_diagnostics: { ...f.sat.solver_diagnostics, verification: { overall: 'not_applicable' } } },
    { ...f.unsat, source_revision: undefined },
    { ...f.unsat, assignments: [f.assignment] },
    { ...f.unsat, solver_diagnostics: { ...f.unsat.solver_diagnostics, verification: { overall: 'passed' } } },
  ])('rejects incomplete or inconsistent SAT/UNSAT metadata: %j', async (data) => {
    fetch.mockResolvedValue(f.jsonResponse({ data }))
    await expect(scheduleApi.generate()).rejects.toMatchObject({ kind: 'protocol', status: 200 })
  })

  it('returns snapshot metadata separately and does not introduce persisted diagnostics', async () => {
    fetch.mockResolvedValue(f.jsonResponse({ data: f.historyDetail }))
    const { data } = await scheduleApi.historyDetail(21)
    expect(data.snapshot).toEqual(f.historyDetail.snapshot)
    expect(Object.isFrozen(data.snapshot)).toBe(true)
    expect(data).not.toHaveProperty('solver_diagnostics')
    expect(data).not.toHaveProperty('hasil_json')
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid or imprecise entity IDs before fetching: %s', (id) => {
    expect(() => mataPraktikumApi.detail(id)).toThrow(ApiError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('exposes distinct read, payload, query, and response types', () => {
    expectTypeOf<Awaited<ReturnType<typeof mataPraktikumApi.detail>>>().toEqualTypeOf<ApiSuccess<MataPraktikum>>()
    expectTypeOf<Awaited<ReturnType<typeof kelompokApi.list>>>().toEqualTypeOf<ApiList<Kelompok>>()
    expectTypeOf<Awaited<ReturnType<typeof scheduleApi.generate>>>().toEqualTypeOf<ApiSuccess<GenerateResult>>()
    expectTypeOf<Awaited<ReturnType<typeof scheduleApi.active>>>().toEqualTypeOf<ApiSuccess<ActiveSchedule | null>>()
    expectTypeOf<Awaited<ReturnType<typeof scheduleApi.historyDetail>>>().toEqualTypeOf<ApiSuccess<ScheduleHistoryDetail>>()
    expectTypeOf<{}>().not.toMatchTypeOf<UpdateKelompok>()
    expectTypeOf<keyof CreatePraktikum>().toEqualTypeOf<'mata_praktikum_id' | 'kelompok_id' | 'asisten_id'>()
    expectTypeOf<SlotWaktuQuery>().not.toHaveProperty('search')
    expectTypeOf<PraktikumQuery>().not.toHaveProperty('search')
    expectTypeOf<HistorySnapshot>().toEqualTypeOf<Readonly<HistorySnapshot>>()
  })
})
