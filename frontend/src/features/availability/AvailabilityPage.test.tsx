import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appRoutes } from '@/app/routes'
import { createAppQueryClient } from '@/api/queryClient'
import { queryKeys } from '@/api/queryKeys'
import type { AvailabilityOwner } from '@/api/types/availability'
import type { SlotWaktu } from '@/api/types/master'
import * as f from '@/api/__tests__/fixtures'
import { sameIds } from './data'
import type { Owner } from './data'

type Request = { path: string; method: string; query: URLSearchParams; body: { slot_ids?: number[] }; signal?: AbortSignal | null }
let owners: Record<AvailabilityOwner, Owner[]>
let slots: SlotWaktu[]
let saved: Record<string, number[]>
let override: ((request: Request) => Response | Promise<Response> | undefined) | undefined
const requests: Request[] = []
const clients: ReturnType<typeof createAppQueryClient>[] = []
const routers: ReturnType<typeof createMemoryRouter>[] = []
const fetch = vi.fn<typeof globalThis.fetch>()
const label = (id: number) => ({ 4: 'Senin 08:00–10:00 · ID #4', 17: 'Senin 10:00–12:00 · ID #17', 23: 'Rabu 08:00–10:00 · ID #23', 88: 'Jumat 13:00–15:00 · ID #88' })[id]!
const checkbox = (id: number) => screen.getByRole('checkbox', { name: label(id) })
const saveButton = () => screen.getByRole('button', { name: 'Simpan perubahan' })
const puts = () => requests.filter((r) => r.method === 'PUT')
const availabilityResponse = (type: AvailabilityOwner, id: number, ids: number[]) => f.jsonResponse({ data: { owner_type: type, owner_id: id, slot_ids: ids } })

beforeEach(() => {
  requests.length = 0
  override = undefined
  owners = { kelompok: [f.kelompok, { ...f.kelompok, id: 41, nama: 'Kelompok kedua' }, { ...f.kelompok, id: 900, nama: 'Kelompok nonaktif', is_active: false }], asisten: [f.asisten] }
  slots = [
    { ...f.slot, id: 23, hari: 3 }, { ...f.slot, id: 17, jam_mulai: '10:00', jam_selesai: '12:00' }, f.slot,
    { ...f.slot, id: 88, hari: 5, jam_mulai: '13:00', jam_selesai: '15:00', is_active: false },
  ]
  saved = { 'kelompok/2': [4], 'kelompok/41': [23], 'asisten/3': [23] }
  fetch.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const request: Request = { path: url.pathname.replace('/api/v1/', ''), method: init?.method ?? 'GET', query: url.searchParams, body: typeof init?.body === 'string' ? JSON.parse(init.body) : {}, signal: init?.signal }
    requests.push(request)
    const custom = override?.(request)
    if (custom !== undefined) return custom
    const [type, idPart, action] = request.path.split('/')
    if ((type === 'kelompok' || type === 'asisten') && action === 'ketersediaan') {
      const key = `${type}/${idPart}`
      if (request.method === 'PUT') saved[key] = [...request.body.slot_ids!].sort((a, b) => a - b)
      return availabilityResponse(type, Number(idPart), saved[key] ?? [])
    }
    let rows: (Owner | SlotWaktu)[] = type === 'slot-waktu' ? slots : type === 'kelompok' || type === 'asisten' ? owners[type] : []
    if (request.query.get('is_active') === 'true') rows = rows.filter((row) => row.is_active)
    const page = Number(request.query.get('page') ?? 1)
    const size = Number(request.query.get('page_size') ?? 20)
    return f.jsonResponse({ data: rows.slice((page - 1) * size, page * size), meta: { page, page_size: size, total_items: rows.length, total_pages: Math.ceil(rows.length / size) } })
  })
  vi.stubGlobal('fetch', fetch)
})
afterEach(() => {
  cleanup()
  routers.splice(0).forEach((router) => router.dispose())
  clients.splice(0).forEach((client) => client.clear())
  expect(requests.every((request) => request.method === 'GET' || request.method === 'PUT')).toBe(true)
  vi.unstubAllGlobals()
})
function setup() {
  const client = createAppQueryClient()
  clients.push(client)
  const router = createMemoryRouter(appRoutes, { initialEntries: ['/', '/availability'], initialIndex: 1 })
  routers.push(router)
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { user: userEvent.setup(), client, router, view }
}
async function selectGroup(user: ReturnType<typeof userEvent.setup>, id = 2) {
  await screen.findByRole('option', { name: `${id === 2 ? f.kelompok.nama : 'Kelompok kedua'} · ID #${id}` })
  await user.selectOptions(screen.getByLabelText('Pilih kelompok'), String(id))
  await waitFor(() => expect(checkbox(4)).toBeEnabled())
}
const error = (code = 'DATABASE_BUSY', status = 503) => f.jsonResponse({ error: { code, message: 'Permintaan ditolak oleh backend.', details: { field: 'slot_ids' } } }, status)

