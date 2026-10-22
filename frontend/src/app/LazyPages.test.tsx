import { lazy } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { AppShell } from '@/components/layout/AppShell'
import { createAppQueryClient } from '@/api/queryClient'
import { Page, RouteError } from './LazyPages'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('keeps the real shell/providers mounted during loading and a rejected lazy import', async () => {
  const client = createAppQueryClient()
  client.setQueryData(['retained'], { value: 'unchanged' })
  let reject!: (error: Error) => void
  const LazyFailure = lazy(() => new Promise<{ default: () => null }>((_resolve, fail) => { reject = fail }))
  const error = new Error('controlled failed dynamic import; internal path must remain hidden')
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const router = createMemoryRouter([{ element: <AppShell />, children: [{
    path: '/', errorElement: <RouteError />, element: <Page><LazyFailure /></Page>,
  }] }])
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  const main = screen.getByRole('main')
  const nav = screen.getByRole('navigation', { name: 'Navigasi utama desktop' })
  expect(screen.getByRole('status')).toHaveTextContent('Memuat halaman')
  await act(async () => { reject(error) })
  expect(await screen.findByRole('heading', { name: 'Halaman belum dapat dimuat' })).toBeInTheDocument()
  expect(screen.getByRole('main')).toBe(main)
  expect(screen.getByRole('navigation', { name: 'Navigasi utama desktop' })).toBe(nav)
  expect(screen.getByRole('link', { name: 'Muat ulang halaman' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('alert')).not.toHaveTextContent(error.message)
  expect(client.getQueryData(['retained'])).toEqual({ value: 'unchanged' })
  expect(consoleError).toHaveBeenCalled() // Deliberate failure only; browser happy paths still forbid errors.
  view.unmount()
  client.clear()
})
