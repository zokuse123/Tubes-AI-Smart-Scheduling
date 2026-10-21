import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Outlet, useLocation } from 'react-router'
import { findNavigationItem } from '@/app/navigation'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { Button } from '@/components/ui/button'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const currentPage = findNavigationItem(pathname)
  const title = currentPage?.title ?? 'Halaman tidak ditemukan'

  useEffect(() => {
    document.title = `${title} | Smart Lab Scheduling System`
  }, [title])

  useEffect(() => {
    if (!window.matchMedia) return
    const desktop = window.matchMedia('(min-width: 64rem)')
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  return (
    <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
      <a href="#main-content" className="sr-only fixed left-4 top-3 z-[60] rounded-md bg-card px-4 py-2 font-medium text-foreground shadow-md focus:not-sr-only focus-visible:outline-2 focus-visible:outline-ring">
        Lewati ke konten utama
      </a>
      <aside aria-label="Sidebar aplikasi" className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border lg:block">
        <AppSidebar />
      </aside>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/55 lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[calc(100vw-2rem)] border-r border-sidebar-border bg-sidebar shadow-xl outline-none lg:hidden">
          <Dialog.Title className="sr-only">Navigasi aplikasi</Dialog.Title>
          <Dialog.Description className="sr-only">Pilih halaman Smart Lab Scheduling System.</Dialog.Description>
          <AppSidebar mobile onNavigate={() => setMobileOpen(false)} />
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Tutup navigasi" className="absolute right-3 top-3 size-10 text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-sidebar-ring">
              <X size={19} aria-hidden="true" />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>

      <div className="flex min-h-svh flex-col lg:pl-64">
        <AppHeader title={title} />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1600px] flex-1 p-4 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-ring sm:p-6 lg:p-8">
          <Outlet />
        </main>
        <footer className="mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-border py-4 text-[11px] text-muted-foreground sm:mx-6 lg:mx-8">
          <span>Smart Lab Scheduling System</span>
          <span className="font-mono text-[10px]">React / Flask / SQLite / SWI-Prolog</span>
        </footer>
      </div>
    </Dialog.Root>
  )
}