describe('catalogs, grid, and GET', () => {
  it('loads real active owner choices without selecting a resource or mutating on mount', async () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Resource Availability' })).toBeInTheDocument()
    await screen.findByRole('option', { name: `${f.kelompok.nama} · ID #2` })
    expect(screen.queryByRole('option', { name: /Kelompok nonaktif/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(requests.map((r) => r.path).sort()).toEqual(['kelompok', 'slot-waktu'])
    expect(puts()).toHaveLength(0)
  })

  it('reads selected group availability and displays actual irregular days and ordered unique slot IDs', async () => {
    const { user } = setup()
    await selectGroup(user)
    expect(checkbox(4)).toBeChecked()
    expect(checkbox(17)).not.toBeChecked()
    expect(checkbox(88)).toBeDisabled()
    expect(screen.getAllByRole('checkbox').map((input) => input.getAttribute('aria-label'))).toEqual([label(4), label(17), label(23), label(88)])
    expect(screen.queryByText('Selasa')).not.toBeInTheDocument()
    expect(screen.queryByText('Kamis')).not.toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(requests.some((r) => r.path === 'kelompok/2/ketersediaan')).toBe(true)
  })

  it('switches to assistant choices and uses the assistant availability endpoint', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Jenis resource'), 'asisten')
    await screen.findByRole('option', { name: `${f.asisten.nama} · ID #3` })
    await user.selectOptions(screen.getByLabelText('Pilih asisten'), '3')
    await waitFor(() => expect(checkbox(23)).toBeChecked())
    expect(checkbox(4)).not.toBeChecked()
    expect(requests.some((r) => r.path === 'asisten/3/ketersediaan')).toBe(true)
    expect(puts()).toHaveLength(0)
  })

  it('fetches all owner and slot catalog pages, not only the first 100 records', async () => {
    owners.kelompok = Array.from({ length: 101 }, (_, index) => ({ ...f.kelompok, id: index * 10 + 2, nama: `Kelompok ${index}` }))
    slots = Array.from({ length: 101 }, (_, index) => ({ ...f.slot, id: index * 10 + 4, hari: (index % 5 + 1) as SlotWaktu['hari'], jam_mulai: `08:${String(Math.floor(index / 5)).padStart(2, '0')}`, jam_selesai: `10:${String(Math.floor(index / 5)).padStart(2, '0')}`, is_active: index === 0 }))
    const { user } = setup()
    await screen.findByRole('option', { name: 'Kelompok 100 · ID #1002' })
    await user.selectOptions(screen.getByLabelText('Pilih kelompok'), '1002')
    await screen.findByRole('checkbox', { name: /ID #1004$/ })
    expect(requests.some((r) => r.path === 'kelompok' && r.query.get('page') === '2')).toBe(true)
    expect(requests.some((r) => r.path === 'slot-waktu' && r.query.get('page') === '2')).toBe(true)
    expect(requests.find((r) => r.path === 'slot-waktu')?.query.get('is_active')).toBe('all')
  })

  it.each(['kelompok', 'asisten'] as const)('explains an empty active %s catalog without fake resources', async (type) => {
    owners[type] = []
    const { user } = setup()
    if (type === 'asisten') await user.selectOptions(screen.getByLabelText('Jenis resource'), 'asisten')
    await screen.findByText(`Belum ada ${type} aktif. Tambahkan atau aktifkan resource melalui Data Master.`)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(puts()).toHaveLength(0)
  })

  it('explains an empty slot catalog and never treats empty availability as all available', async () => {
    slots = []
    saved['kelompok/2'] = []
    const { user } = setup()
    await screen.findByRole('option', { name: `${f.kelompok.nama} · ID #2` })
    await user.selectOptions(screen.getByLabelText('Pilih kelompok'), '2')
    await screen.findByText(/Belum ada slot waktu aktif/)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it.each(['kelompok', 'slot-waktu', 'kelompok/2/ketersediaan'])('offers explicit retry after a failure of %s', async (path) => {
    override = (r) => r.path === path ? error() : undefined
    const { user } = setup()
    if (path.includes('/')) {
      await screen.findByRole('option', { name: `${f.kelompok.nama} · ID #2` })
      await user.selectOptions(screen.getByLabelText('Pilih kelompok'), '2')
    }
    expect(await screen.findByRole('alert')).toHaveTextContent('DATABASE_BUSY')
    override = undefined
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(puts()).toHaveLength(0)
  })
})

describe('draft and full replacement', () => {
  it('loads a valid empty allowlist as unchecked and supports keyboard toggle without auto-save', async () => {
    saved['kelompok/2'] = []
    const { user } = setup()
    await selectGroup(user)
    expect(screen.getAllByRole('checkbox').every((input) => !(input as HTMLInputElement).checked)).toBe(true)
    checkbox(4).focus()
    await user.keyboard(' ')
    expect(checkbox(4)).toBeChecked()
    expect(saveButton()).toBeEnabled()
    expect(puts()).toHaveLength(0)
    await user.click(checkbox(4))
    expect(saveButton()).toBeDisabled()
  })

  it('compares selections as sets rather than array ordering', async () => {
    expect(sameIds([23, 4], [4, 23])).toBe(true)
    expect(sameIds([4], [23])).toBe(false)
    saved['kelompok/2'] = [23, 4]
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(23))
    await user.click(checkbox(23))
    expect(saveButton()).toBeDisabled()
    expect(puts()).toHaveLength(0)
  })

  it.each(['kelompok', 'asisten'] as const)('saves full sorted %s allowlist including unchanged selections', async (type) => {
    const { user } = setup()
    if (type === 'kelompok') await selectGroup(user)
    else {
      await user.selectOptions(screen.getByLabelText('Jenis resource'), 'asisten')
      await screen.findByRole('option', { name: `${f.asisten.nama} · ID #3` })
      await user.selectOptions(screen.getByLabelText('Pilih asisten'), '3')
      await waitFor(() => expect(checkbox(4)).toBeEnabled())
    }
    await user.click(screen.getByRole('button', { name: 'Pilih semua slot aktif' }))
    expect(puts()).toHaveLength(0)
    await user.click(saveButton())
    await screen.findByText('Ketersediaan berhasil disimpan.')
    expect(puts()).toHaveLength(1)
    expect(puts()[0]).toMatchObject({ path: `${type}/${type === 'kelompok' ? 2 : 3}/ketersediaan`, body: { slot_ids: [4, 17, 23] } })
    await waitFor(() => expect(saveButton()).toBeDisabled())
  })

  it('clears only after confirmation and persists [] as a valid full replacement', async () => {
    const { user } = setup()
    await selectGroup(user)
    const selected = checkbox(4)
    await user.click(screen.getByRole('button', { name: 'Kosongkan pilihan' }))
    expect(selected).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Ya, lanjutkan' }))
    expect(checkbox(4)).not.toBeChecked()
    expect(puts()).toHaveLength(0)
    await user.click(saveButton())
    await screen.findByText('Ketersediaan berhasil disimpan.')
    expect(puts()[0]?.body).toEqual({ slot_ids: [] })
  })

  it('resets the draft to its accepted server baseline without issuing PUT', async () => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    await user.click(screen.getByRole('button', { name: 'Batalkan perubahan' }))
    expect(checkbox(4)).toBeChecked()
    expect(checkbox(17)).not.toBeChecked()
    expect(saveButton()).toBeDisabled()
    expect(puts()).toHaveLength(0)
  })

  it.each([['INVALID_REFERENCE', 422], ['INACTIVE_REFERENCE', 409], ['DATABASE_BUSY', 503]] as const)('keeps the draft on %s and never retries automatically', async (code, status) => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    override = (r) => r.method === 'PUT' ? error(code, status) : undefined
    await user.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(code)
    expect(checkbox(4)).toBeChecked()
    expect(checkbox(17)).toBeChecked()
    expect(screen.queryByText('Ketersediaan berhasil disimpan.')).not.toBeInTheDocument()
    expect(puts()).toHaveLength(1)
    override = undefined
    await user.click(saveButton())
    await screen.findByText('Ketersediaan berhasil disimpan.')
    expect(puts()).toHaveLength(2)
  })
})

describe('unsaved changes, navigation, and races', () => {
  it.each(['owner', 'type'])('confirms %s changes, allows cancellation, and resets only after acceptance', async (kind) => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    const change = () => kind === 'owner' ? user.selectOptions(screen.getByLabelText('Pilih kelompok'), '41') : user.selectOptions(screen.getByLabelText('Jenis resource'), 'asisten')
    await change()
    expect(screen.getByRole('dialog', { name: 'Ganti resource dan buang draft?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tetap di resource ini' }))
    expect(checkbox(17)).toBeChecked()
    await change()
    await user.click(screen.getByRole('button', { name: 'Buang dan ganti' }))
    if (kind === 'owner') {
      await waitFor(() => expect(checkbox(23)).toBeChecked())
      expect(checkbox(17)).not.toBeChecked()
      expect(saveButton()).toBeDisabled()
    } else {
      await screen.findByLabelText('Pilih asisten')
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    }
    expect(puts()).toHaveLength(0)
  })

  it('blocks internal links until discard is explicitly confirmed', async () => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    const nav = within(screen.getByRole('navigation', { name: 'Navigasi utama desktop' }))
    await user.click(nav.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('dialog', { name: 'Tinggalkan halaman availability?' })
    await user.click(screen.getByRole('button', { name: 'Tetap di halaman' }))
    expect(checkbox(17)).toBeChecked()
    await user.click(nav.getByRole('link', { name: 'Overview' }))
    await user.click(screen.getByRole('button', { name: 'Buang dan tinggalkan' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
  })

  it('also blocks router POP navigation instead of intercepting only anchor clicks', async () => {
    const { user, router } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    await act(async () => { await router.navigate(-1) })
    await screen.findByRole('dialog', { name: 'Tinggalkan halaman availability?' })
    await user.click(screen.getByRole('button', { name: 'Tetap di halaman' }))
    expect(checkbox(17)).toBeChecked()
    expect(router.state.location.pathname).toBe('/availability')
  })

  it('registers beforeunload only for unsaved changes and removes it after reset/unmount', async () => {
    const { user, view } = setup()
    await selectGroup(user)
    const unload = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }
    expect(unload()).toBe(false)
    await user.click(checkbox(17))
    expect(unload()).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Batalkan perubahan' }))
    expect(unload()).toBe(false)
    await user.click(checkbox(17))
    view.unmount()
    expect(unload()).toBe(false)
  })

  it('cancels an old GET and ignores its late response after resource selection changes', async () => {
    let finish: ((response: Response) => void) | undefined
    override = (r) => r.path === 'kelompok/2/ketersediaan' ? new Promise<Response>((resolve) => { finish = resolve }) : undefined
    const { user } = setup()
    await screen.findByRole('option', { name: `${f.kelompok.nama} · ID #2` })
    await user.selectOptions(screen.getByLabelText('Pilih kelompok'), '2')
    await waitFor(() => expect(requests.some((r) => r.path === 'kelompok/2/ketersediaan')).toBe(true))
    expect(screen.getByRole('status', { name: 'Memuat data' })).toBeInTheDocument()
    const signal = requests.find((r) => r.path === 'kelompok/2/ketersediaan')?.signal
    await user.selectOptions(screen.getByLabelText('Pilih kelompok'), '41')
    await waitFor(() => expect(checkbox(23)).toBeChecked())
    expect(signal?.aborted).toBe(true)
    await act(async () => { finish?.(availabilityResponse('kelompok', 2, [4, 17])) })
    expect(checkbox(4)).not.toBeChecked()
    expect(checkbox(17)).not.toBeChecked()
    expect(checkbox(23)).toBeChecked()
  })

  it('preserves a dirty draft on refetch and requires confirmation before accepting newer server state', async () => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    saved['kelompok/2'] = [23]
    await user.click(screen.getByRole('button', { name: 'Muat ulang data' }))
    await screen.findByText(/Data server berbeda dari baseline/)
    expect(checkbox(4)).toBeChecked()
    expect(checkbox(17)).toBeChecked()
    expect(checkbox(23)).not.toBeChecked()
    expect(saveButton()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Gunakan data server' }))
    await user.click(screen.getByRole('button', { name: 'Kembali' }))
    expect(checkbox(17)).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Gunakan data server' }))
    await user.click(screen.getByRole('button', { name: 'Ya, lanjutkan' }))
    expect(checkbox(23)).toBeChecked()
    expect(checkbox(17)).not.toBeChecked()
    expect(saveButton()).toBeDisabled()
  })
})

describe('stale catalogs and confirmed persistence', () => {
  it('reset discards local changes in favor of the most recently received server data', async () => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    saved['kelompok/2'] = [23]
    await user.click(screen.getByRole('button', { name: 'Muat ulang data' }))
    await screen.findByText(/Data server berbeda dari baseline/)
    await user.click(screen.getByRole('button', { name: 'Batalkan perubahan' }))
    expect(checkbox(23)).toBeChecked()
    expect(checkbox(4)).not.toBeChecked()
    expect(checkbox(17)).not.toBeChecked()
    expect(saveButton()).toBeDisabled()
    expect(puts()).toHaveLength(0)
  })

  it('rejects a PUT response for another owner without clearing the draft or claiming success', async () => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    override = (r) => r.method === 'PUT' ? availabilityResponse('kelompok', 41, [4, 17]) : undefined
    await user.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Respons ketersediaan tidak sesuai resource')
    expect(checkbox(17)).toBeChecked()
    expect(screen.queryByText('Ketersediaan berhasil disimpan.')).not.toBeInTheDocument()
    expect(puts()).toHaveLength(1)
  })

  it.each(['wrong-owner', 'duplicate-slot', 'malformed-json'])('rejects %s GET output without displaying it as editable availability', async (mode) => {
    override = (r) => r.path !== 'kelompok/2/ketersediaan' ? undefined : mode === 'wrong-owner' ? availabilityResponse('kelompok', 41, [4]) : mode === 'duplicate-slot' ? availabilityResponse('kelompok', 2, [4, 4]) : new Response('{', { status: 200 })
    const { user } = setup()
    await screen.findByRole('option', { name: `${f.kelompok.nama} · ID #2` })
    await user.selectOptions(screen.getByLabelText('Pilih kelompok'), '2')
    await screen.findByRole('alert')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(puts()).toHaveLength(0)
  })

  it('keeps the draft on a transport failure and permits retry without exposing the native exception', async () => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    override = (r) => r.method === 'PUT' ? Promise.reject(new Error('sensitive local path')) : undefined
    await user.click(saveButton())
    await screen.findByRole('alert')
    expect(screen.queryByText(/sensitive local path/)).not.toBeInTheDocument()
    expect(checkbox(17)).toBeChecked()
    expect(puts()).toHaveLength(1)
  })

  it('does not silently discard inactive or missing IDs and requires explicit removal', async () => {
    saved['kelompok/2'] = [4, 88, 999]
    const { user } = setup()
    await selectGroup(user)
    expect(checkbox(88)).toBeChecked()
    expect(checkbox(88)).toBeDisabled()
    expect(screen.getByText(/#88, #999/)).toBeInTheDocument()
    await user.click(checkbox(17))
    expect(saveButton()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Hapus pilihan tidak tersedia' }))
    await user.click(saveButton())
    await screen.findByText('Ketersediaan berhasil disimpan.')
    expect(puts()[0]?.body).toEqual({ slot_ids: [4, 17] })
  })

  it('retains a selected slot that becomes inactive on catalog refresh, but blocks saving it', async () => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    slots = slots.map((slot) => slot.id === 17 ? { ...slot, is_active: false } : slot)
    await user.click(screen.getByRole('button', { name: 'Muat ulang data' }))
    await waitFor(() => expect(checkbox(17)).toBeDisabled())
    expect(checkbox(17)).toBeChecked()
    expect(saveButton()).toBeDisabled()
    expect(puts()).toHaveLength(0)
  })

  it('preserves draft and blocks editing when a selected owner disappears from the active catalog', async () => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    owners.kelompok = owners.kelompok.filter((owner) => owner.id !== 2)
    await user.click(screen.getByRole('button', { name: 'Muat ulang data' }))
    await screen.findByText(/Resource tidak lagi aktif, tidak ditemukan/)
    expect(checkbox(17)).toBeChecked()
    expect(saveButton()).toBeDisabled()
    expect(puts()).toHaveLength(0)
  })

  it('rechecks owner activity before PUT and keeps the draft if it was deactivated meanwhile', async () => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    owners.kelompok = owners.kelompok.filter((owner) => owner.id !== 2)
    await user.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Resource tidak lagi aktif atau tidak tersedia.')
    expect(checkbox(17)).toBeChecked()
    expect(puts()).toHaveLength(0)
  })

  it('keeps draft on an availability refetch error instead of unmounting the editor', async () => {
    const { user } = setup()
    await selectGroup(user)
    await user.click(checkbox(17))
    override = (r) => r.path === 'kelompok/2/ketersediaan' ? error('RESOURCE_NOT_FOUND', 404) : undefined
    await user.click(screen.getByRole('button', { name: 'Muat ulang data' }))
    await waitFor(() => expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('RESOURCE_NOT_FOUND'))).toBe(true))
    expect(checkbox(17)).toBeChecked()
    expect(saveButton()).toBeDisabled()
    override = undefined
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    await waitFor(() => expect(saveButton()).toBeEnabled())
    expect(checkbox(17)).toBeChecked()
  })

  it('waits for PUT confirmation, disables interactions, guards navigation, and invalidates only related caches', async () => {
    const { user, client } = setup()
    await selectGroup(user)
    const unrelated = queryKeys.availability.owner('asisten', 3)
    const schedule = queryKeys.schedules.active()
    const master = queryKeys.master.list('laboratorium')
    for (const key of [unrelated, schedule, master]) client.setQueryData(key, { marker: 'retained' })
    await user.click(checkbox(17))
    let finish: ((response: Response) => void) | undefined
    override = (r) => r.method === 'PUT' ? new Promise<Response>((resolve) => { finish = resolve }) : undefined
    await user.click(saveButton())
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Menyimpan…' })).toBeDisabled()
    expect(screen.getByLabelText('Pilih kelompok')).toBeDisabled()
    expect(checkbox(17)).toBeDisabled()
    expect(client.getQueryData(queryKeys.availability.owner('kelompok', 2))).toEqual({ data: { owner_type: 'kelompok', owner_id: 2, slot_ids: [4] } })
    expect(screen.queryByText('Ketersediaan berhasil disimpan.')).not.toBeInTheDocument()
    await user.click(within(screen.getByRole('navigation', { name: 'Navigasi utama desktop' })).getByRole('link', { name: 'Overview' }))
    expect(screen.getByRole('button', { name: 'Buang dan tinggalkan' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Tetap di halaman' }))
    saved['kelompok/2'] = [4, 17]
    override = undefined
    await act(async () => { finish?.(availabilityResponse('kelompok', 2, [4, 17])) })
    await screen.findByText('Ketersediaan berhasil disimpan.')
    expect(client.getQueryState(schedule)?.isInvalidated).toBe(true)
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false)
    expect(client.getQueryState(master)?.isInvalidated).toBe(false)
    expect(client.getQueryData(unrelated)).toEqual({ marker: 'retained' })
    expect(requests.filter((r) => r.path === 'kelompok/2/ketersediaan' && r.method === 'GET').length).toBeGreaterThan(1)
  })
})
