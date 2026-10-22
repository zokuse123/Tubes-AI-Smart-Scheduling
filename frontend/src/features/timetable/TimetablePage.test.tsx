import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimetablePage } from '@/pages/TimetablePage'
import { createAppQueryClient } from '@/api/queryClient'
import { queryKeys } from '@/api/queryKeys'
import { invalidateAfterSave } from '@/api/invalidation'
import type { ActiveSchedule, Assignment } from '@/api/types/scheduling'
import * as f from '@/api/__tests__/fixtures'
import { compareAssignments, emptyFilters, groupSlots, visibleAssignments } from './presentation'

type Request = { path: string; method: string; signal?: AbortSignal | null }
const requests: Request[] = []
const clients: ReturnType<typeof createAppQueryClient>[] = []
const routers: ReturnType<typeof createMemoryRouter>[] = []
const fetch = vi.fn<typeof globalThis.fetch>()
let schedule: ActiveSchedule | null
let override: ((request: Request) => Response | Promise<Response> | undefined) | undefined

function makeSchedule(): ActiveSchedule {
  const parallel: Assignment = { ...f.assignment, praktikum_id: 12, kelompok: { ...f.assignment.kelompok, id: 14, nama: 'IF-3B' }, asisten: { id: 15, nama: f.asisten.nama }, laboratorium: { ...f.assignment.laboratorium, id: 8, nama: 'Lab Jaringan' } }
  const later: Assignment = { ...parallel, praktikum_id: 14, slot_waktu: { id: 30, hari: 1, jam_mulai: '10:30', jam_selesai: '12:30' } }
  const wednesday: Assignment = { ...f.assignment, praktikum_id: 13, slot_waktu: { id: 23, hari: 3, jam_mulai: '13:15', jam_selesai: '15:15' } }
  const friday: Assignment = { ...f.assignment, praktikum_id: 15, slot_waktu: { id: 47, hari: 5, jam_mulai: '07:45', jam_selesai: '09:45' } }
  return structuredClone({ ...f.saved, summary: { total_praktikum: 5, total_assignment: 5 }, assignments: [friday, later, parallel, wednesday, f.assignment] })
}
beforeEach(() => {
  requests.length = 0
  schedule = makeSchedule()
  override = undefined
  fetch.mockReset().mockImplementation(async (input, init) => {
    const request: Request = { path: new URL(String(input)).pathname.replace('/api/v1/', ''), method: init?.method ?? 'GET', signal: init?.signal }
    requests.push(request)
    const custom = override?.(request)
    return custom ?? f.jsonResponse({ data: schedule })
  })
  vi.stubGlobal('fetch', fetch)
})
afterEach(() => {
  cleanup()
  routers.splice(0).forEach((router) => router.dispose())
  clients.splice(0).forEach((client) => client.clear())
  expect(requests.every((request) => request.path === 'jadwal/aktif' && request.method === 'GET')).toBe(true)
  vi.unstubAllGlobals()
})
function setup(cached?: ActiveSchedule | null, existingClient?: ReturnType<typeof createAppQueryClient>) {
  const client = existingClient ?? createAppQueryClient()
  if (!existingClient) clients.push(client)
  if (cached !== undefined) client.setQueryData(queryKeys.schedules.active(), { data: cached })
  const router = createMemoryRouter([{ path: '*', element: <TimetablePage /> }], { initialEntries: ['/timetable'] })
  routers.push(router)
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { user: userEvent.setup(), client, view }
}
const refresh = () => screen.getByRole('button', { name: 'Refresh jadwal aktif' })
async function ready() { await screen.findByRole('heading', { level: 2, name: 'Jadwal aktif' }) }
const gridIds = () => screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'))
const failed = () => f.jsonResponse({ error: { code: 'DATABASE_BUSY', message: 'Database sedang sibuk.', details: null } }, 503)

