import { act, cleanup, render, screen } from '@testing-library/react'
import { isCancelledError, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { appRoutes } from '@/app/routes'
import { AppProviders } from '@/app/providers'
import { invalidateAfterAvailabilityMutation, invalidateAfterMasterMutation, invalidateAfterSave } from '../invalidation'
import { createAppQueryClient } from '../queryClient'
import { queryKeys } from '../queryKeys'
import { mataPraktikumApi } from '../services/master'
import { scheduleApi } from '../services/scheduling'
import type { SavePreviewRequest } from '../types/scheduling'
import * as f from './fixtures'

const clients: QueryClient[] = []
function makeClient() {
  const client = createAppQueryClient()
  clients.push(client)
  return client
}
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.history.replaceState({}, '', '/')
})

describe('query keys and targeted invalidation', () => {
  it('canonicalizes backend defaults, query ordering, and trimmed search', () => {
    expect(queryKeys.master.list('kelompok')).toEqual(queryKeys.master.list('kelompok', { page: 1, page_size: 20, sort_by: 'id', sort_order: 'asc', is_active: 'true' }))
    expect(queryKeys.master.list('kelompok', { search: ' A ', page: 2 })).toEqual(queryKeys.master.list('kelompok', { page: 2, search: 'A' }))
    expect(queryKeys.schedules.historyList()).toEqual(queryKeys.schedules.historyList({ page: 1, page_size: 20, sort_by: 'created_at', sort_order: 'desc', status: 'all' }))
  })

  it('separates resources, entities, owner types, and list/detail/filter keys', () => {
    expect(queryKeys.master.list('asisten')).not.toEqual(queryKeys.master.list('kelompok'))
    expect(queryKeys.master.detail('asisten', 1)).not.toEqual(queryKeys.master.detail('asisten', 2))
    expect(queryKeys.availability.owner('kelompok', 1)).not.toEqual(queryKeys.availability.owner('asisten', 1))
    expect(queryKeys.schedules.historyList({ status: 'invalid' })).not.toEqual(queryKeys.schedules.historyList())
    expect(queryKeys.schedules.historyDetail(1)).not.toEqual(queryKeys.schedules.active())
    expect(queryKeys.health()).toEqual(['health'])
  })

  it('invalidates changed master, nested praktikum, and schedule status caches while retaining unrelated data', async () => {
    const client = makeClient()
    const affected = [queryKeys.master.list('asisten'), queryKeys.master.detail('asisten', 3), queryKeys.master.list('praktikum'), queryKeys.schedules.active(), queryKeys.schedules.historyList(), queryKeys.schedules.historyDetail(21)]
    const unaffected = [queryKeys.master.list('laboratorium'), queryKeys.availability.owner('kelompok', 2), queryKeys.health()]
    for (const key of [...affected, ...unaffected]) client.setQueryData(key, { marker: 'retained' })
    await invalidateAfterMasterMutation(client, 'asisten')
    for (const key of affected) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true)
      expect(client.getQueryData(key)).toEqual({ marker: 'retained' })
    }
    for (const key of unaffected) expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  })

  it('does not invalidate nested praktikum when only a laboratory changes', async () => {
    const client = makeClient()
    const labs = queryKeys.master.list('laboratorium')
    const activities = queryKeys.master.list('praktikum')
    client.setQueryData(labs, [])
    client.setQueryData(activities, [])
    await invalidateAfterMasterMutation(client, 'laboratorium')
    expect(client.getQueryState(labs)?.isInvalidated).toBe(true)
    expect(client.getQueryState(activities)?.isInvalidated).toBe(false)
  })

  it('targets just the changed availability owner plus schedule caches', async () => {
    const client = makeClient()
    const owner = queryKeys.availability.owner('kelompok', 2)
    const otherOwner = queryKeys.availability.owner('asisten', 2)
    const schedule = queryKeys.schedules.active()
    for (const key of [owner, otherOwner, schedule]) client.setQueryData(key, [])
    await invalidateAfterAvailabilityMutation(client, 'kelompok', 2)
    expect(client.getQueryState(owner)?.isInvalidated).toBe(true)
    expect(client.getQueryState(schedule)?.isInvalidated).toBe(true)
    expect(client.getQueryState(otherOwner)?.isInvalidated).toBe(false)
  })

  it('save invalidates schedule reads without removing cached snapshots or clearing master caches', async () => {
    const client = makeClient()
    const history = queryKeys.schedules.historyDetail(21)
    const master = queryKeys.master.list('kelompok')
    client.setQueryData(history, f.historyDetail)
    client.setQueryData(master, [])
    await invalidateAfterSave(client)
    expect(client.getQueryState(history)?.isInvalidated).toBe(true)
    expect(client.getQueryData(history)).toEqual(f.historyDetail)
    expect(client.getQueryState(master)?.isInvalidated).toBe(false)
  })
})

