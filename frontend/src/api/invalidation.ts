import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'
import type { AvailabilityOwner } from './types/availability'
import type { Identifier } from './types/common'
import type { MasterResource } from './types/master'

async function invalidate(client: QueryClient, keys: readonly QueryKey[]) {
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })))
}

/** Call only after a successful mutation. Schedule statuses may have changed. */
export function invalidateAfterMasterMutation(client: QueryClient, resource: MasterResource) {
  const keys: QueryKey[] = [queryKeys.master.resource(resource), queryKeys.schedules.all()]
  if (resource === 'mata-praktikum' || resource === 'kelompok' || resource === 'asisten') {
    keys.push(queryKeys.master.resource('praktikum'))
  }
  return invalidate(client, keys)
}

export function invalidateAfterAvailabilityMutation(client: QueryClient, owner: AvailabilityOwner, id: Identifier) {
  return invalidate(client, [queryKeys.availability.owner(owner, id), queryKeys.schedules.all()])
}

export function invalidateAfterSave(client: QueryClient) {
  return invalidate(client, [queryKeys.schedules.all()])
}
