import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

export const OverviewPage = lazy(() => import('@/pages/OverviewPage').then((module) => ({ default: module.OverviewPage })))
export const MasterDataPage = lazy(() => import('@/pages/MasterDataPage').then((module) => ({ default: module.MasterDataPage })))
export const AvailabilityPage = lazy(() => import('@/pages/AvailabilityPage').then((module) => ({ default: module.AvailabilityPage })))
export const ConstraintStudioPage = lazy(() => import('@/pages/ConstraintStudioPage').then((module) => ({ default: module.ConstraintStudioPage })))
export const TimetablePage = lazy(() => import('@/pages/TimetablePage').then((module) => ({ default: module.TimetablePage })))
export const ScheduleHistoryPage = lazy(() => import('@/pages/ScheduleHistoryPage').then((module) => ({ default: module.ScheduleHistoryPage })))
export const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))

export function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p role="status" className="rounded-lg border border-border bg-card p-6">Memuat halaman… Navigasi tetap tersedia.</p>}>{children}</Suspense>
}

// A route import failure must not replace the shell or expose internal errors.
export function RouteError() {
  return <section role="alert" className="space-y-4 rounded-lg border border-border bg-card p-6">
    <h1 className="text-lg font-semibold">Halaman belum dapat dimuat</h1>
    <p>Periksa koneksi, lalu muat ulang halaman. Data yang belum disimpan tidak akan dipulihkan otomatis.</p>
    <a href={window.location.pathname} className="inline-block rounded text-primary underline focus-visible:outline-2 focus-visible:outline-ring">Muat ulang halaman</a>
    <p><Link to="/" className="rounded text-primary underline focus-visible:outline-2 focus-visible:outline-ring">Kembali ke Overview</Link></p>
  </section>
}