describe('loading, active snapshot, and empty/error semantics', () => {
  it('shows initial loading without fake cards and performs only GET active', async () => {
    let finish: ((response: Response) => void) | undefined
    override = () => new Promise<Response>((resolve) => { finish = resolve })
    setup()
    expect(screen.getByRole('status', { name: 'Memuat data' })).toBeInTheDocument()
    expect(refresh()).toBeDisabled()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByText('Belum ada jadwal aktif')).not.toBeInTheDocument()
    await waitFor(() => expect(requests).toHaveLength(1))
    await act(async () => { finish?.(f.jsonResponse({ data: schedule })) })
    await ready()
    expect(requests).toHaveLength(1)
  })

  it('renders null as no active schedule, with a navigation link but no generate/save control', async () => {
    schedule = null
    setup()
    await screen.findByText('Belum ada jadwal aktif')
    expect(screen.getByRole('link', { name: 'Buka Constraint Studio' })).toHaveAttribute('href', '/constraint-studio')
    expect(screen.queryByRole('region', { name: 'Grid jadwal mingguan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate|simpan/i })).not.toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })

  it('shows actual version/status/revision/timestamp/summary and no unavailable metrics', async () => {
    setup()
    await ready()
    expect(screen.getByText('#21')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText(f.saved.created_at)).toHaveAttribute('dateTime', f.saved.created_at)
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('Menampilkan 5 dari 5 penempatan snapshot.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Semester Ganjil|2024\/2025|0 Bentrok|SAT SOLVED|C01-C09 OK|wall_time_ms|confidence score|Execution Latency/)
    expect(requests).toHaveLength(1)
  })

  it('displays a safe initial error, not an empty-schedule assertion, and retries explicitly', async () => {
    override = failed
    const { user } = setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('DATABASE_BUSY')
    expect(screen.queryByText('Belum ada jadwal aktif')).not.toBeInTheDocument()
    expect(screen.getByText(/Kegagalan request bukan bukti bahwa jadwal kosong/)).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    override = undefined
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    await ready()
    expect(requests).toHaveLength(2)
  })

  it.each(['network', 'html', 'malformed', 'invalid', 'archived'])('rejects %s responses without presenting them as active schedules', async (mode) => {
    override = () => mode === 'network' ? Promise.reject(new Error('sensitive path')) : mode === 'html' ? new Response('<p>secret traceback</p>', { status: 500 }) : mode === 'malformed' ? new Response('{', { status: 200 }) : f.jsonResponse({ data: { ...f.saved, status: mode } })
    setup()
    await screen.findByRole('alert')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jadwal aktif' })).not.toBeInTheDocument()
    expect(screen.queryByText(/sensitive path|secret traceback/)).not.toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })
})

describe('weekly grid, table, and local filters', () => {
  it('renders every assignment in chronological order including parallel laboratories', async () => {
    setup()
    await ready()
    expect(gridIds()).toEqual(['Praktikum #11', 'Praktikum #12', 'Praktikum #14', 'Praktikum #13', 'Praktikum #15'])
    const sameSlot = within(screen.getByRole('region', { name: 'Senin 08:00–10:00 slot #4' }))
    expect(sameSlot.getAllByRole('article')).toHaveLength(2)
    expect(sameSlot.getByText('Lab AI · #5')).toBeInTheDocument()
    expect(sameSlot.getByText('Lab Jaringan · #8')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Rabu 13:15–15:15 slot #23' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Jumat 07:45–09:45 slot #47' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Jadwal Selasa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Jadwal Kamis' })).not.toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })

  it('keeps equal assistant names distinguishable by snapshot IDs without catalog lookups', async () => {
    setup()
    await ready()
    const first = within(screen.getByRole('article', { name: 'Praktikum #11' }))
    const second = within(screen.getByRole('article', { name: 'Praktikum #12' }))
    expect(first.getByText('Rina · #3')).toBeInTheDocument()
    expect(second.getByText('Rina · #15')).toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })

  it('renders the same complete snapshot in the table without a network request or data mutation', async () => {
    const { user, client } = setup()
    await ready()
    const before = structuredClone(client.getQueryData(queryKeys.schedules.active()))
    await user.click(screen.getByRole('button', { name: 'Tabel' }))
    const table = within(screen.getByRole('table', { name: 'Tabel penempatan jadwal' }))
    expect(table.getAllByRole('columnheader')).toHaveLength(7)
    const rows = table.getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell')[2]?.textContent)).toEqual(['#11', '#12', '#14', '#13', '#15'])
    expect(rows[0]).toHaveTextContent('Senin08:00–10:00Slot #4')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(client.getQueryData(queryKeys.schedules.active())).toEqual(before)
    expect(requests).toHaveLength(1)
  })

  it('filters by actual day and preserves the filter while switching display modes', async () => {
    const { user } = setup()
    await ready()
    await user.selectOptions(screen.getByLabelText('Hari'), '3')
    expect(gridIds()).toEqual(['Praktikum #13'])
    expect(screen.getByText('Menampilkan 1 dari 5 penempatan snapshot.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tabel' }))
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Tabel' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Grid' }))
    expect(gridIds()).toEqual(['Praktikum #13'])
    expect(requests).toHaveLength(1)
  })

  it.each([['Laboratorium', '8', ['Praktikum #12', 'Praktikum #14']], ['Kelompok', '2', ['Praktikum #11', 'Praktikum #13', 'Praktikum #15']]] as const)('filters %s by ID, not by labels or new GET parameters', async (field, id, expected) => {
    const { user } = setup()
    await ready()
    await user.selectOptions(screen.getByLabelText(field), id)
    expect(gridIds()).toEqual(expected)
    expect(requests).toHaveLength(1)
  })

  it('shows a filter-empty state, retains accurate totals, and resets all filters locally', async () => {
    const { user } = setup()
    await ready()
    await user.selectOptions(screen.getByLabelText('Hari'), '3')
    await user.selectOptions(screen.getByLabelText('Laboratorium'), '8')
    await screen.findByText('Tidak ada penempatan sesuai filter.')
    expect(screen.getByText('Menampilkan 0 dari 5 penempatan snapshot.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset filter' }))
    expect(gridIds()).toHaveLength(5)
    expect(screen.getByLabelText('Hari')).toHaveValue('all')
    expect(screen.getByLabelText('Laboratorium')).toHaveValue('all')
    expect(screen.getByRole('button', { name: 'Reset filter' })).toBeDisabled()
    expect(requests).toHaveLength(1)
  })

  it('supports keyboard mode controls and labelled native filters', async () => {
    const { user } = setup()
    await ready()
    screen.getByRole('button', { name: 'Tabel' }).focus()
    await user.keyboard(' ')
    expect(screen.getByRole('table', { name: 'Tabel penempatan jadwal' })).toBeInTheDocument()
    const filters = ['Hari', 'Laboratorium', 'Kelompok']
    for (const name of filters) expect(screen.getByRole('combobox', { name })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Mode tampilan' })).toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })
})

describe('refresh, stale data, and invalidation', () => {
  it('can refresh from no active schedule into a newly saved version', async () => {
    schedule = null
    const { user } = setup()
    await screen.findByText('Belum ada jadwal aktif')
    schedule = makeSchedule()
    await user.click(refresh())
    await ready()
    expect(gridIds()).toHaveLength(5)
    expect(screen.queryByText('Belum ada jadwal aktif')).not.toBeInTheDocument()
    expect(requests).toHaveLength(2)
  })

  it('marks cached content unconfirmed until the GET completes', async () => {
    let finish: ((response: Response) => void) | undefined
    override = () => new Promise<Response>((resolve) => { finish = resolve })
    setup(makeSchedule())
    expect(screen.getByText('Snapshot terakhir — belum terkonfirmasi aktif')).toBeInTheDocument()
    expect(screen.getByText('Status terakhir: active')).toBeInTheDocument()
    expect(screen.getByText(/Memeriksa jadwal aktif/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jadwal aktif' })).not.toBeInTheDocument()
    await act(async () => { finish?.(f.jsonResponse({ data: schedule })) })
    await ready()
  })

  it('refreshes a changed version, replaces snapshot labels, and resets version-specific filters', async () => {
    const { user } = setup()
    await ready()
    await user.selectOptions(screen.getByLabelText('Hari'), '3')
    schedule = { ...makeSchedule(), id: 22, source_revision: 8, created_at: '2026-10-18T09:00:00.000Z', summary: { total_praktikum: 1, total_assignment: 1 }, assignments: [{ ...f.assignment, praktikum_id: 99, mata_praktikum: { id: 1, nama: 'Nama snapshot versi baru' } }] }
    await user.click(refresh())
    await screen.findByText('#22')
    expect(gridIds()).toEqual(['Praktikum #99'])
    expect(screen.getByLabelText('Hari')).toHaveValue('all')
    expect(screen.getByText('Nama snapshot versi baru · #1')).toBeInTheDocument()
    expect(screen.queryByText('#21')).not.toBeInTheDocument()
    expect(requests).toHaveLength(2)
  })

  it('removes the old active version, filters, and grid when refresh returns null', async () => {
    const { user } = setup()
    await ready()
    schedule = null
    await user.click(refresh())
    await screen.findByText('Belum ada jadwal aktif')
    expect(screen.queryByText('#21')).not.toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Laboratorium')).not.toBeInTheDocument()
    expect(requests).toHaveLength(2)
  })

  it('preserves cached snapshot on refresh failure but clearly withdraws active-status certainty', async () => {
    const { user } = setup()
    await ready()
    await user.selectOptions(screen.getByLabelText('Hari'), '3')
    override = failed
    await user.click(refresh())
    expect(await screen.findByRole('alert')).toHaveTextContent('DATABASE_BUSY')
    expect(screen.getByText('Snapshot terakhir — belum terkonfirmasi aktif')).toBeInTheDocument()
    expect(screen.getByText(/Data cache mungkin tidak mutakhir/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jadwal aktif' })).not.toBeInTheDocument()
    expect(gridIds()).toEqual(['Praktikum #13'])
    expect(screen.queryByText('Belum ada jadwal aktif')).not.toBeInTheDocument()
    override = undefined
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    await ready()
    expect(screen.queryByText(/Data cache mungkin tidak mutakhir/)).not.toBeInTheDocument()
    expect(requests).toHaveLength(3)
  })

  it('does not continue claiming empty when refresh of a cached null fails', async () => {
    schedule = null
    const { user } = setup()
    await screen.findByText('Belum ada jadwal aktif')
    override = failed
    await user.click(refresh())
    await screen.findByRole('alert')
    expect(screen.queryByText('Belum ada jadwal aktif')).not.toBeInTheDocument()
    expect(screen.getByText(/Keberadaan jadwal aktif belum dapat dipastikan/)).toBeInTheDocument()
  })

  it('responds to the existing F07 save invalidation helper using the same active query key', async () => {
    const { client } = setup()
    await ready()
    schedule = { ...makeSchedule(), id: 22 }
    await act(async () => { await invalidateAfterSave(client) })
    await screen.findByText('#22')
    expect(requests).toHaveLength(2)
  })

  it('ignores late aborted GET responses after a newer mount reads a new version', async () => {
    let finish: ((response: Response) => void) | undefined
    override = () => new Promise<Response>((resolve) => { finish = resolve })
    const first = setup()
    await waitFor(() => expect(requests).toHaveLength(1))
    const signal = requests[0]?.signal
    first.view.unmount()
    expect(signal?.aborted).toBe(true)
    override = undefined
    schedule = { ...makeSchedule(), id: 22 }
    setup(undefined, first.client)
    await ready()
    await act(async () => { finish?.(f.jsonResponse({ data: makeSchedule() })) })
    expect(screen.getByText('#22')).toBeInTheDocument()
    expect(screen.queryByText('#21')).not.toBeInTheDocument()
  })
})

describe('pure snapshot transformations', () => {
  it('produces the same deterministic presentation for input permutations without mutating frozen input', () => {
    const source = Object.freeze([...makeSchedule().assignments])
    const expected = [11, 12, 14, 13, 15]
    for (const input of [source, [...source].reverse(), [...source.slice(2), ...source.slice(0, 2)]]) {
      expect(visibleAssignments(input, emptyFilters).map((row) => row.praktikum_id)).toEqual(expected)
    }
    expect(source.map((row) => row.praktikum_id)).toEqual([15, 14, 12, 13, 11])
    const slots = groupSlots(source)
    expect(slots.map(({ slot }) => slot.id)).toEqual([4, 30, 23, 47])
    expect(slots[0]?.assignments.map((row) => row.praktikum_id)).toEqual([11, 12])
    expect([...source].sort(compareAssignments).map((row) => row.praktikum_id)).toEqual(expected)
  })
})
