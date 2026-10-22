import { useQueries, useQuery } from '@tanstack/react-query'
import { healthApi } from '@/api/services/health'
import { scheduleApi } from '@/api/services/scheduling'
import { queryKeys } from '@/api/queryKeys'
import { readList, resources } from '@/features/master-data/resources'

export const countFilters = [
  { value: 'all', label: 'Total' },
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Nonaktif' },
] as const
export const latestHistoryQuery = { page: 1, page_size: 1, sort_by: 'created_at', sort_order: 'desc', status: 'all' } as const
export function countQuery(is_active: 'all' | 'true' | 'false') {
  return { page: 1, page_size: 1, sort_by: 'id', sort_order: 'asc', is_active } as const
}

export function useOverview() {
  // Each count is read directly: subtraction across independent snapshots can invent counts.
  const counts = useQueries({ queries: resources.flatMap(({ key }) => countFilters.map(({ value }) => {
    const filters = countQuery(value)
    return { queryKey: queryKeys.master.list(key, filters), queryFn: ({ signal }: { signal: AbortSignal }) => readList(key, filters, signal) }
  })) })
  const health = useQuery({ queryKey: queryKeys.health(), queryFn: ({ signal }) => healthApi.get({ signal }) })
  const active = useQuery({ queryKey: queryKeys.schedules.active(), queryFn: ({ signal }) => scheduleApi.active({ signal }) })
  const history = useQuery({ queryKey: queryKeys.schedules.historyList(latestHistoryQuery), queryFn: ({ signal }) => scheduleApi.history(latestHistoryQuery, { signal }) })
  const all = [...counts, health, active, history]
  return { counts, health, active, history, refreshing: all.some((query) => query.isFetching), refresh: () => Promise.all(all.map((query) => query.refetch())) }
}
