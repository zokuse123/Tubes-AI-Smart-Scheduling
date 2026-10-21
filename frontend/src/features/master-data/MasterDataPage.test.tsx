import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/api/queryClient'
import { queryKeys } from '@/api/queryKeys'
import { MasterDataPage } from '@/pages/MasterDataPage'
import * as f from '@/api/__tests__/fixtures'
import type { MasterResource } from '@/api/types/master'
import type { FormValues, MasterEntity } from './resources'

type Request = { path: string; method: string; query: URLSearchParams; body: Record<string, unknown>; signal?: AbortSignal | null }
let store: Record<MasterResource, MasterEntity[]>
let override: ((request: Request) => Response | Promise<Response> | undefined) | undefined
const requests: Request[] = []
const clients: ReturnType<typeof createAppQueryClient>[] = []
const fetch = vi.fn<typeof globalThis.fetch>()
const cases: { key: MasterResource; label: string; id: number; create: FormValues; payload: Record<string, unknown>; edit: FormValues; patch: Record<string, unknown> }[] = [
  { key: 'mata-praktikum', label: 'Mata Praktikum', id: 1, create: { nama: 'Mata Baru' }, payload: { nama: 'Mata Baru' }, edit: { nama: 'Mata Diubah' }, patch: { nama: 'Mata Diubah' } },
  { key: 'kelompok', label: 'Kelompok', id: 2, create: { nama: 'Kelompok Baru', jumlah_peserta: '25' }, payload: { nama: 'Kelompok Baru', jumlah_peserta: 25 }, edit: { jumlah_peserta: '26' }, patch: { jumlah_peserta: 26 } },
  { key: 'asisten', label: 'Asisten', id: 3, create: { nama: 'Asisten Baru' }, payload: { nama: 'Asisten Baru' }, edit: { nama: 'Asisten Diubah' }, patch: { nama: 'Asisten Diubah' } },
  { key: 'laboratorium', label: 'Laboratorium', id: 5, create: { nama: 'Lab Baru', kapasitas: '40' }, payload: { nama: 'Lab Baru', kapasitas: 40 }, edit: { kapasitas: '35' }, patch: { kapasitas: 35 } },
  { key: 'slot-waktu', label: 'Slot Waktu', id: 4, create: { hari: '2', jam_mulai: '10:00', jam_selesai: '12:00' }, payload: { hari: 2, jam_mulai: '10:00', jam_selesai: '12:00' }, edit: { hari: '2' }, patch: { hari: 2 } },
  { key: 'praktikum', label: 'Praktikum', id: 11, create: { mata_praktikum_id: '1', kelompok_id: '2', asisten_id: '3' }, payload: { mata_praktikum_id: 1, kelompok_id: 2, asisten_id: 3 }, edit: { asisten_id: '6' }, patch: { asisten_id: 6 } },
]

