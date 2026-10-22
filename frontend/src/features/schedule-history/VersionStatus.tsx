import type { ScheduleStatus } from '@/api/types/scheduling'
import { Badge } from '@/components/ui/badge'

export function VersionStatus({ status, unconfirmed = false }: { status: ScheduleStatus; unconfirmed?: boolean }) {
  return <Badge tone={unconfirmed ? 'neutral' : status === 'active' ? 'success' : status === 'invalid' ? 'destructive' : 'neutral'}>{status}{unconfirmed ? ' (status terakhir)' : ''}</Badge>
}
