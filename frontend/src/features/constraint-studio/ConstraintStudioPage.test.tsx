import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConstraintStudioPage } from '@/pages/ConstraintStudioPage'
import { createAppQueryClient } from '@/api/queryClient'
import { queryKeys } from '@/api/queryKeys'
import type { GenerateResult } from '@/api/types/scheduling'
import * as f from '@/api/__tests__/fixtures'
import { PreviewLifetime } from './PreviewLifetime'

type Request = { path: string; method: string; body: unknown; signal?: AbortSignal | null }
const requests: Request[] = []
const clients: ReturnType<typeof createAppQueryClient>[] = []
const routers: ReturnType<typeof createMemoryRouter>[] = []
let result: GenerateResult
let clock: number
let override: ((request: Request) => Response | Promise<Response> | undefined) | undefined
const fetch = vi.fn<typeof globalThis.fetch>()
const generateButton = () => screen.getByRole('button', { name: 'Generate Schedule' })
const saveButton = () => screen.getByRole('button', { name: 'Simpan Jadwal' })
const generates = () => requests.filter((request) => request.path === 'jadwal/generate')
const saves = () => requests.filter((request) => request.path === 'jadwal/simpan')
const backendError = (code: string, status: number) => f.jsonResponse({ error: { code, message: 'Permintaan tidak dapat diselesaikan.', details: null } }, status)

