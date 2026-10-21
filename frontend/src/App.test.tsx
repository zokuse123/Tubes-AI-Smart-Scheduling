import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '@/App'
import { AppProviders } from '@/app/providers'

describe('frontend scaffold', () => {
  it('renders the initial Smart Lab landing view', () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    expect(screen.getByRole('heading', { name: 'Smart Lab Scheduling System' })).toBeInTheDocument()
    expect(screen.getByText('Fondasi frontend berhasil dijalankan')).toBeInTheDocument()
    expect(screen.getByText('SWI-Prolog')).toBeInTheDocument()
  })
})
