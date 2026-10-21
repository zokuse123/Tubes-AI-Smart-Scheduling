import { FlaskConical, Unplug } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { findNavigationItem, navigation } from '@/app/navigation'
import { cn } from '@/lib/utils'

type AppSidebarProps = { mobile?: boolean; onNavigate?: () => void }

export function AppSidebar({ mobile = false, onNavigate }: AppSidebarProps) {
  const { pathname } = useLocation()
  const activePath = findNavigationItem(pathname)?.path
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn('flex h-16 shrink-0 items-center border-b border-sidebar-border px-5', mobile && 'pr-14')}>
        <Link to="/" onClick={onNavigate} aria-label="Smart Lab, beranda" className="flex items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sidebar-ring">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-sidebar-accent/30 bg-sidebar-accent/10 text-sidebar-accent">
            <FlaskConical size={19} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[0.08em]">SMART LAB</span>
            <span className="mt-0.5 block font-mono text-[9px] tracking-wide text-sidebar-muted">Scheduling Intelligence</span>
          </span>
        </Link>
      </div>

      <nav aria-label={mobile ? 'Navigasi utama mobile' : 'Navigasi utama desktop'} className="flex-1 overflow-y-auto px-3 py-6">
        {(['Workspace', 'AI Scheduling'] as const).map((group) => (
          <div key={group} className="mb-7 last:mb-0">
            <p className="mb-2.5 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-muted">{group}</p>
            <ul className="space-y-1">
              {navigation.filter((item) => item.group === group).map(({ path, label, icon: Icon }) => (
                <li key={path}>
                  <Link
                    to={path}
                    aria-current={activePath === path ? 'page' : undefined}
                    onClick={onNavigate}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring',
                      activePath === path
                        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-hover',
                    )}
                  >
                    <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-4">
        <div className="flex items-start gap-2 rounded-md bg-sidebar-hover px-3 py-2.5 text-sidebar-muted">
          <Unplug size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-mono text-[10px] font-medium text-sidebar-foreground">API belum dihubungkan</p>
            <p className="mt-1 text-[11px] leading-4">Antarmuka dalam pengembangan.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
