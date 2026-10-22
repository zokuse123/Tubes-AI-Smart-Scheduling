import { createRoutesFromElements, Route } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AvailabilityPage, ConstraintStudioPage, MasterDataPage, NotFoundPage, OverviewPage, Page, RouteError, ScheduleHistoryPage, TimetablePage } from './LazyPages'

export const appRoutes = createRoutesFromElements(
  <Route element={<AppShell />}>
    <Route errorElement={<RouteError />}>
      <Route path="/" element={<Page key="overview"><OverviewPage /></Page>} />
      <Route path="/data-master" element={<Page key="master"><MasterDataPage /></Page>} />
      <Route path="/availability" element={<Page key="availability"><AvailabilityPage /></Page>} />
      <Route path="/constraint-studio" element={<Page key="studio"><ConstraintStudioPage /></Page>} />
      <Route path="/timetable" element={<Page key="timetable"><TimetablePage /></Page>} />
      <Route path="/schedule-history" element={<Page key="history"><ScheduleHistoryPage /></Page>} />
      <Route path="*" element={<Page key="not-found"><NotFoundPage /></Page>} />
    </Route>
  </Route>,
)
