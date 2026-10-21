import type { AvailabilityOwner } from './types/availability'
import type { Identifier } from './types/common'
import type { MasterQueryMap, MasterResource } from './types/master'
import type { HistoryQuery } from './types/scheduling'

function masterParams(query: MasterQueryMap[MasterResource] = {}) {
  return {
    page: query.page ?? 1,
    page_size: query.page_size ?? 20,
    sort_by: query.sort_by ?? 'id',
    sort_order: query.sort_order ?? 'asc',
    is_active: query.is_active ?? 'true',
    ...('search' in query && query.search !== undefined ? { search: query.search.trim() } : {}),
  }
}

export const queryKeys = {
  health: () => ['health'] as const,
  master: {
    resource: (resource: MasterResource) => ['master', resource] as const,
    lists: (resource: MasterResource) => ['master', resource, 'list'] as const,
    list: <R extends MasterResource>(resource: R, query?: MasterQueryMap[R]) => ['master', resource, 'list', masterParams(query)] as const,
    detail: (resource: MasterResource, id: Identifier) => ['master', resource, 'detail', id] as const,
  },
  availability: {
    owner: (owner: AvailabilityOwner, id: Identifier) => ['availability', owner, id] as const,
  },
  schedules: {
    all: () => ['schedules'] as const,
    active: () => ['schedules', 'active'] as const,
    history: () => ['schedules', 'history'] as const,
    historyList: (query: HistoryQuery = {}) => ['schedules', 'history', 'list', {
      page: query.page ?? 1, page_size: query.page_size ?? 20,
      sort_by: query.sort_by ?? 'created_at', sort_order: query.sort_order ?? 'desc', status: query.status ?? 'all',
    }] as const,
    historyDetail: (id: Identifier) => ['schedules', 'history', 'detail', id] as const,
  },
}
