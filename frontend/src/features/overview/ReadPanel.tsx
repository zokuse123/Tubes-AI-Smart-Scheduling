import type { ReactNode } from 'react'
import { ErrorFeedback, LoadingState } from '@/features/master-data/Feedback'

type ReadState<T> = {
  data: T | undefined
  isPending: boolean
  isFetching: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

export function ReadPanel<T>({ query, children }: { query: ReadState<T>; children: (data: T, unconfirmed: boolean) => ReactNode }) {
  const cached = query.data !== undefined
  const unconfirmed = cached && (query.isFetching || query.isError)
  return <div className="space-y-3">
    {query.isPending && <LoadingState />}
    {unconfirmed && <p role="status" className="rounded border border-primary/30 bg-accent/30 p-2 text-xs">Data terakhir — kondisi terkini belum terkonfirmasi{query.isFetching ? ' (memperbarui).' : ' karena pembaruan gagal.'}</p>}
    {query.isError && <><p className="text-xs text-muted-foreground">Status saat ini tidak diketahui.</p><ErrorFeedback error={query.error} retry={() => { void query.refetch() }} /></>}
    {cached && children(query.data as T, unconfirmed)}
  </div>
}
