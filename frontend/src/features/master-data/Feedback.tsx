import { AlertCircle } from 'lucide-react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function ErrorFeedback({ error, retry }: { error: unknown; retry?: () => void }) {
  if (error instanceof ApiError && error.kind === 'aborted') return null
  return (
    <div role="alert" className="rounded-md border border-destructive/25 bg-destructive-muted/30 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-destructive"><AlertCircle size={16} aria-hidden="true" />{error instanceof ApiError ? error.message : 'Terjadi kesalahan. Silakan coba kembali.'}</p>
      {error instanceof ApiError && error.code && <p className="mt-1 font-mono text-xs text-muted-foreground">{error.code}</p>}
      {retry && <Button type="button" variant="outline" className="mt-3" onClick={retry}>Coba lagi</Button>}
    </div>
  )
}
export function StatusBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Aktif' : 'Nonaktif'}</Badge>
}
export function LoadingState() {
  return <div role="status" aria-label="Memuat data" className="space-y-3 p-6"><span className="sr-only">Memuat data…</span>{[0, 1, 2].map((row) => <div key={row} aria-hidden="true" className="h-10 animate-pulse rounded bg-muted motion-reduce:animate-none" />)}</div>
}
