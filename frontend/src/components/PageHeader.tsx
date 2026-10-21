import { Badge } from '@/components/ui/badge'

type PageHeaderProps = { title: string; description: string; section: string }

export function PageHeader({ title, description, section }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-end">
      <div>
        <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-primary">{section}</p>
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <Badge className="shrink-0" tone="accent">F03 · Pratinjau antarmuka</Badge>
    </div>
  )
}
