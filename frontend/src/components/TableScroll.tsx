import { useId } from 'react'
import type { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

export function TableScroll({ label, className, children }: PropsWithChildren<{ label: string; className?: string }>) {
  const hint = useId()
  return <div className="min-w-0">
    <p id={hint} className="px-4 py-2 text-xs text-muted-foreground">Tabel dapat digulir horizontal: geser, atau fokuskan area lalu gunakan tombol panah.</p>
    <div role="region" aria-label={label} aria-describedby={hint} tabIndex={0} className={cn('max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-ring', className)}>{children}</div>
  </div>
}
