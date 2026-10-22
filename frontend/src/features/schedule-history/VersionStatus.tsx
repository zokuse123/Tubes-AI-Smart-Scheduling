import type { ScheduleStatus } from '@/api/types/scheduling'
import { Badge } from '@/components/ui/badge'
import { scheduleStatusLabels } from '@/lib/presentation'

export function VersionStatus({ status, unconfirmed = false }: { status: ScheduleStatus; unconfirmed?: boolean }) {
  return <Badge tone={unconfirmed ? 'neutral' : status === 'active' ? 'success' : status === 'invalid' ? 'destructive' : 'neutral'}>{scheduleStatusLabels[status]}{unconfirmed ? ' (status terakhir)' : ''}</Badge>
}
