import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type ScopeItem = { title: string; description: string; icon: LucideIcon }

export function ScopeCard({ title, items, className }: { title: string; items: readonly ScopeItem[]; className?: string }) {
  return (
    <Card className={cn('self-start', className)}>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="divide-y divide-border py-1">
        {items.map(({ title: itemTitle, description, icon: Icon }) => (
          <div key={itemTitle} className="flex gap-3 py-4">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Icon size={16} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-medium">{itemTitle}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