describe('query runtime and provider', () => {
  it('disables automatic query and mutation retries and polling', () => {
    const options = makeClient().getDefaultOptions()
    expect(options.queries).toMatchObject({ retry: false, refetchOnWindowFocus: false, refetchInterval: false })
    expect(options.mutations?.retry).toBe(false)
  })

  it('passes the TanStack query signal through a service and the HTTP client', async () => {
    const client = makeClient()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(f.jsonResponse({ data: [f.mata], meta: f.meta }))
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:5000/api/v1')
    let querySignal: AbortSignal | undefined
    const result = await client.fetchQuery({
      queryKey: queryKeys.master.list('mata-praktikum'),
      queryFn: ({ signal }) => { querySignal = signal; return mataPraktikumApi.list(undefined, { signal }) },
    })
    expect(result.data).toEqual([f.mata])
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(querySignal)
    expect(querySignal).toBeInstanceOf(AbortSignal)
  })

  it('cancels an in-flight query without retrying the request', async () => {
    const client = makeClient()
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:5000/api/v1')
    const queryKey = queryKeys.master.list('mata-praktikum')
    const pending = client.fetchQuery({ queryKey, queryFn: ({ signal }) => mataPraktikumApi.list(undefined, { signal }) }).catch((error: unknown) => error)
    await client.cancelQueries({ queryKey })
    expect(isCancelledError(await pending)).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('never retries a failed save mutation under the application defaults', async () => {
    const client = makeClient()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(f.jsonResponse({ error: { code: 'PREVIEW_CONSUMED', message: 'Sudah disimpan.', details: null } }, 409))
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:5000/api/v1')
    const mutation = client.getMutationCache().build(client, { mutationFn: (payload: SavePreviewRequest) => scheduleApi.save(payload) })
    await expect(mutation.execute({ preview_id: f.sat.preview_id })).rejects.toMatchObject({ code: 'PREVIEW_CONSUMED' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps one QueryClient across provider rerenders and creates an isolated client per mount', () => {
    const observed: QueryClient[] = []
    function Probe({ label }: { label: string }) {
      const client = useQueryClient()
      observed.push(client)
      return <span>{label}</span>
    }
    const first = render(<AppProviders><Probe label="first" /></AppProviders>)
    first.rerender(<AppProviders><Probe label="updated" /></AppProviders>)
    expect(screen.getByText('updated')).toBeInTheDocument()
    expect(observed[0]).toBe(observed[1])
    first.unmount()
    render(<AppProviders><Probe label="second" /></AppProviders>)
    expect(observed[2]).not.toBe(observed[0])
    expect(observed[2]?.getDefaultOptions().mutations?.retry).toBe(false)
  })

  it.each([
    ['/', 'Overview'],
    ['/schedule-history', 'Schedule History'],
  ])('opens the actual provider and %s placeholder without API calls', async (path, title) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', fetch)
    window.history.replaceState({}, '', path)
    render(<AppProviders><RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} /></AppProviders>)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
