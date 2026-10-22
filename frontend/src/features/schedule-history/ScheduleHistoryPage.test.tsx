import { formatTimestamp, scheduleStatusLabels } from '@/lib/presentation'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScheduleHistoryPage } from '@/pages/ScheduleHistoryPage'
import { appRoutes } from '@/app/routes'
import { createAppQueryClient } from '@/api/queryClient'
import { queryKeys } from '@/api/queryKeys'
import { invalidateAfterSave } from '@/api/invalidation'
import type { ScheduleHistoryDetail, ScheduleHistoryItem, ScheduleStatus } from '@/api/types/scheduling'
import * as f from '@/api/__tests__/fixtures'

type Request = { path: string; query: URLSearchParams; method: string; signal?: AbortSignal | null }
const requests: Request[] = []
const clients: ReturnType<typeof createAppQueryClient>[] = []
const routers: ReturnType<typeof createMemoryRouter>[] = []
let rows: ScheduleHistoryItem[]
let details: Record<number, ScheduleHistoryDetail>
let override: ((request: Request) => Response | Promise<Response> | undefined) | undefined
let allowActive: boolean
const fetch = vi.fn<typeof globalThis.fetch>()
const defaultQuery = { page: 1, page_size: 20, sort_by: 'created_at', sort_order: 'desc', status: 'all' } as const
const panel = () => within(screen.getByRole('region', { name: 'Panel detail riwayat' }))
const listTable = () => within(screen.getByRole('table', { name: 'Daftar versi jadwal' }))
const refresh = () => screen.getByRole('button', { name: 'Refresh riwayat' })
const failure = (code = 'DATABASE_BUSY', status = 503) => f.jsonResponse({ error: { code, message: 'Permintaan tidak dapat diselesaikan.', details: null } }, status)
function metadata(detail: ScheduleHistoryDetail): ScheduleHistoryItem {
  return { id: detail.id, status: detail.status, source_revision: detail.source_revision, created_at: detail.created_at, invalidated_at: detail.invalidated_at, archived_at: detail.archived_at, summary: detail.summary }
}
function version(id: number, status: ScheduleStatus, hour: string, name: string): ScheduleHistoryDetail {
  const created_at = `2026-10-18T${hour}:05:00.000Z`
  return structuredClone({
    ...f.historyDetail, id, status, created_at,
    source_revision: id === 7 ? 7 : id === 81 ? 8 : 9,
    invalidated_at: status === 'invalid' ? '2026-10-18T08:50:00.000Z' : null,
    archived_at: status === 'archived' ? '2026-10-18T10:05:00.000Z' : null,
    summary: { total_praktikum: 2, total_assignment: 2 },
    snapshot: { schema_version: 1, source_revision: id === 7 ? 7 : id === 81 ? 8 : 9, generated_at: `2026-10-18T${hour}:00:00.000Z`, saved_at: created_at },
    assignments: [
      { ...f.assignment, praktikum_id: 12, mata_praktikum: { id: 1, nama: name }, kelompok: { id: 14, nama: 'Kelompok historis kedua', jumlah_peserta: 20 }, asisten: { id: 15, nama: 'Rina' }, laboratorium: { id: 8, nama: 'Lab historis kedua', kapasitas: 30 } },
      { ...f.assignment, mata_praktikum: { id: 1, nama: name } },
    ],
  })
}
function changeStatus(id: number, status: ScheduleStatus) {
  details[id] = { ...details[id]!, status, invalidated_at: status === 'invalid' ? '2026-10-18T11:00:00.000Z' : null, archived_at: status === 'archived' ? '2026-10-18T11:00:00.000Z' : null }
  rows = rows.map((row) => row.id === id ? metadata(details[id]!) : row)
}
beforeEach(() => {
  requests.length = 0
  allowActive = false
  override = undefined
  details = { 7: version(7, 'invalid', '08', 'Nama historis pertama'), 81: version(81, 'archived', '09', 'Nama arsip'), 305: version(305, 'active', '10', 'Nama versi aktif') }
  rows = [metadata(details[7]!), metadata(details[305]!), metadata(details[81]!)]
  fetch.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const request: Request = { path: url.pathname.replace('/api/v1/', ''), query: url.searchParams, method: init?.method ?? 'GET', signal: init?.signal }
    requests.push(request)
    const custom = override?.(request)
    if (custom !== undefined) return custom
    if (request.path === 'jadwal/aktif') return f.jsonResponse({ data: f.saved })
    if (request.path === 'jadwal/riwayat') {
      const query = request.query
      const status = query.get('status') ?? 'all'
      const sort = query.get('sort_by') ?? 'created_at'
      const direction = query.get('sort_order') === 'asc' ? 1 : -1
      const filtered = rows.filter((row) => status === 'all' || row.status === status).sort((a, b) => direction * ((sort === 'id' ? a.id - b.id : a.created_at.localeCompare(b.created_at)) || a.id - b.id))
      const page = Number(query.get('page') ?? 1)
      const size = Number(query.get('page_size') ?? 20)
      return f.jsonResponse({ data: filtered.slice((page - 1) * size, page * size), meta: { page, page_size: size, total_items: filtered.length, total_pages: Math.ceil(filtered.length / size) } })
    }
    const id = Number(request.path.split('/').at(-1))
    return details[id] ? f.jsonResponse({ data: details[id] }) : failure('RESOURCE_NOT_FOUND', 404)
  })
  vi.stubGlobal('fetch', fetch)
})
afterEach(() => {
  cleanup()
  routers.splice(0).forEach((router) => router.dispose())
  clients.splice(0).forEach((client) => client.clear())
  expect(requests.every((request) => request.method === 'GET' && (/^jadwal\/riwayat(?:\/\d+)?$/.test(request.path) || allowActive && request.path === 'jadwal/aktif'))).toBe(true)
  expect(requests.every((request) => [...request.query.keys()].every((key) => ['page', 'page_size', 'sort_by', 'sort_order', 'status'].includes(key)))).toBe(true)
  vi.unstubAllGlobals()
})
function setup(existingClient?: ReturnType<typeof createAppQueryClient>, actualRoutes = false) {
  const client = existingClient ?? createAppQueryClient()
  if (!existingClient) clients.push(client)
  const router = createMemoryRouter(actualRoutes ? appRoutes : [{ path: '*', element: <ScheduleHistoryPage /> }], { initialEntries: ['/schedule-history'] })
  routers.push(router)
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { user: userEvent.setup(), client, view }
}
async function ready() { await screen.findByRole('table', { name: 'Daftar versi jadwal' }) }
async function select(user: ReturnType<typeof userEvent.setup>, id = 305) {
  await ready()
  await user.click(screen.getByRole('button', { name: `Lihat versi #${id}` }))
  await screen.findByRole('heading', { name: `Snapshot versi #${id}` })
}

