import type { LucideIcon } from 'lucide-react'
import { Construction } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type PagePlaceholderProps = {
  title: string
  description: string
  icon: LucideIcon
  className?: string
}

export function PagePlaceholder({ title, description, icon: Icon, className }: PagePlaceholderProps) {
  return (
    <Card className={cn('flex min-h-80 flex-col overflow-hidden', className)}>
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground">PREVIEW</span>
      </CardHeader>
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-12 text-center sm:px-10">
        <span className="mb-5 grid size-14 place-items-center rounded-lg border border-primary/15 bg-accent text-primary">
          <Icon size={25} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h3 className="text-base font-medium tracking-tight">Fitur belum tersedia pada tahap F03</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-start gap-2 border-t border-border bg-muted/60 px-5 py-3 text-xs leading-5 text-muted-foreground">
        <Construction size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>Integrasi data dan interaksi fitur akan tersedia pada tahap berikutnya.</span>
      </div>
    </Card>
  )
}
