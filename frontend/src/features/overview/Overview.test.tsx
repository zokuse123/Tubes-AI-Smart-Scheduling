import { formatTimestamp } from '@/lib/presentation'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/api/queryClient'
import { queryKeys } from '@/api/queryKeys'
import { invalidateAfterMasterMutation, invalidateAfterSave } from '@/api/invalidation'
import * as f from '@/api/__tests__/fixtures'
import { OverviewPage } from '@/pages/OverviewPage'
import { resources } from '@/features/master-data/resources'
import { countQuery, latestHistoryQuery } from './queries'

const clients: ReturnType<typeof createAppQueryClient>[] = []
const routers: ReturnType<typeof createMemoryRouter>[] = []
const requests: { url: URL; method: string }[] = []
type Handler = (url: URL) => Response | Promise<Response>
const rows = [f.mata, f.kelompok, f.asisten, f.lab, f.slot, f.praktikum]
function response(url: URL) {
  if (url.pathname.endsWith('/health')) return f.jsonResponse({ data: f.health })
  if (url.pathname.endsWith('/jadwal/aktif')) return f.jsonResponse({ data: f.saved })
  if (url.pathname.endsWith('/jadwal/riwayat')) return f.jsonResponse({ data: [{ ...f.historyItem, status: 'invalid', invalidated_at: f.timestamp }], meta: { page: 1, page_size: 1, total_items: 8, total_pages: 8 } })
  const index = resources.findIndex(({ key }) => url.pathname.endsWith(`/${key}`))
  if (index < 0) throw new Error('Unexpected GET')
  const filter = url.searchParams.get('is_active') ?? 'all'
  const total = ({ all: 12 + index, true: 9 + index, false: 3 }[filter] ?? 0)
  return f.jsonResponse({ data: [{ ...rows[index], is_active: url.searchParams.get('is_active') !== 'false' }], meta: { page: 1, page_size: 1, total_items: total, total_pages: total } })
}
function setup(handler: Handler = response, configure?: (client: ReturnType<typeof createAppQueryClient>) => void) {
  const client = createAppQueryClient()
  clients.push(client)
  configure?.(client)
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    requests.push({ url, method: init?.method ?? 'GET' })
    return handler(url)
  })
  vi.stubGlobal('fetch', fetch)
  const router = createMemoryRouter([{ path: '/', element: <OverviewPage /> }, ...['data-master', 'availability', 'constraint-studio', 'timetable', 'schedule-history'].map((path) => ({ path: `/${path}`, element: <h1>{path} destination</h1> }))])
  routers.push(router)
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { client, router, view, fetch, user: userEvent.setup() }
}
async function settled() { await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh dashboard' })).toBeEnabled()) }
const region = (name: string) => within(screen.getByRole('region', { name }))
const fail = () => { throw new TypeError('private-local-path must never appear') }
afterEach(() => {
  expect(requests.every(({ method }) => method === 'GET')).toBe(true)
  cleanup()
  routers.splice(0).forEach((router) => router.dispose())
  clients.splice(0).forEach((client) => client.clear())
  requests.splice(0)
  vi.unstubAllGlobals()
})

describe('Overview verified metadata and read-only workflow', () => {
  it('shows per-section loading without fake counts or active absence', () => {
    setup(() => new Promise(() => {}))
    expect(screen.getAllByRole('status', { name: 'Memuat data' })).toHaveLength(21)
    expect(screen.queryByText('Belum ada jadwal aktif.')).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Memperbarui dashboard…' })).toBeDisabled()
  })
  it.each(resources.map((resource, index) => ({ ...resource, index })))('reads $label totals, active and inactive from filtered metadata, not one row', async ({ label, key, index }) => {
    setup()
    await settled()
    for (const [offset, name] of ['Total', 'Aktif', 'Nonaktif'].entries()) {
      expect(within(screen.getByRole('group', { name: `${label} ${name}` })).getByText(String([12 + index, 9 + index, 3][offset]))).toBeInTheDocument()
    }
    const calls = requests.filter(({ url }) => url.pathname.endsWith(`/${key}`))
    expect(calls).toHaveLength(3)
    expect(calls.map(({ url }) => url.searchParams.get('is_active')).sort()).toEqual(['all', 'false', 'true'])
    for (const { url } of calls) expect(Object.fromEntries(url.searchParams)).toEqual({ page: '1', page_size: '1', sort_by: 'id', sort_order: 'asc', is_active: url.searchParams.get('is_active') })
  })
  it('renders healthy components and the backend check timestamp', async () => {
    setup()
    await settled()
    expect(region('System Health').getByText('healthy')).toBeInTheDocument()
    expect(region('System Health').getAllByText('available')).toHaveLength(3)
    expect(region('System Health').getByText(formatTimestamp(f.timestamp))).toHaveAttribute('datetime', f.timestamp)
  })
  it('renders real empty master metadata without suggesting CSP readiness', async () => {
    setup((url) => resources.some(({ key }) => url.pathname.endsWith(`/${key}`)) ? f.jsonResponse({ data: [], meta: { page: 1, page_size: 1, total_items: 0, total_pages: 0 } }) : response(url))
    await settled()
    for (const { label } of resources) {
      for (const status of ['Total', 'Aktif', 'Nonaktif']) expect(within(screen.getByRole('group', { name: `${label} ${status}` })).getByText('0')).toBeInTheDocument()
    }
    expect(document.body.textContent).not.toMatch(/CSP Ready|siap dijadwalkan/i)
  })
  it('rejects malformed health data without inventing component states', async () => {
    setup((url) => url.pathname.endsWith('/health') ? f.jsonResponse({ data: { status: 'healthy' } }) : response(url))
    await settled()
    expect(region('System Health').getByRole('alert')).toBeInTheDocument()
    expect(region('System Health').queryByText('available')).not.toBeInTheDocument()
    expect(region('System Health').queryByText('healthy')).not.toBeInTheDocument()
  })
  it('treats degraded HTTP 503 as valid data, not a request failure', async () => {
    setup((url) => url.pathname.endsWith('/health') ? f.jsonResponse({ data: f.degraded }, 503) : response(url))
    await settled()
    expect(region('System Health').getByText('degraded')).toBeInTheDocument()
    expect(region('System Health').getByText('unavailable')).toBeInTheDocument()
    expect(region('System Health').queryByRole('alert')).not.toBeInTheDocument()
  })
  it('does not invent unavailable components on a health network failure', async () => {
    setup((url) => url.pathname.endsWith('/health') ? fail() : response(url))
    await settled()
    expect(region('System Health').getByText('Status saat ini tidak diketahui.')).toBeInTheDocument()
    expect(region('System Health').queryByText('unavailable')).not.toBeInTheDocument()
    expect(screen.queryByText(/private-local-path/)).not.toBeInTheDocument()
    expect(region('Jadwal aktif').getByText('Versi #21')).toBeInTheDocument()
  })
  it('distinguishes an empty active response from unknown', async () => {
    setup((url) => url.pathname.endsWith('/jadwal/aktif') ? f.jsonResponse({ data: null }) : response(url))
    await settled()
    expect(region('Jadwal aktif').getByText(/Belum ada jadwal aktif/)).toBeInTheDocument()
    expect(region('Jadwal aktif').getByRole('link', { name: 'Buka Constraint Studio' })).toHaveAttribute('href', '/constraint-studio')
    expect(region('Ringkasan riwayat').getByText('Versi terbaru #21')).toBeInTheDocument()
  })
  it('shows only snapshot summary, version, revision and timestamp for the active schedule', async () => {
    setup()
    await settled()
    const active = region('Jadwal aktif')
    expect(active.getByText('Versi #21')).toBeInTheDocument()
    expect(active.getByText('Aktif')).toBeInTheDocument()
    expect(active.getByText('1 assignment · 1 praktikum')).toBeInTheDocument()
    expect(active.getByText('Source revision: 7')).toBeInTheDocument()
    expect(active.getByText(formatTimestamp(f.saved.created_at))).toHaveAttribute('datetime', f.saved.created_at)
  })
  it('keeps independent summaries when active request fails, without claiming absence', async () => {
    setup((url) => url.pathname.endsWith('/jadwal/aktif') ? fail() : response(url))
    await settled()
    expect(region('Jadwal aktif').getByRole('alert')).toBeInTheDocument()
    expect(region('Jadwal aktif').queryByText(/Belum ada jadwal aktif/)).not.toBeInTheDocument()
    expect(region('System Health').getByText('healthy')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Asisten Total' })).toHaveTextContent('14')
  })
  it('shows genuinely empty history with metadata zero', async () => {
    setup((url) => url.pathname.endsWith('/jadwal/riwayat') ? f.jsonResponse({ data: [], meta: { page: 1, page_size: 1, total_items: 0, total_pages: 0 } }) : response(url))
    await settled()
    expect(region('Ringkasan riwayat').getByText('Belum ada riwayat tersimpan.')).toBeInTheDocument()
    expect(region('Ringkasan riwayat').getByText('0')).toBeInTheDocument()
  })
  it('uses the latest sorted item even when invalid, and the global history metadata', async () => {
    setup()
    await settled()
    expect(region('Ringkasan riwayat').getByText('8')).toBeInTheDocument()
    expect(region('Ringkasan riwayat').getByText('Tidak Valid')).toBeInTheDocument()
    const url = requests.find(({ url }) => url.pathname.endsWith('/jadwal/riwayat'))!.url
    expect(Object.fromEntries(url.searchParams)).toEqual(Object.fromEntries(Object.entries(latestHistoryQuery).map(([key, value]) => [key, String(value)])))
  })
  it('never turns failed history into a zero count', async () => {
    setup((url) => url.pathname.endsWith('/jadwal/riwayat') ? fail() : response(url))
    await settled()
    expect(region('Ringkasan riwayat').getByRole('alert')).toBeInTheDocument()
    expect(region('Ringkasan riwayat').queryByText('0')).not.toBeInTheDocument()
    expect(region('System Health').getByText('healthy')).toBeInTheDocument()
  })
  it('retries only the failed count without hiding the other counts', async () => {
    let failed = true
    const { user } = setup((url) => failed && url.pathname.endsWith('/asisten') && url.searchParams.get('is_active') === 'false' ? fail() : response(url))
    await settled()
    const count = within(screen.getByRole('group', { name: 'Asisten Nonaktif' }))
    expect(count.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Asisten Aktif' })).toHaveTextContent('11')
    const before = requests.length
    failed = false
    await user.click(count.getByRole('button', { name: 'Coba lagi' }))
    await waitFor(() => expect(count.getByText('3')).toBeInTheDocument())
    expect(requests).toHaveLength(before + 1)
  })
  it('refreshes the 21 dashboard queries without clearing unrelated caches or loops', async () => {
    const { user, client, view } = setup()
    client.setQueryData(['unrelated'], 'retained')
    await settled()
    expect(requests).toHaveLength(21)
    await user.click(screen.getByRole('button', { name: 'Refresh dashboard' }))
    await settled()
    expect(requests).toHaveLength(42)
    view.rerender(<QueryClientProvider client={client}><RouterProvider router={routers[0]!} /></QueryClientProvider>)
    await act(async () => { await Promise.resolve() })
    expect(requests).toHaveLength(42)
    expect(client.getQueryData(['unrelated'])).toBe('retained')
  })
  it('labels stale health, counts, active and history after a failed refresh', async () => {
    let failed = false
    const { user } = setup((url) => failed ? fail() : response(url))
    await settled()
    failed = true
    await user.click(screen.getByRole('button', { name: 'Refresh dashboard' }))
    await settled()
    expect(screen.getAllByText(/Data terakhir — kondisi terkini belum terkonfirmasi/)).toHaveLength(21)
    expect(region('System Health').getByText('healthy (status terakhir)')).toBeInTheDocument()
    expect(region('Jadwal aktif').getByText('Aktif (status terakhir)')).toBeInTheDocument()
    expect(region('Ringkasan riwayat').getByText('Tidak Valid (status terakhir)')).toBeInTheDocument()
  })
  it('marks existing cache unconfirmed while a refresh is still pending', async () => {
    setup(() => new Promise(() => {}), (client) => client.setQueryData(queryKeys.schedules.active(), { data: f.saved }))
    expect(region('Jadwal aktif').getByText(/Data terakhir/)).toBeInTheDocument()
    expect(region('Jadwal aktif').getByText('Aktif (status terakhir)')).toBeInTheDocument()
  })
  it('reuses F04 master invalidation across all three count filters', async () => {
    const { client } = setup()
    await settled()
    const before = requests.length
    await act(async () => { await invalidateAfterMasterMutation(client, 'asisten') })
    await settled()
    expect(requests.length - before).toBe(8) // asisten + nested praktikum + active/history
    for (const status of ['all', 'true', 'false'] as const) expect(client.getQueryData(queryKeys.master.list('asisten', countQuery(status)))).toBeDefined()
  })
  it('reuses save invalidation without refetching master or health', async () => {
    const { client } = setup()
    await settled()
    const before = requests.length
    await act(async () => { await invalidateAfterSave(client) })
    await settled()
    expect(requests.slice(before).map(({ url }) => url.pathname).sort()).toEqual(['/api/v1/jadwal/aktif', '/api/v1/jadwal/riwayat'])
  })
  it('provides honest scope rather than fake readiness, optimization or system metrics', async () => {
    setup()
    await settled()
    expect(screen.getByText(/Keberadaan data tidak membuktikan kesiapan CSP/)).toBeInTheDocument()
    expect(screen.getByText(/Health bukan bukti adanya solusi penjadwalan/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/CSP Ready|\d+%|CPU|uptime|utilization|optimalitas|semua FK valid|tidak ada konflik/i)
    expect(document.querySelector('input, select, table')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
  it.each([
    ['Data Master', '/data-master'], ['Availability', '/availability'], ['Constraint Studio', '/constraint-studio'], ['Timetable', '/timetable'], ['Schedule History', '/schedule-history'],
  ])('navigates the accessible %s workflow link without mutation', async (name, path) => {
    const { user, router } = setup()
    await settled()
    const nav = within(screen.getByRole('navigation', { name: 'Alur kerja penjadwalan' }))
    expect(nav.getAllByRole('link')).toHaveLength(5)
    const link = nav.getByRole('link', { name: new RegExp(name) })
    expect(link).toHaveAttribute('href', path)
    link.focus()
    expect(link).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe(path)
    expect(requests).toHaveLength(21)
  })
})