beforeEach(() => {
  clock = Date.parse('2026-10-18T08:35:00.000Z')
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  result = structuredClone(f.sat)
  override = undefined
  requests.length = 0
  fetch.mockReset().mockImplementation(async (input, init) => {
    const request: Request = { path: new URL(String(input)).pathname.replace('/api/v1/', ''), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined, signal: init?.signal }
    requests.push(request)
    const custom = override?.(request)
    if (custom !== undefined) return custom
    if (request.path === 'jadwal/generate') return f.jsonResponse({ data: structuredClone(result) })
    if (request.path === 'jadwal/simpan') return f.jsonResponse({ data: f.saved }, 201)
    throw new Error('Catalog lookup is unavailable in this fixture')
  })
  vi.stubGlobal('fetch', fetch)
})
afterEach(() => {
  cleanup()
  routers.splice(0).forEach((router) => router.dispose())
  clients.splice(0).forEach((client) => client.clear())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function setup(existingClient?: ReturnType<typeof createAppQueryClient>) {
  const client = existingClient ?? createAppQueryClient()
  if (!existingClient) clients.push(client)
  const router = createMemoryRouter([{ path: '*', element: <ConstraintStudioPage /> }], { initialEntries: ['/constraint-studio'] })
  routers.push(router)
  const view = render(<StrictMode><QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider></StrictMode>)
  return { user: userEvent.setup(), client, view }
}
async function generateSat(user: ReturnType<typeof userEvent.setup>) {
  await user.click(generateButton())
  await screen.findByRole('table', { name: 'Preview penempatan praktikum' })
}

describe('idle, generate, and diagnostics', () => {
  it('mounts idle under StrictMode with no request, preview, fake result, or save action', async () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Constraint Studio' })).toBeInTheDocument()
    expect(screen.getByText('Belum ada hasil generate')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tinjau Data Master' })).toHaveAttribute('href', '/data-master')
    expect(screen.getByRole('link', { name: 'Tinjau Availability' })).toHaveAttribute('href', '/availability')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Jadwal' })).not.toBeInTheDocument()
    await act(async () => { await Promise.resolve() })
    expect(requests).toHaveLength(0)
    expect(document.querySelector('[aria-valuenow]')).toBeNull()
  })

  it('generates exactly once with {}, displays nested snapshot assignments, and does not auto-save or look up catalogs', async () => {
    const { user } = setup()
    await generateSat(user)
    expect(generates()).toHaveLength(1)
    expect(generates()[0]).toMatchObject({ method: 'POST', body: {} })
    const table = within(screen.getByRole('table', { name: 'Preview penempatan praktikum' }))
    expect(table.getByText('#11')).toBeInTheDocument()
    expect(table.getByText(`${f.mata.nama} · #1`)).toBeInTheDocument()
    expect(table.getByText(`${f.kelompok.nama} · #2`)).toBeInTheDocument()
    expect(table.getByText(`${f.asisten.nama} · #3`)).toBeInTheDocument()
    expect(table.getByText(`${f.lab.nama} · #5`)).toBeInTheDocument()
    expect(table.getByText('08:00–10:00')).toBeInTheDocument()
    expect(screen.getByText(f.sat.preview_id)).toBeInTheDocument()
    expect(screen.getByText(f.sat.expires_at)).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    expect(saves()).toHaveLength(0)
    expect(requests).toHaveLength(1)
  })

  it('renders only DEC-067 metrics and treats C01–C09 as rule definitions rather than individual results', async () => {
    const { user } = setup()
    await generateSat(user)
    expect(screen.getByText('42 ms')).toBeInTheDocument()
    expect(screen.getByText('passed')).toBeInTheDocument()
    const candidates = within(screen.getByRole('table', { name: 'Domain kandidat awal' }))
    const rows = candidates.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Praktikum #11')
    expect(within(rows[1]!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([`Praktikum #11${f.mata.nama} · #1`, '3', '2', '6'])
    expect(screen.getByText(/bukan CPU time atau durasi seluruh request/)).toBeInTheDocument()
    expect(screen.getByText(/Pasangan teoritis bukan jumlah solusi/)).toBeInTheDocument()
    await user.click(screen.getByText('Aturan sistem C01–C09'))
    expect(screen.getByText(/Definisi aturan, bukan laporan PASS\/FAIL individual/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(9)
    expect(document.body.textContent).not.toMatch(/CPU usage|backtrack count|pruning count|Session #PL|142\.6/)
  })

  it('shows UNSAT as a normal result with zero candidate counts, original IDs, and no save/assignment', async () => {
    result = structuredClone(f.unsat)
    const { user } = setup()
    await user.click(generateButton())
    await screen.findByText('UNSAT')
    expect(screen.getByText(f.unsat.message)).toBeInTheDocument()
    expect(screen.getByText('not_applicable')).toBeInTheDocument()
    expect(screen.getByText('Praktikum #11')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Domain kandidat awal' })).toHaveTextContent('0')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Preview penempatan praktikum' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Jadwal' })).not.toBeInTheDocument()
    expect(screen.getByText(/bukan diagnosis penyebab pasti/)).toBeInTheDocument()
    expect(saves()).toHaveLength(0)
  })

  it.each([
    ['DATA_NOT_READY', 409], ['STALE_GENERATION', 409], ['SOLVER_TIMEOUT', 504],
    ['SOLVER_UNAVAILABLE', 503], ['SOLVER_PROTOCOL_ERROR', 502], ['SOLVER_PROCESS_ERROR', 502],
    ['SOLVER_INTERNAL_ERROR', 502], ['SOLVER_INVALID_INPUT', 502], ['DATABASE_BUSY', 503],
  ] as const)('preserves generate error %s without treating it as UNSAT or retrying', async (code, status) => {
    override = () => backendError(code, status)
    const { user } = setup()
    await user.click(generateButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(code)
    expect(screen.queryByText('UNSAT')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Jadwal' })).not.toBeInTheDocument()
    expect(generates()).toHaveLength(1)
    expect(generateButton()).toBeEnabled()
  })

  it.each(['network', 'html', 'malformed', 'wrong-shape'])('handles %s generate output safely', async (mode) => {
    override = () => mode === 'network' ? Promise.reject(new Error('private filesystem path')) : mode === 'html' ? new Response('<script>secret traceback</script>', { status: 500 }) : mode === 'malformed' ? new Response('{', { status: 200 }) : f.jsonResponse({ data: { status: 'success' } })
    const { user } = setup()
    await user.click(generateButton())
    await screen.findByRole('alert')
    expect(screen.queryByText(/private filesystem path|secret traceback/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Jadwal' })).not.toBeInTheDocument()
    expect(generates()).toHaveLength(1)
  })

  it('uses an ID fallback for an empty snapshot name without a failing live-master lookup', async () => {
    result = { ...f.sat, assignments: [{ ...f.assignment, mata_praktikum: { id: f.mata.id, nama: '' }, asisten: { id: f.asisten.id, nama: '' } }] }
    const { user } = setup()
    await generateSat(user)
    const table = within(screen.getByRole('table', { name: 'Preview penempatan praktikum' }))
    expect(table.getByText('ID #1 (nama tidak tersedia)')).toBeInTheDocument()
    expect(table.getByText('ID #3 (nama tidak tersedia)')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    expect(requests.every((request) => request.path === 'jadwal/generate')).toBe(true)
  })
})

describe('save lifecycle', () => {
  it('sends only the actual preview ID, confirms the returned version, and invalidates schedule reads only', async () => {
    const { user, client } = setup()
    const affected = [queryKeys.schedules.active(), queryKeys.schedules.historyList(), queryKeys.schedules.historyDetail(21)]
    const unaffected = [queryKeys.master.list('kelompok'), queryKeys.availability.owner('kelompok', 2), queryKeys.health()]
    for (const key of [...affected, ...unaffected]) client.setQueryData(key, { marker: 'retained' })
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    await generateSat(user)
    await user.click(saveButton())
    await screen.findByText('Jadwal berhasil disimpan')
    expect(saves()).toHaveLength(1)
    expect(saves()[0]).toMatchObject({ method: 'POST', body: { preview_id: f.sat.preview_id } })
    expect(screen.getByText('Versi #21 · status active · source revision 7')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Jadwal' })).not.toBeInTheDocument()
    for (const key of affected) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    for (const key of unaffected) expect(client.getQueryState(key)?.isInvalidated).toBe(false)
    expect(client.getQueryData(unaffected[0]!)).toEqual({ marker: 'retained' })
    expect(storage).not.toHaveBeenCalled()
  })

  it.each([['PREVIEW_EXPIRED', 409], ['STALE_PREVIEW', 409], ['PREVIEW_CONSUMED', 409], ['PREVIEW_NOT_FOUND', 404]] as const)('discards a preview rejected as %s without claiming it was saved', async (code, status) => {
    const { user } = setup()
    await generateSat(user)
    override = (request) => request.path === 'jadwal/simpan' ? backendError(code, status) : undefined
    await user.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(code)
    expect(screen.queryByText('Jadwal berhasil disimpan')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Jadwal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Preview penempatan praktikum' })).not.toBeInTheDocument()
    expect(screen.getByText(/Tidak ada preview yang dapat disimpan/)).toBeInTheDocument()
    expect(saves()).toHaveLength(1)
  })

  it.each([['DATABASE_BUSY', 503], ['VALIDATION_ERROR', 422]] as const)('keeps preview after a known backend %s error and retries only by explicit action', async (code, status) => {
    const { user } = setup()
    await generateSat(user)
    override = (request) => request.path === 'jadwal/simpan' ? backendError(code, status) : undefined
    await user.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(code)
    expect(saveButton()).toBeEnabled()
    expect(saves()).toHaveLength(1)
    override = undefined
    await user.click(saveButton())
    await screen.findByText('Jadwal berhasil disimpan')
    expect(saves()).toHaveLength(2)
  })

  it.each(['network', 'malformed', 'wrong-shape'])('does not automatically retry an uncertain %s save or keep it saveable', async (mode) => {
    const { user } = setup()
    await generateSat(user)
    override = (request) => request.path !== 'jadwal/simpan' ? undefined : mode === 'network' ? Promise.reject(new Error('internal secret')) : mode === 'malformed' ? new Response('{', { status: 201 }) : f.jsonResponse({ data: {} }, 201)
    await user.click(saveButton())
    await screen.findByRole('alert')
    expect(screen.getByText(/Status simpan belum dapat dipastikan/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Jadwal' })).not.toBeInTheDocument()
    expect(saves()).toHaveLength(1)
    expect(screen.queryByText(/internal secret/)).not.toBeInTheDocument()
  })

  it('does not allow saving a preview already expired according to the device clock', async () => {
    clock = Date.parse(f.sat.expires_at)
    const { user } = setup()
    await generateSat(user)
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText(/Preview melewati expires_at menurut jam perangkat/)).toBeInTheDocument()
    expect(saves()).toHaveLength(0)
  })

  it('rechecks the device clock in the save handler, even before the next expiry tick', async () => {
    const { user } = setup()
    await generateSat(user)
    clock = Date.parse(f.sat.expires_at)
    fireEvent.click(saveButton())
    expect(saves()).toHaveLength(0)
  })

  it('updates the local expiry hint over time without polling any endpoint', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse(f.sat.expires_at) - 500)
    const save = vi.fn()
    const view = render(<PreviewLifetime preview={f.sat} busy={false} save={save} />)
    expect(saveButton()).toBeEnabled()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(saveButton()).toBeDisabled()
    expect(fetch).not.toHaveBeenCalled()
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('single-flight and stale response protection', () => {
  it('supports keyboard activation for generate and save', async () => {
    const { user } = setup()
    generateButton().focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('table', { name: 'Preview penempatan praktikum' })
    saveButton().focus()
    await user.keyboard('{Enter}')
    await screen.findByText('Jadwal berhasil disimpan')
    expect(generates()).toHaveLength(1)
    expect(saves()).toHaveLength(1)
  })

  it('replaces a SAT preview with a new SAT result and saves only its new UUID', async () => {
    const { user } = setup()
    await generateSat(user)
    result = { ...f.sat, preview_id: '61a963e2-28e7-4a71-9c27-03428c9c8866' }
    await user.click(generateButton())
    await screen.findByText(result.preview_id)
    expect(screen.queryByText(f.sat.preview_id)).not.toBeInTheDocument()
    await user.click(saveButton())
    await screen.findByText('Jadwal berhasil disimpan')
    expect(saves()[0]?.body).toEqual({ preview_id: result.preview_id })
    expect(generates()).toHaveLength(2)
  })

  it('displays honest indeterminate loading and protects generate against double submission', async () => {
    let finish: ((response: Response) => void) | undefined
    override = () => new Promise<Response>((resolve) => { finish = resolve })
    setup()
    fireEvent.click(generateButton())
    fireEvent.click(generateButton())
    await waitFor(() => expect(generates()).toHaveLength(1))
    expect(generateButton()).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Tidak ada persentase progres dari solver')
    expect(screen.queryByRole('button', { name: 'Simpan Jadwal' })).not.toBeInTheDocument()
    await act(async () => { finish?.(f.jsonResponse({ data: f.sat })) })
    await screen.findByRole('button', { name: 'Simpan Jadwal' })
    expect(generateButton()).toBeEnabled()
  })

  it('disables generate/save while saving and shows no premature confirmation', async () => {
    const { user } = setup()
    await generateSat(user)
    let finish: ((response: Response) => void) | undefined
    override = (request) => request.path === 'jadwal/simpan' ? new Promise<Response>((resolve) => { finish = resolve }) : undefined
    fireEvent.click(saveButton())
    fireEvent.click(screen.getByRole('button', { name: 'Menyimpan jadwal…' }))
    fireEvent.click(generateButton())
    await waitFor(() => expect(saves()).toHaveLength(1))
    expect(generateButton()).toBeDisabled()
    expect(screen.queryByText('Jadwal berhasil disimpan')).not.toBeInTheDocument()
    await act(async () => { finish?.(f.jsonResponse({ data: f.saved }, 201)) })
    await screen.findByText('Jadwal berhasil disimpan')
    expect(generates()).toHaveLength(1)
    expect(saves()).toHaveLength(1)
  })

  it('clears an old SAT preview before regeneration and never mixes it into UNSAT', async () => {
    const { user } = setup()
    await generateSat(user)
    result = f.unsat
    await user.click(generateButton())
    await screen.findByText('UNSAT')
    expect(screen.queryByText(f.sat.preview_id)).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Preview penempatan praktikum' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Jadwal' })).not.toBeInTheDocument()
    expect(generates()).toHaveLength(2)
  })

  it('uses the newest actual UUID after regeneration and clears previous errors', async () => {
    const { user } = setup()
    override = () => backendError('SOLVER_TIMEOUT', 504)
    await user.click(generateButton())
    await screen.findByRole('alert')
    override = undefined
    result = { ...f.sat, preview_id: '61a963e2-28e7-4a71-9c27-03428c9c8866' }
    await generateSat(user)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(saveButton())
    await screen.findByText('Jadwal berhasil disimpan')
    expect(saves()[0]?.body).toEqual({ preview_id: result.preview_id })
  })

  it('aborts abandoned requests and does not let an old response replace a newer mount result', async () => {
    let finishOld: ((response: Response) => void) | undefined
    override = () => new Promise<Response>((resolve) => { finishOld = resolve })
    const first = setup()
    await first.user.click(generateButton())
    await waitFor(() => expect(generates()).toHaveLength(1))
    const signal = generates()[0]?.signal
    first.view.unmount()
    expect(signal?.aborted).toBe(true)
    override = undefined
    result = { ...f.sat, preview_id: '61a963e2-28e7-4a71-9c27-03428c9c8866', source_revision: 8 }
    const second = setup(first.client)
    await generateSat(second.user)
    await act(async () => { finishOld?.(f.jsonResponse({ data: f.sat })) })
    expect(screen.getByText(result.preview_id)).toBeInTheDocument()
    expect(screen.queryByText(f.sat.preview_id)).not.toBeInTheDocument()
    expect(generates()).toHaveLength(2)
  })

  it('does not restore a generated preview after leaving and remounting the page', async () => {
    const first = setup()
    await generateSat(first.user)
    first.view.unmount()
    setup(first.client)
    expect(screen.getByText('Belum ada hasil generate')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Jadwal' })).not.toBeInTheDocument()
    expect(generates()).toHaveLength(1)
    expect(saves()).toHaveLength(0)
  })
})
