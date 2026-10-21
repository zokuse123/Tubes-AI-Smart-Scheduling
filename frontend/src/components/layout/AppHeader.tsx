import { ChevronRight, Menu, PanelsTopLeft } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function AppHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Dialog.Trigger asChild>
          <Button variant="ghost" size="icon" className="size-10 shrink-0 lg:hidden" aria-label="Buka navigasi">
            <Menu size={20} aria-hidden="true" />
          </Button>
        </Dialog.Trigger>
        <PanelsTopLeft size={18} className="hidden shrink-0 text-primary sm:block" aria-hidden="true" />
        <div aria-label="Lokasi halaman" className="flex min-w-0 items-center gap-2 text-xs">
          <span className="hidden shrink-0 font-medium sm:inline">Smart Lab</span>
          <ChevronRight size={13} className="hidden shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
          <span className="truncate text-muted-foreground">{title}</span>
        </div>
      </div>
      <Badge className="shrink-0">UI / F03</Badge>
    </header>
  )
}
