import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Timestamp } from '@/components/Timestamp'
import { VersionStatus } from '@/features/schedule-history/VersionStatus'
import { formatTimestamp, scheduleStatusLabels } from './presentation'

afterEach(cleanup)
describe('presentation does not mutate API values', () => {
  it('converts UTC to Asia/Jakarta with a visible WIB label', () => {
    expect(formatTimestamp('2026-10-18T08:30:00.000Z')).toBe('18 Okt 2026, 15.30.00 WIB')
  })
  it('handles the next local date at midnight', () => {
    expect(formatTimestamp('2026-12-31T17:00:00.000Z')).toBe('01 Jan 2027, 00.00.00 WIB')
  })
  it.each([null, undefined, '', 'invalid', '2026-02-30T08:30:00.000Z', '2026-10-18T08:30:00', '2026-10-18T08:30:00+07:00'])('handles missing/invalid/ambiguous timestamp %s safely', (value) => {
    expect(formatTimestamp(value)).toBe('Waktu tidak tersedia')
  })
  it('retains the original UTC value in datetime and tooltip', () => {
    const value = '2026-10-18T08:30:00.000Z'
    render(<Timestamp value={value} />)
    const time = screen.getByText('18 Okt 2026, 15.30.00 WIB')
    expect(time).toHaveAttribute('datetime', value)
    expect(time).toHaveAttribute('title', `${value} (UTC)`)
  })
  it('does not render an invalid datetime attribute', () => {
    const { container } = render(<Timestamp value="invalid" />)
    expect(screen.getByText('Waktu tidak tersedia')).toBeInTheDocument()
    expect(container.querySelector('time')).toBeNull()
  })
  it.each(['active', 'invalid', 'archived'] as const)('labels %s and preserves cached uncertainty', (status) => {
    render(<VersionStatus status={status} unconfirmed />)
    expect(screen.getByText(`${scheduleStatusLabels[status]} (status terakhir)`)).toBeInTheDocument()
    expect(status).toMatch(/^(active|invalid|archived)$/)
  })
})