describe('history list and server query contract', () => {
  it('shows initial list loading without sample versions or an automatic detail request', async () => {
    let finish: ((response: Response) => void) | undefined
    override = () => new Promise<Response>((resolve) => { finish = resolve })
    setup()
    expect(screen.getByRole('status', { name: 'Memuat data' })).toBeInTheDocument()
    expect(refresh()).toBeDisabled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(Object.fromEntries(requests[0]!.query)).toEqual({ page: '1', page_size: '20', sort_by: 'created_at', sort_order: 'desc', status: 'all' })
    await act(async () => { finish?.(f.jsonResponse({ data: [], meta: { page: 1, page_size: 20, total_items: 0, total_pages: 0 } })) })
    await screen.findByText(/Belum ada versi jadwal tersimpan/)
  })

  it('handles empty history without fake count or default selection and links to Constraint Studio', async () => {
    rows = []
    setup()
    await screen.findByText(/Belum ada versi jadwal tersimpan/)
    expect(screen.getByRole('link', { name: 'Buka Constraint Studio' })).toHaveAttribute('href', '/constraint-studio')
    expect(screen.getByText('0 versi sesuai filter · Tidak ada halaman · 0 versi pada halaman ini.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })

  it('renders server ordering, all three statuses, true metadata, and gaps in version IDs', async () => {
    setup()
    await ready()
    const table = listTable()
    expect(table.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual(['#305', '#81', '#7'])
    for (const status of ['active', 'invalid', 'archived']) expect(table.getByText(scheduleStatusLabels[status as keyof typeof scheduleStatusLabels])).toBeInTheDocument()
    expect(table.getByText(formatTimestamp(details[81]!.created_at))).toHaveAttribute('dateTime', details[81]!.created_at)
    expect(screen.getByText('3 versi sesuai filter · Halaman 1 dari 1 · 3 versi pada halaman ini.')).toBeInTheDocument()
    expect(panel().queryByRole('table')).not.toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(/SCH-2024|Koordinator Lab|PASSED|Status Verifikasi|32 Sesi/)
  })

  it('does not assume the newest version is active or select it automatically', async () => {
    changeStatus(305, 'invalid')
    setup()
    await ready()
    expect(listTable().queryByText('Aktif')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Lihat versi/ }).every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(panel().queryByRole('table')).not.toBeInTheDocument()
  })

  it.each(['active', 'invalid', 'archived'] as const)('filters %s on the server and uses only the contracted parameters', async (status) => {
    const { user } = setup()
    await ready()
    await user.selectOptions(screen.getByLabelText('Status versi'), status)
    await waitFor(() => expect(listTable().getAllByRole('row')).toHaveLength(2))
    expect(requests.at(-1)?.query.get('status')).toBe(status)
    expect(listTable().getByText(scheduleStatusLabels[status as keyof typeof scheduleStatusLabels])).toBeInTheDocument()
    expect(screen.getByText('1 versi sesuai filter · Halaman 1 dari 1 · 1 versi pada halaman ini.')).toBeInTheDocument()
  })

  it('distinguishes a filtered empty result from globally empty history', async () => {
    changeStatus(305, 'invalid')
    const { user } = setup()
    await ready()
    await user.selectOptions(screen.getByLabelText('Status versi'), 'active')
    await screen.findByText('Tidak ada versi dengan status Aktif.')
    expect(screen.queryByText(/Belum ada versi jadwal tersimpan/)).not.toBeInTheDocument()
  })

  it('uses server pagination, metadata totals, and page reset on sorting or page-size changes', async () => {
    rows = Array.from({ length: 21 }, (_, index) => ({ ...metadata(details[7]!), id: index + 1 }))
    const { user } = setup()
    await ready()
    expect(screen.getByText('21 versi sesuai filter · Halaman 1 dari 2 · 20 versi pada halaman ini.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Selanjutnya' }))
    await screen.findByRole('button', { name: 'Lihat versi #1' })
    expect(requests.at(-1)?.query.get('page')).toBe('2')
    expect(listTable().getAllByRole('row')).toHaveLength(2)
    await user.selectOptions(screen.getByLabelText('Urutkan riwayat'), 'id')
    await waitFor(() => expect(listTable().getAllByRole('row')).toHaveLength(21))
    expect(requests.at(-1)?.query.get('page')).toBe('1')
    expect(requests.at(-1)?.query.get('sort_by')).toBe('id')
    await user.selectOptions(screen.getByLabelText('Arah urutan'), 'asc')
    await waitFor(() => expect(listTable().getAllByRole('row')[1]).toHaveTextContent('#1'))
    expect(requests.at(-1)?.query.get('sort_order')).toBe('asc')
    await user.selectOptions(screen.getByLabelText('Versi per halaman'), '50')
    await waitFor(() => expect(listTable().getAllByRole('row')).toHaveLength(22))
    expect(requests.at(-1)?.query.get('page_size')).toBe('50')
    expect(requests.some((request) => request.query.has('sort_dir'))).toBe(false)
  })

  it('keeps an empty out-of-range page explicit and allows returning to the first page', async () => {
    rows = Array.from({ length: 21 }, (_, index) => ({ ...metadata(details[7]!), id: index + 1 }))
    const { user } = setup()
    await ready()
    await user.click(screen.getByRole('button', { name: 'Selanjutnya' }))
    await screen.findByRole('button', { name: 'Lihat versi #1' })
    rows = rows.filter((row) => row.id !== 1)
    await user.click(refresh())
    await screen.findByText(/Halaman ini tidak memuat versi/)
    expect(screen.queryByText(/Belum ada versi jadwal tersimpan/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Halaman pertama' }))
    await ready()
    expect(requests.at(-1)?.query.get('page')).toBe('1')
  })

  it('handles list failure as an error, not an empty history assertion, and retries explicitly', async () => {
    override = () => failure()
    const { user } = setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('DATABASE_BUSY')
    expect(screen.queryByText(/Belum ada versi jadwal tersimpan/)).not.toBeInTheDocument()
    expect(requests).toHaveLength(1)
    override = undefined
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    await ready()
    expect(requests).toHaveLength(2)
  })
})

describe('historical detail and identity', () => {
  it.each([7, 81, 305])('loads version #%s only after selection and displays its snapshot metadata and every parallel assignment', async (id) => {
    const { user } = setup()
    await select(user, id)
    expect(requests.at(-1)?.path).toBe(`jadwal/riwayat/${id}`)
    expect(screen.getByRole('button', { name: `Lihat versi #${id}` })).toHaveAttribute('aria-pressed', 'true')
    expect(listTable().getByText('Terpilih')).toBeInTheDocument()
    expect(panel().getByText('Schema snapshot')).toBeInTheDocument()
    expect(panel().getByText('Snapshot digenerate (WIB)')).toBeInTheDocument()
    expect(panel().getByText('Snapshot disimpan (WIB)')).toBeInTheDocument()
    const table = within(panel().getByRole('table', { name: 'Tabel penempatan jadwal' }))
    expect(table.getAllByRole('row')).toHaveLength(3)
    expect(table.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[2]?.textContent)).toEqual(['#11', '#12'])
    expect(table.getAllByText(`${details[id]!.assignments[0]!.mata_praktikum.nama} · #1`)).toHaveLength(2)
    expect(panel().getByText('Menampilkan seluruh 2 penempatan snapshot.')).toBeInTheDocument()
    if (id === 7) expect(panel().getByText(/tidak dapat diaktifkan ulang/)).toBeInTheDocument()
    if (id === 81) expect(panel().getByText(/Arsip bukan berarti solver gagal/)).toBeInTheDocument()
  })

  it('keeps list visible while detail is loading and exposes no snapshot-only fields early', async () => {
    let finish: ((response: Response) => void) | undefined
    override = (request) => request.path.endsWith('/7') ? new Promise<Response>((resolve) => { finish = resolve }) : undefined
    const { user } = setup()
    await ready()
    await user.click(screen.getByRole('button', { name: 'Lihat versi #7' }))
    expect(panel().getByRole('status', { name: 'Memuat data' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Daftar versi jadwal' })).toBeInTheDocument()
    expect(panel().queryByText('Schema snapshot')).not.toBeInTheDocument()
    await act(async () => { finish?.(f.jsonResponse({ data: details[7] })) })
    await screen.findByRole('heading', { name: 'Snapshot versi #7' })
  })

  it('handles detail not found without losing the list and permits retry', async () => {
    override = (request) => request.path.endsWith('/7') ? failure('RESOURCE_NOT_FOUND', 404) : undefined
    const { user } = setup()
    await ready()
    await user.click(screen.getByRole('button', { name: 'Lihat versi #7' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('RESOURCE_NOT_FOUND')
    expect(panel().getByText(/Versi #7 tidak ditemukan/)).toBeInTheDocument()
    expect(panel().queryByRole('table')).not.toBeInTheDocument()
    expect(listTable().getAllByRole('row')).toHaveLength(4)
    override = undefined
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    await screen.findByRole('heading', { name: 'Snapshot versi #7' })
  })

  it.each(['network', 'malformed', 'wrong-id'])('handles %s detail errors safely and preserves list/selected identity', async (mode) => {
    override = (request) => !request.path.endsWith('/7') ? undefined : mode === 'network' ? Promise.reject(new Error('private path')) : mode === 'malformed' ? new Response('{', { status: 200 }) : f.jsonResponse({ data: details[81] })
    const { user } = setup()
    await ready()
    await user.click(screen.getByRole('button', { name: 'Lihat versi #7' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('heading', { name: 'Detail versi terpilih #7' })).toBeInTheDocument()
    expect(panel().queryByRole('table')).not.toBeInTheDocument()
    expect(listTable().getAllByRole('row')).toHaveLength(4)
    expect(screen.queryByText(/private path/)).not.toBeInTheDocument()
  })

  it('cancels old detail reads and ignores a late response after switching versions', async () => {
    let finish: ((response: Response) => void) | undefined
    override = (request) => request.path.endsWith('/305') ? new Promise<Response>((resolve) => { finish = resolve }) : undefined
    const { user } = setup()
    await ready()
    await user.click(screen.getByRole('button', { name: 'Lihat versi #305' }))
    await waitFor(() => expect(requests.some((request) => request.path.endsWith('/305'))).toBe(true))
    const signal = requests.find((request) => request.path.endsWith('/305'))?.signal
    await user.click(screen.getByRole('button', { name: 'Lihat versi #7' }))
    await screen.findByRole('heading', { name: 'Snapshot versi #7' })
    expect(signal?.aborted).toBe(true)
    await act(async () => { finish?.(f.jsonResponse({ data: details[305] })) })
    expect(screen.queryByRole('heading', { name: 'Snapshot versi #305' })).not.toBeInTheDocument()
    expect(panel().getByRole('heading', { name: 'Snapshot versi #7' })).toBeInTheDocument()
  })

  it('supports keyboard selection and close without any write or implicit restore', async () => {
    const { user } = setup()
    await ready()
    screen.getByRole('button', { name: 'Lihat versi #81' }).focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { name: 'Snapshot versi #81' })
    expect(screen.queryByRole('button', { name: /restore|rollback|reactivate|edit|hapus|delete|simpan|generate/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tutup detail' }))
    expect(panel().queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lihat versi #81' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('navigates to actual Timetable without substituting the chosen historical version for active data', async () => {
    allowActive = true
    const { user } = setup(undefined, true)
    await select(user, 7)
    await user.click(screen.getByRole('link', { name: 'Buka Timetable' }))
    await screen.findByRole('heading', { name: 'Timetable', level: 1 })
    await screen.findByRole('heading', { name: 'Jadwal aktif' })
    expect(screen.getByText('#21')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Snapshot versi #7' })).not.toBeInTheDocument()
  })
})

describe('refresh, stale caches, and status transitions', () => {
  it('cancels an old list query and never replaces a newer sort selection with its late result', async () => {
    let finish: ((response: Response) => void) | undefined
    override = (request) => request.path === 'jadwal/riwayat' && request.query.get('sort_order') === 'desc' ? new Promise<Response>((resolve) => { finish = resolve }) : undefined
    const { user } = setup()
    await waitFor(() => expect(requests).toHaveLength(1))
    const signal = requests[0]?.signal
    await user.selectOptions(screen.getByLabelText('Arah urutan'), 'asc')
    await ready()
    expect(signal?.aborted).toBe(true)
    expect(listTable().getAllByRole('row')[1]).toHaveTextContent('#7')
    await act(async () => { finish?.(f.jsonResponse({ data: [...rows].sort((a, b) => b.id - a.id), meta: { page: 1, page_size: 20, total_items: 3, total_pages: 1 } })) })
    expect(listTable().getAllByRole('row')[1]).toHaveTextContent('#7')
    expect(screen.getByLabelText('Arah urutan')).toHaveValue('asc')
  })

  it('refreshes both the list and selected detail status without changing snapshot payload', async () => {
    const { user, client } = setup()
    await select(user)
    const before = structuredClone(client.getQueryData(queryKeys.schedules.historyDetail(305)))
    changeStatus(305, 'invalid')
    await user.click(refresh())
    await waitFor(() => expect(panel().getByText('Tidak Valid')).toBeInTheDocument())
    expect(listTable().getAllByText('Tidak Valid')).toHaveLength(2)
    expect(panel().getByText('Diinvalidasi (WIB)')).toBeInTheDocument()
    const after = client.getQueryData<{ data: ScheduleHistoryDetail }>(queryKeys.schedules.historyDetail(305))!
    expect(after.data.assignments).toEqual((before as { data: ScheduleHistoryDetail }).data.assignments)
    expect(after.data.snapshot).toEqual((before as { data: ScheduleHistoryDetail }).data.snapshot)
    expect(requests.filter((request) => request.path === 'jadwal/riwayat')).toHaveLength(2)
    expect(requests.filter((request) => request.path === 'jadwal/riwayat/305')).toHaveLength(2)
  })

  it('keeps the exact selected ID when it disappears from a refreshed status-filtered list', async () => {
    const { user } = setup()
    await ready()
    await user.selectOptions(screen.getByLabelText('Status versi'), 'active')
    await select(user)
    changeStatus(305, 'invalid')
    await user.click(refresh())
    await screen.findByText('Tidak ada versi dengan status Aktif.')
    expect(panel().getByText(/Versi terpilih #305 tidak ada pada halaman\/filter daftar terbaru/)).toBeInTheDocument()
    expect(panel().getByRole('heading', { name: 'Snapshot versi #305' })).toBeInTheDocument()
    expect(panel().getByText('Tidak Valid')).toBeInTheDocument()
    expect(requests.some((request) => request.path === 'jadwal/riwayat/81')).toBe(false)
  })

  it('flags list cache as stale on refresh error, while allowing successful detail refresh independently', async () => {
    const { user } = setup()
    await select(user, 81)
    override = (request) => request.path === 'jadwal/riwayat' ? failure() : undefined
    await user.click(refresh())
    await screen.findByRole('alert')
    expect(screen.getByText(/Daftar cache mungkin tidak mutakhir/)).toBeInTheDocument()
    expect(listTable().getByText('Diarsipkan (status terakhir)')).toBeInTheDocument()
    expect(panel().getByText('Diarsipkan')).toBeInTheDocument()
    expect(panel().getByRole('table')).toBeInTheDocument()
    expect(screen.queryByText(/Belum ada versi jadwal tersimpan/)).not.toBeInTheDocument()
  })

  it('retains cached detail on a transient refresh error but labels its status unconfirmed', async () => {
    const { user } = setup()
    await select(user, 81)
    override = (request) => request.path.endsWith('/81') ? failure() : undefined
    await user.click(refresh())
    await screen.findByRole('alert')
    expect(panel().getByText('Diarsipkan (status terakhir)')).toBeInTheDocument()
    expect(panel().getByText(/Snapshot cache ditampilkan/)).toBeInTheDocument()
    expect(panel().getByRole('table')).toBeInTheDocument()
  })

  it('hides cached detail after a fresh 404 instead of continuing to claim it exists', async () => {
    const { user } = setup()
    await select(user, 7)
    override = (request) => request.path.endsWith('/7') ? failure('RESOURCE_NOT_FOUND', 404) : undefined
    await user.click(refresh())
    await screen.findByRole('alert')
    expect(panel().queryByRole('table')).not.toBeInTheDocument()
    expect(panel().getByText(/Versi #7 tidak ditemukan/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Daftar versi jadwal' })).toBeInTheDocument()
  })

  it('discloses cross-read status discrepancies rather than overwriting detail with list metadata', async () => {
    override = (request) => request.path.endsWith('/305') ? f.jsonResponse({ data: { ...details[305], status: 'invalid', invalidated_at: '2026-10-18T11:00:00.000Z' } }) : undefined
    const { user } = setup()
    await select(user)
    expect(panel().getByText(/Status daftar dan detail berbeda antar pembacaan/)).toBeInTheDocument()
    expect(panel().getByText('Tidak Valid')).toBeInTheDocument()
    expect(listTable().getByText('Aktif')).toBeInTheDocument()
  })

  it('preserves original historical names and every assignment across refresh without any master lookup', async () => {
    const { user, client } = setup()
    await select(user, 7)
    const before = structuredClone(client.getQueryData(queryKeys.schedules.historyDetail(7)))
    // A live-master rename is deliberately absent from the immutable detail fixture.
    await user.click(refresh())
    await waitFor(() => expect(refresh()).toBeEnabled())
    expect(client.getQueryData(queryKeys.schedules.historyDetail(7))).toEqual(before)
    expect(panel().getAllByText('Nama historis pertama · #1')).toHaveLength(2)
    expect(requests.every((request) => request.path.startsWith('jadwal/riwayat'))).toBe(true)
  })

  it('uses F04 scheduling invalidation to refetch list/detail without clearing unrelated caches', async () => {
    const { user, client } = setup()
    await select(user, 7)
    const unrelated = queryKeys.master.list('kelompok')
    client.setQueryData(unrelated, { marker: true })
    await act(async () => { await invalidateAfterSave(client) })
    expect(requests.filter((request) => request.path === 'jadwal/riwayat')).toHaveLength(2)
    expect(requests.filter((request) => request.path === 'jadwal/riwayat/7')).toHaveLength(2)
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false)
    expect(client.getQueryData(unrelated)).toEqual({ marker: true })
    expect(client.getQueryData(queryKeys.schedules.historyList(defaultQuery))).toBeDefined()
  })
})
