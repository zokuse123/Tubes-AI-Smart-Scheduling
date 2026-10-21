import { CalendarDays, CalendarRange, Database, History, LayoutDashboard, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { matchPath } from 'react-router'

type NavigationItem = {
  path: string
  label: string
  title: string
  group: 'Workspace' | 'AI Scheduling'
  icon: LucideIcon
}

export const navigation: readonly NavigationItem[] = [
  { path: '/', label: 'Overview', title: 'Overview', group: 'Workspace', icon: LayoutDashboard },
  { path: '/data-master', label: 'Data Master', title: 'Data Master', group: 'Workspace', icon: Database },
  { path: '/availability', label: 'Availability', title: 'Resource Availability', group: 'Workspace', icon: CalendarRange },
  { path: '/constraint-studio', label: 'Constraint Studio', title: 'Constraint Studio', group: 'AI Scheduling', icon: Workflow },
  { path: '/timetable', label: 'Timetable', title: 'Timetable', group: 'AI Scheduling', icon: CalendarDays },
  { path: '/schedule-history', label: 'Schedule History', title: 'Schedule History', group: 'AI Scheduling', icon: History },
]

export function findNavigationItem(pathname: string) {
  return navigation.find((item) => matchPath({ path: item.path, end: true }, pathname))
}