beforeEach(() => {
  requests.length = 0
  override = undefined
  store = structuredClone({ 'mata-praktikum': [f.mata], kelompok: [f.kelompok], asisten: [f.asisten, { ...f.asisten, id: 6, nama: 'Asisten lainnya' }], laboratorium: [f.lab], 'slot-waktu': [f.slot], praktikum: [f.praktikum] })
  fetch.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const path = url.pathname.replace('/api/v1/', '')
    const request: Request = { path, method: init?.method ?? 'GET', query: url.searchParams, body: typeof init?.body === 'string' ? JSON.parse(init.body) : {}, signal: init?.signal }
    requests.push(request)
    const custom = override?.(request)
    if (custom !== undefined) return custom
    const [name = '', idPart, action] = path.split('/')
    const resource = cases.find((item) => item.key === name)?.key
    if (!resource) throw new Error(`Unexpected test request: ${path}`)
    const id = Number(idPart)
    const rows = store[resource]
    if (request.method === 'GET' && !idPart) {
      let filtered = rows.filter((row) => (url.searchParams.get('is_active') ?? 'true') === 'all' || row.is_active === (url.searchParams.get('is_active') !== 'false'))
      const search = url.searchParams.get('search')?.trim().toLowerCase()
      if (search) filtered = filtered.filter((row) => 'nama' in row && row.nama.toLowerCase().includes(search))
      const page = Number(url.searchParams.get('page') ?? 1)
      const size = Number(url.searchParams.get('page_size') ?? 20)
      return f.jsonResponse({ data: filtered.slice((page - 1) * size, page * size), meta: { page, page_size: size, total_items: filtered.length, total_pages: Math.ceil(filtered.length / size) } })
    }
    if (request.method === 'GET') {
      const data = rows.find((row) => row.id === id)
      return data ? f.jsonResponse({ data }) : f.jsonResponse({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Resource tidak ditemukan.', details: null } }, 404)
    }
    if (request.method === 'POST') {
      const template = cases.find((item) => item.key === resource)!
      const original = ({ 'mata-praktikum': f.mata, kelompok: f.kelompok, asisten: f.asisten, laboratorium: f.lab, 'slot-waktu': f.slot, praktikum: f.praktikum })[resource]
      const data = { ...original, ...request.body, id: Math.max(template.id, ...rows.map((row) => row.id)) + 100 } as MasterEntity
      rows.push(data)
      return f.jsonResponse({ data }, 201)
    }
    if (request.method === 'PATCH') {
      const index = rows.findIndex((row) => row.id === id)
      const existing = rows[index]
      if (!existing) throw new Error('Missing test fixture')
      const data = { ...existing, ...request.body } as MasterEntity
      if (resource === 'praktikum' && !action && 'asisten' in data && typeof request.body.asisten_id === 'number') data.asisten = { id: request.body.asisten_id, nama: 'Asisten lainnya' }
      rows[index] = data
      return f.jsonResponse({ data })
    }
    throw new Error(`Unsupported test method: ${request.method}`)
  })
  vi.stubGlobal('fetch', fetch)
  vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:5000/api/v1')
})
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

function setup() {
  const client = createAppQueryClient()
  clients.push(client)
  render(<QueryClientProvider client={client}><MasterDataPage /></QueryClientProvider>)
  return { user: userEvent.setup(), client }
}
async function selectTab(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('tab', { name: label }))
  await screen.findByRole('table', { name: `Daftar ${label}` })
}
const fieldLabels: Record<string, string> = { nama: 'Nama', jumlah_peserta: 'Jumlah peserta', kapasitas: 'Kapasitas', hari: 'Hari', jam_mulai: 'Jam mulai', jam_selesai: 'Jam selesai', mata_praktikum_id: 'Mata praktikum', kelompok_id: 'Kelompok', asisten_id: 'Asisten' }
async function fill(user: ReturnType<typeof userEvent.setup>, values: FormValues) {
  const dialog = within(screen.getByRole('dialog'))
  for (const [name, value] of Object.entries(values)) {
    const input = dialog.getByLabelText(fieldLabels[name] ?? name)
    if (input instanceof HTMLSelectElement) await user.selectOptions(input, value)
    else if (name.startsWith('jam_')) fireEvent.change(input, { target: { value } })
    else { await user.clear(input); if (value) await user.type(input, value) }
  }
}
async function openDetail(user: ReturnType<typeof userEvent.setup>, label: string, id: number) {
  await user.click(screen.getByRole('button', { name: `Lihat detail ${label} #${id}` }))
  await screen.findByRole('button', { name: 'Ubah data' })
}

