import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppQueryClient } from '@/api/queryClient'
import { appRoutes } from '@/app/routes'

const pages = [
  { path: '/', title: 'Overview', link: 'Overview' },
  { path: '/data-master', title: 'Data Master', link: 'Data Master' },
  { path: '/availability', title: 'Resource Availability', link: 'Availability' },
  { path: '/constraint-studio', title: 'Constraint Studio', link: 'Constraint Studio' },
  { path: '/timetable', title: 'Timetable', link: 'Timetable' },
  { path: '/schedule-history', title: 'Schedule History', link: 'Schedule History' },
]

const clients: ReturnType<typeof createAppQueryClient>[] = []
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((input) => Promise.resolve(new Response(JSON.stringify(String(input).endsWith('/jadwal/aktif') ? { data: null } : { data: [], meta: { page: 1, page_size: 20, total_items: 0, total_pages: 0 } }), { status: 200 }))))
})
function renderPage(path = '/') {
  const client = createAppQueryClient()
  clients.push(client)
  return render(<QueryClientProvider client={client}><RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} /></QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.unstubAllGlobals()
})

describe('application shell and routing', () => {
  it('renders shared landmarks, a skip link, and the complete sidebar inventory', () => {
    renderPage()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lewati ke konten utama' })).toHaveAttribute('href', '#main-content')
    const nav = within(screen.getByRole('navigation', { name: 'Navigasi utama desktop' }))
    expect(nav.getAllByRole('link')).toHaveLength(6)
    for (const page of pages) {
      expect(nav.getByRole('link', { name: page.link })).toHaveAttribute('href', page.path)
    }
  })

  it.each(pages)('renders $path and marks only its own sidebar link active', ({ path, title, link }) => {
    renderPage(path)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(document.title).toBe(`${title} | Smart Lab Scheduling System`)
    const nav = screen.getByRole('navigation', { name: 'Navigasi utama desktop' })
    expect(within(nav).getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page')
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('navigates client-side while retaining the shared shell', async () => {
    const user = userEvent.setup()
    renderPage()
    const main = screen.getByRole('main')
    const nav = within(screen.getByRole('navigation', { name: 'Navigasi utama desktop' }))
    for (const { title, link } of pages.slice(1)) {
      await user.click(nav.getByRole('link', { name: link }))
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
      expect(screen.getByRole('main')).toBe(main)
    }
  })

  it.each(['/does-not-exist', '/data-master/does-not-exist'])('renders 404 for %s with no active navigation item', async (path) => {
    const user = userEvent.setup()
    renderPage(path)
    expect(screen.getByRole('heading', { level: 1, name: 'Halaman tidak ditemukan' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Navigasi utama desktop' }).querySelector('[aria-current]')).toBeNull()
    await user.click(screen.getByRole('link', { name: 'Kembali ke Overview' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
  })

  it('accepts a trailing slash and still marks the correct route active', () => {
    renderPage('/data-master/')
    expect(screen.getByRole('heading', { level: 1, name: 'Data Master' })).toBeInTheDocument()
    const nav = within(screen.getByRole('navigation', { name: 'Navigasi utama desktop' }))
    expect(nav.getByRole('link', { name: 'Data Master' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('mobile navigation', () => {
  it('opens an accessible drawer and closes it with focus restored to the trigger', async () => {
    const user = userEvent.setup()
    renderPage()
    const trigger = screen.getByRole('button', { name: 'Buka navigasi' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Navigasi aplikasi' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByRole('navigation', { name: 'Navigasi utama mobile' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Tutup navigasi' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps keyboard focus in the drawer and supports Escape', async () => {
    const user = userEvent.setup()
    renderPage()
    const trigger = screen.getByRole('button', { name: 'Buka navigasi' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog')
    for (let step = 0; step < 10; step += 1) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('navigates to the selected mobile route and closes the drawer', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Buka navigasi' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('link', { name: 'Schedule History' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Schedule History' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the drawer when the viewport switches to desktop and removes the listener on unmount', async () => {
    const user = userEvent.setup()
    let onChange: (() => void) | undefined
    const desktop = {
      matches: false,
      addEventListener: vi.fn((_event: string, callback: () => void) => { onChange = callback }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn(() => desktop))
    const view = renderPage()
    await user.click(screen.getByRole('button', { name: 'Buka navigasi' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => {
      desktop.matches = true
      onChange?.()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.unmount()
    expect(desktop.removeEventListener).toHaveBeenCalledWith('change', onChange)
  })
})

describe('honest feature placeholders', () => {
  it.each(pages.filter((page) => page.path === '/'))('$path discloses the unavailable state without business data or API calls', ({ path }) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    renderPage(path)
    const main = screen.getByRole('main')
    expect(within(main).getAllByText('Fitur belum tersedia pada tahap F03').length).toBeGreaterThan(0)
    expect(screen.getByText('Workspace lokal')).toBeInTheDocument()
    expect(within(main).queryByRole('table')).not.toBeInTheDocument()
    expect(main.querySelector('input, select, time')).toBeNull()
    expect(within(main).queryByRole('button')).not.toBeInTheDocument()
    expect(main.textContent).not.toMatch(/SATISFIABLE|UNSATISFIABLE|PUBLISHED|Semester Ganjil|KLP-\d+|2024\/2025/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
