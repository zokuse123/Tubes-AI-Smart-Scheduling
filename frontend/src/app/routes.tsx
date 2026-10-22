import { createRoutesFromElements, Route } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AvailabilityPage } from '@/pages/AvailabilityPage'
import { ConstraintStudioPage } from '@/pages/ConstraintStudioPage'
import { MasterDataPage } from '@/pages/MasterDataPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { ScheduleHistoryPage } from '@/pages/ScheduleHistoryPage'
import { TimetablePage } from '@/pages/TimetablePage'

export const appRoutes = createRoutesFromElements(
  <Route element={<AppShell />}>
    <Route path="/" element={<OverviewPage />} />
    <Route path="/data-master" element={<MasterDataPage />} />
    <Route path="/availability" element={<AvailabilityPage />} />
    <Route path="/constraint-studio" element={<ConstraintStudioPage />} />
    <Route path="/timetable" element={<TimetablePage />} />
    <Route path="/schedule-history" element={<ScheduleHistoryPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Route>,
)