describe('six-resource Data Master UI', () => {
  it.each(cases)('$label tab loads only its resource and renders server list/detail/status', async ({ key, label, id }) => {
    const { user } = setup()
    expect(screen.getAllByRole('tab')).toHaveLength(6)
    await selectTab(user, label)
    expect(screen.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true')
    await openDetail(user, label, id)
    expect(requests.some((r) => r.path === `${key}/${id}` && r.method === 'GET')).toBe(true)
    expect(screen.getByText('Dibuat (UTC)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /hapus|delete/i })).not.toBeInTheDocument()
    expect(requests.every((r) => r.method === 'GET')).toBe(true)
  })

  it.each(cases)('creates $label using only its writable payload, then refetches', async ({ key, label, create, payload }) => {
    const { user } = setup()
    await selectTab(user, label)
    await user.click(screen.getByRole('button', { name: `Tambah ${label}` }))
    if (key === 'praktikum') await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan data' })).toBeEnabled())
    await fill(user, create)
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    await screen.findByText('Data berhasil ditambahkan.')
    const writes = requests.filter((r) => r.method === 'POST')
    expect(writes).toHaveLength(1)
    expect(writes[0]?.path).toBe(key)
    expect(writes[0]?.body).toEqual(payload)
    expect(requests.filter((r) => r.path === key && r.method === 'GET').length).toBeGreaterThan(1)
  })

  it.each(cases)('edits $label using a partial PATCH without system fields', async ({ key, label, id, edit, patch }) => {
    const { user } = setup()
    await selectTab(user, label)
    await openDetail(user, label, id)
    await user.click(screen.getByRole('button', { name: 'Ubah data' }))
    if (key === 'praktikum') await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan data' })).toBeEnabled())
    await fill(user, edit)
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    await screen.findByText('Perubahan berhasil disimpan.')
    expect(requests.filter((r) => r.method === 'PATCH').map((r) => ({ path: r.path, body: r.body }))).toEqual([{ path: `${key}/${id}`, body: patch }])
  })

  it.each(cases)('deactivates $label only after confirmation, with a boolean status payload', async ({ key, label, id }) => {
    const { user } = setup()
    await selectTab(user, label)
    await openDetail(user, label, id)
    await user.click(screen.getByRole('button', { name: 'Nonaktifkan' }))
    expect(screen.getByRole('dialog', { name: 'Konfirmasi penonaktifan' })).toBeInTheDocument()
    expect(requests.filter((r) => r.method !== 'GET')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Ya, nonaktifkan' }))
    await screen.findByText('Data berhasil dinonaktifkan.')
    expect(requests.filter((r) => r.method === 'PATCH').map((r) => ({ path: r.path, body: r.body }))).toEqual([{ path: `${key}/${id}/status`, body: { is_active: false } }])
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false)
  })
})

describe('states, validation, and relation integrity', () => {
  it('renders loading, empty, and backend failure/retry states without fake records', async () => {
    store['mata-praktikum'] = []
    let resolve: ((value: Response) => void) | undefined
    override = (r) => r.path === 'mata-praktikum' ? new Promise<Response>((done) => { resolve = done }) : undefined
    const { user } = setup()
    expect(screen.getByRole('status', { name: 'Memuat data' })).toBeInTheDocument()
    await act(async () => { resolve?.(f.jsonResponse({ error: { code: 'DATABASE_BUSY', message: 'Database sedang sibuk.', details: null } }, 503)) })
    expect(await screen.findByRole('alert')).toHaveTextContent('DATABASE_BUSY')
    override = undefined
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    await screen.findByText('Tidak ada data sesuai filter.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('0 record · Tidak ada halaman')).toBeInTheDocument()
  })

  it('renders a detail error with retry instead of presenting stale detail as current', async () => {
    const { user } = setup()
    await selectTab(user, 'Mata Praktikum')
    override = (r) => r.path === 'mata-praktikum/1' ? f.jsonResponse({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Resource tidak ditemukan.', details: null } }, 404) : undefined
    await user.click(screen.getByRole('button', { name: 'Lihat detail Mata Praktikum #1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('RESOURCE_NOT_FOUND')
    expect(screen.queryByRole('button', { name: 'Ubah data' })).not.toBeInTheDocument()
    override = undefined
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    expect(await screen.findByRole('button', { name: 'Ubah data' })).toBeEnabled()
  })

  it.each(['POST', 'PATCH'])('preserves backend field errors for failed %s and allows retry', async (method) => {
    const { user } = setup()
    await selectTab(user, 'Mata Praktikum')
    if (method === 'PATCH') { await openDetail(user, 'Mata Praktikum', 1); await user.click(screen.getByRole('button', { name: 'Ubah data' })) }
    else await user.click(screen.getByRole('button', { name: 'Tambah Mata Praktikum' }))
    await fill(user, { nama: 'Duplikat' })
    override = (r) => r.method === method ? f.jsonResponse({ error: { code: 'DUPLICATE_NAME', message: 'Nama sudah digunakan.', details: { field: 'nama' } } }, 409) : undefined
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('DUPLICATE_NAME')
    expect(screen.getByLabelText('Nama')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    override = undefined
    await fill(user, { nama: 'Nama berbeda' })
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    await screen.findByText(method === 'POST' ? 'Data berhasil ditambahkan.' : 'Perubahan berhasil disimpan.')
  })

  it('does not send PATCH for a normalized no-op edit', async () => {
    const { user } = setup()
    await selectTab(user, 'Mata Praktikum')
    await openDetail(user, 'Mata Praktikum', 1)
    await user.click(screen.getByRole('button', { name: 'Ubah data' }))
    await fill(user, { nama: ` ${f.mata.nama} ` })
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    await screen.findByText('Tidak ada perubahan. Tidak ada request PATCH yang dikirim.')
    expect(requests.some((r) => r.method !== 'GET')).toBe(false)
  })

  it.each(['0', '-1', '1.5', 'true', '1e2', '9007199254740992'])('blocks invalid participant count %s before mutation', async (value) => {
    const { user } = setup()
    await selectTab(user, 'Kelompok')
    await user.click(screen.getByRole('button', { name: 'Tambah Kelompok' }))
    await fill(user, { nama: 'Kelompok', jumlah_peserta: value })
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    expect(await screen.findByText('Harus berupa integer positif yang dapat direpresentasikan dengan aman.')).toBeInTheDocument()
    expect(requests.some((r) => r.method !== 'GET')).toBe(false)
  })

  it('validates required name and the 120-minute slot duration before submitting', async () => {
    const { user } = setup()
    await selectTab(user, 'Mata Praktikum')
    await user.click(screen.getByRole('button', { name: 'Tambah Mata Praktikum' }))
    await fill(user, { nama: '   ' })
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    await screen.findByText('Nama wajib diisi.')
    await user.click(screen.getByRole('button', { name: 'Batal' }))
    await selectTab(user, 'Slot Waktu')
    expect(screen.queryByLabelText('Cari nama')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tambah Slot Waktu' }))
    await fill(user, { hari: '1', jam_mulai: '08:00', jam_selesai: '09:00' })
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    await screen.findByText('Durasi slot harus tepat 120 menit pada hari yang sama.')
    expect(requests.some((r) => r.method !== 'GET')).toBe(false)
  })

  it('keeps overlap rejection from SQLite visible without removing the form', async () => {
    const { user } = setup()
    await selectTab(user, 'Slot Waktu')
    await user.click(screen.getByRole('button', { name: 'Tambah Slot Waktu' }))
    await fill(user, { hari: '1', jam_mulai: '09:00', jam_selesai: '11:00' })
    override = (r) => r.method === 'POST' ? f.jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Data melanggar constraint database.', details: null } }, 422) : undefined
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('VALIDATION_ERROR')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('disables Praktikum creation when an active reference catalog is empty', async () => {
    store.asisten = []
    const { user } = setup()
    await selectTab(user, 'Praktikum')
    await user.click(screen.getByRole('button', { name: 'Tambah Praktikum' }))
    await screen.findByText('Referensi aktif belum lengkap. Tambahkan mata praktikum, kelompok, dan asisten aktif terlebih dahulu.')
    expect(screen.getByRole('button', { name: 'Simpan data' })).toBeDisabled()
    expect(within(screen.getByRole('combobox', { name: 'Asisten' })).getAllByRole('option')).toHaveLength(1)
    expect(requests.some((r) => r.method !== 'GET')).toBe(false)
  })

  it('loads reference catalogs past the first 100 rows and allows duplicate Praktikum FK combinations', async () => {
    store.asisten = Array.from({ length: 101 }, (_, index) => ({ ...f.asisten, id: index + 1, nama: `Asisten referensi ${index + 1}` }))
    const { user } = setup()
    await selectTab(user, 'Praktikum')
    await user.click(screen.getByRole('button', { name: 'Tambah Praktikum' }))
    await screen.findByRole('option', { name: 'Asisten referensi 101 · ID #101' })
    expect(requests.some((r) => r.path === 'asisten' && r.query.get('page') === '2' && r.query.get('page_size') === '100')).toBe(true)
    await fill(user, { mata_praktikum_id: '1', kelompok_id: '2', asisten_id: '3' })
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    await screen.findByText('Data berhasil ditambahkan.')
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({ mata_praktikum_id: 1, kelompok_id: 2, asisten_id: 3 })
  })

  it('shows safe inactive-reference errors and maps fields returned as a dictionary', async () => {
    const { user } = setup()
    await selectTab(user, 'Praktikum')
    await user.click(screen.getByRole('button', { name: 'Tambah Praktikum' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan data' })).toBeEnabled())
    await fill(user, { mata_praktikum_id: '1', kelompok_id: '2', asisten_id: '3' })
    override = (r) => r.method === 'POST' ? f.jsonResponse({ error: { code: 'INACTIVE_REFERENCE', message: 'Referensi harus aktif.', details: { fields: { asisten_id: 'Asisten sudah nonaktif.' } } } }, 409) : undefined
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('INACTIVE_REFERENCE')
    expect(screen.getByText('Asisten sudah nonaktif.')).toBeInTheDocument()
  })

  it('shows the inactive current FK but permits selecting only active replacements', async () => {
    store.asisten = store.asisten.map((a) => ({ ...a, is_active: a.id !== 3 }))
    const { user } = setup()
    await selectTab(user, 'Praktikum')
    await openDetail(user, 'Praktikum', 11)
    await user.click(screen.getByRole('button', { name: 'Ubah data' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan data' })).toBeEnabled())
    expect(screen.getByRole('option', { name: 'Referensi saat ini #3 — tidak tersedia untuk dipilih' })).toBeDisabled()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Asisten' }), '6')
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    await screen.findByText('Perubahan berhasil disimpan.')
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ asisten_id: 6 })
  })
})

describe('pagination, cancellation, and mutation safety', () => {
  it.each(['😀'.repeat(100), '  50%_praktikum  '])('sends valid literal search without wildcard expansion or a UTF-16 length limit', async (search) => {
    const { user } = setup()
    await selectTab(user, 'Mata Praktikum')
    fireEvent.change(screen.getByLabelText('Cari nama'), { target: { value: search } })
    await user.click(screen.getByRole('button', { name: 'Cari' }))
    await waitFor(() => expect(requests.at(-1)?.query.get('search')).toBe(search.trim()))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects search exceeding 100 characters after trim without a request', async () => {
    const { user } = setup()
    await selectTab(user, 'Mata Praktikum')
    const count = requests.length
    fireEvent.change(screen.getByLabelText('Cari nama'), { target: { value: 'a'.repeat(101) } })
    await user.click(screen.getByRole('button', { name: 'Cari' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pencarian maksimum 100 karakter setelah trim.')
    expect(requests).toHaveLength(count)
  })

  it('sends only a changed FK while retaining an unchanged inactive reference', async () => {
    store.asisten = store.asisten.map((row) => ({ ...row, is_active: row.id !== 3 }))
    store.kelompok.push({ ...f.kelompok, id: 7, nama: 'Kelompok pengganti' })
    const { user } = setup()
    await selectTab(user, 'Praktikum')
    await openDetail(user, 'Praktikum', 11)
    await user.click(screen.getByRole('button', { name: 'Ubah data' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan data' })).toBeEnabled())
    await fill(user, { kelompok_id: '7' })
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    await screen.findByText('Perubahan berhasil disimpan.')
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ kelompok_id: 7 })
  })

  it('supports keyboard dismissal and restores focus to the dialog opener', async () => {
    const { user } = setup()
    await selectTab(user, 'Mata Praktikum')
    const opener = screen.getByRole('button', { name: 'Tambah Mata Praktikum' })
    await user.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
    expect(requests.some((r) => r.method !== 'GET')).toBe(false)
  })

  it('blocks submission on reference failure and permits an explicit retry', async () => {
    override = (r) => r.path === 'asisten' ? f.jsonResponse({ error: { code: 'DATABASE_BUSY', message: 'Database sedang sibuk.', details: null } }, 503) : undefined
    const { user } = setup()
    await selectTab(user, 'Praktikum')
    await user.click(screen.getByRole('button', { name: 'Tambah Praktikum' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('DATABASE_BUSY')
    expect(screen.getByRole('button', { name: 'Simpan data' })).toBeDisabled()
    override = undefined
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan data' })).toBeEnabled())
    expect(requests.some((r) => r.method !== 'GET')).toBe(false)
  })

  it('uses server pagination and resets the page for search, status, and sorting', async () => {
    store['mata-praktikum'] = Array.from({ length: 21 }, (_, index) => ({ ...f.mata, id: index + 1, nama: `Mata ${index + 1}` }))
    const { user } = setup()
    await selectTab(user, 'Mata Praktikum')
    expect(screen.getByText('21 record · Halaman 1 dari 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Selanjutnya' }))
    await screen.findByText('Mata 21')
    expect(screen.getByText('21 record · Halaman 2 dari 2')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Cari nama'), 'Mata 1')
    await user.click(screen.getByRole('button', { name: 'Cari' }))
    await screen.findByText('11 record · Halaman 1 dari 1')
    await user.selectOptions(screen.getByLabelText('Urutkan'), 'updated_at')
    await waitFor(() => expect(requests.at(-1)?.query.get('sort_by')).toBe('updated_at'))
    await user.selectOptions(screen.getByLabelText('Status'), 'all')
    await waitFor(() => expect(requests.at(-1)?.query.get('is_active')).toBe('all'))
  })

  it('cancels a departing tab request and never displays its late response in another resource', async () => {
    let resolve: ((response: Response) => void) | undefined
    override = (r) => r.path === 'mata-praktikum' ? new Promise<Response>((done) => { resolve = done }) : undefined
    const { user } = setup()
    await waitFor(() => expect(requests).toHaveLength(1))
    const oldSignal = requests[0]?.signal
    await selectTab(user, 'Kelompok')
    expect(oldSignal?.aborted).toBe(true)
    await act(async () => { resolve?.(f.jsonResponse({ data: [{ ...f.mata, nama: 'Respons tab lama' }], meta: f.meta })) })
    expect(screen.queryByText('Respons tab lama')).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Daftar Kelompok' })).toHaveTextContent(f.kelompok.nama)
  })

  it('activates inactive data after confirmation and leaves historical status to the backend', async () => {
    store['mata-praktikum'][0] = { ...f.mata, is_active: false }
    const { user } = setup()
    await screen.findByText('Tidak ada data sesuai filter.')
    await user.selectOptions(screen.getByLabelText('Status'), 'false')
    await screen.findByRole('table')
    await openDetail(user, 'Mata Praktikum', 1)
    await user.click(screen.getByRole('button', { name: 'Aktifkan' }))
    expect(screen.getByText('Reaktivasi data tidak mengaktifkan kembali jadwal yang sudah invalid.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ya, aktifkan' }))
    await screen.findByText('Data berhasil diaktifkan.')
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ is_active: true })
  })

  it('preserves server status rejection without optimistic changes', async () => {
    const { user } = setup()
    await selectTab(user, 'Mata Praktikum')
    await openDetail(user, 'Mata Praktikum', 1)
    await user.click(screen.getByRole('button', { name: 'Nonaktifkan' }))
    override = (r) => r.method === 'PATCH' ? f.jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Data melanggar constraint database.', details: null } }, 422) : undefined
    await user.click(screen.getByRole('button', { name: 'Ya, nonaktifkan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('VALIDATION_ERROR')
    expect(store['mata-praktikum'][0]?.is_active).toBe(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('keeps pending create controls disabled and invalidates only related caches after success', async () => {
    const { user, client } = setup()
    const unrelated = queryKeys.master.list('laboratorium')
    const schedule = queryKeys.schedules.active()
    client.setQueryData(unrelated, { marker: true })
    client.setQueryData(schedule, { data: null })
    await selectTab(user, 'Mata Praktikum')
    await user.click(screen.getByRole('button', { name: 'Tambah Mata Praktikum' }))
    await fill(user, { nama: 'Nama baru' })
    let resolve: ((response: Response) => void) | undefined
    override = (r) => r.method === 'POST' ? new Promise<Response>((done) => { resolve = done }) : undefined
    await user.click(screen.getByRole('button', { name: 'Simpan data' }))
    expect(await screen.findByRole('button', { name: 'Menyimpan…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Batal' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tutup dialog' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const row = { ...f.mata, id: 101, nama: 'Nama baru' }
    store['mata-praktikum'].push(row)
    override = undefined
    await act(async () => { resolve?.(f.jsonResponse({ data: row }, 201)) })
    await screen.findByText('Data berhasil ditambahkan.')
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1)
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false)
    expect(client.getQueryState(schedule)?.isInvalidated).toBe(true)
    expect(client.getQueryData(unrelated)).toEqual({ marker: true })
  })
})
