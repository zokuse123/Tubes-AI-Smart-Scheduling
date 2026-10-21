import { useRef } from 'react'
import type { PropsWithChildren } from 'react'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ModalProps = PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; busy?: boolean }>
export function Modal({ open, onOpenChange, title, description, busy = false, children }: ModalProps) {
  const previousFocus = useRef<HTMLElement | null>(null)
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/55" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90svh] w-[calc(100%_-_2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl outline-none sm:p-6"
          onOpenAutoFocus={() => { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
          onCloseAutoFocus={(event) => { event.preventDefault(); const target = previousFocus.current; if (target?.isConnected) target.focus(); else document.getElementById('master-add')?.focus() }}
        >
          <Dialog.Title className="pr-9 text-lg font-semibold tracking-tight">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">{description}</Dialog.Description>
          <Dialog.Close asChild><Button aria-label="Tutup dialog" variant="ghost" size="icon" disabled={busy} className="absolute right-3 top-3"><X aria-hidden="true" /></Button></Dialog.Close>
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
