import { formatTimestamp } from '@/lib/presentation'

export function Timestamp({ value }: { value: string | null | undefined }) {
  const label = formatTimestamp(value)
  return label === 'Waktu tidak tersedia' ? <span>{label}</span> : <time dateTime={value!} title={`${value} (UTC)`}>{label}</time>
}
