import { Timestamp } from '@/components/Timestamp'
import { TableScroll } from '@/components/TableScroll'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Plus, RefreshCw } from 'lucide-react'
import { invalidateAfterMasterMutation } from '@/api/invalidation'
import { queryKeys } from '@/api/queryKeys'
import type { MasterResource } from '@/api/types/master'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/controls'
import { ErrorFeedback, LoadingState, StatusBadge } from './Feedback'
import { MasterForm } from './MasterForm'
import { configFor, displayField, readDetail, readList, setRecordStatus } from './resources'
import type { Filters, MasterEntity } from './resources'

export function ResourceWorkspace({ resource }: { resource: MasterResource }) {
  const config = configFor(resource)
  const client = useQueryClient()
  const [filters, setFilters] = useState<Filters>({ page: 1, page_size: 20, is_active: 'true', sort_by: 'id', sort_order: 'asc' })
  const [searchDraft, setSearchDraft] = useState('')
  const [searchError, setSearchError] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editor, setEditor] = useState<{ record?: MasterEntity } | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [statusTarget, setStatusTarget] = useState<MasterEntity | null>(null)
  const [notice, setNotice] = useState('')
  const list = useQuery({ queryKey: queryKeys.master.list(resource, filters), queryFn: ({ signal }) => readList(resource, filters, signal) })
  const detail = useQuery({ queryKey: queryKeys.master.detail(resource, selectedId ?? 0), queryFn: ({ signal }) => readDetail(resource, selectedId!, signal), enabled: selectedId !== null })
  const status = useMutation({
    mutationFn: (record: MasterEntity) => setRecordStatus(resource, record.id, !record.is_active),
    onSuccess: async (result) => {
      await invalidateAfterMasterMutation(client, resource)
      setFilters((current) => ({ ...current, page: 1 }))
      setSelectedId(result.data.id)
      setStatusTarget(null)
      setNotice(result.data.is_active ? 'Data berhasil diaktifkan.' : 'Data berhasil dinonaktifkan.')
    },
  })
  function openStatus(record: MasterEntity) { status.reset(); setStatusTarget(record) }
  function changeFilter(changes: Partial<Filters>) { setFilters((current) => ({ ...current, ...changes, page: 1 })); setSelectedId(null); setNotice('') }
  const record = detail.data?.data

  return (
    <div className="space-y-4">
      {notice && <div role="status" className="rounded-md border border-success/25 bg-success-muted p-4 text-sm"><p className="font-medium text-success">{notice}</p><p className="mt-1 text-xs text-muted-foreground">Validitas jadwal ditentukan backend. Perubahan data dapat memengaruhi jadwal dan preview.</p></div>}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          {config.searchable && <form className="flex min-w-0 flex-1 items-end gap-2" onSubmit={(event) => { event.preventDefault(); const search = searchDraft.trim(); if (Array.from(search).length > 100) { setSearchError('Pencarian maksimum 100 karakter setelah trim.'); return }; setSearchError(''); changeFilter({ search: search || undefined }) }}>
            <div className="min-w-36 flex-1"><label className="mb-1 block text-xs font-medium" htmlFor="master-search">Cari nama</label><Input id="master-search" type="search" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} aria-invalid={!!searchError} aria-describedby={searchError ? 'search-error' : undefined} /></div>
            <Button variant="outline" type="submit" className="h-10">Cari</Button>
          </form>}
          <div><label htmlFor="master-status" className="mb-1 block text-xs font-medium">Status</label><Select id="master-status" value={filters.is_active} onChange={(e) => changeFilter({ is_active: e.target.value as Filters['is_active'] })}><option value="true">Aktif</option><option value="false">Nonaktif</option><option value="all">Semua</option></Select></div>
          <div><label htmlFor="master-sort" className="mb-1 block text-xs font-medium">Urutkan</label><Select id="master-sort" value={filters.sort_by} onChange={(e) => changeFilter({ sort_by: e.target.value as Filters['sort_by'] })}><option value="id">ID</option><option value="created_at">Dibuat</option><option value="updated_at">Diperbarui</option></Select></div>
          <div><label htmlFor="master-order" className="mb-1 block text-xs font-medium">Arah</label><Select id="master-order" value={filters.sort_order} onChange={(e) => changeFilter({ sort_order: e.target.value as Filters['sort_order'] })}><option value="asc">Menaik</option><option value="desc">Menurun</option></Select></div>
          <Button variant="outline" className="h-10" disabled={list.isFetching} onClick={() => { void list.refetch() }} aria-label="Muat ulang daftar"><RefreshCw size={15} aria-hidden="true" /></Button>
          <Button id="master-add" className="h-10" onClick={() => { setFormBusy(false); setEditor({}) }}><Plus size={16} aria-hidden="true" />Tambah {config.label}</Button>
        </CardContent>
        {searchError && <p id="search-error" role="alert" className="px-5 pb-4 text-xs text-destructive">{searchError}</p>}
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Daftar {config.label}</CardTitle>{list.isFetching && !list.isPending && <span role="status" className="text-xs text-muted-foreground">Memperbarui daftar…</span>}</CardHeader>
          {list.isPending ? <LoadingState /> : list.isError ? <div className="p-5"><ErrorFeedback error={list.error} retry={() => { void list.refetch() }} /></div> : !list.data.data.length ? <div className="px-6 py-14 text-center"><Database size={28} className="mx-auto mb-3 text-muted-foreground" aria-hidden="true" /><p className="text-sm font-medium">Tidak ada data sesuai filter.</p><p className="mt-1 text-xs text-muted-foreground">Ubah filter atau tambahkan data baru.</p></div> : (
            <TableScroll label={`Area gulir daftar ${config.label}`}>
              <table aria-label={`Daftar ${config.label}`} className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs text-muted-foreground"><tr><th scope="col" className="px-4 py-3 font-medium">ID</th>{config.fields.map((field) => <th scope="col" key={field.name} className="px-4 py-3 font-medium">{field.label}</th>)}<th scope="col" className="px-4 py-3 font-medium">Status</th><th scope="col" className="px-4 py-3 font-medium">Aksi</th></tr></thead>
                <tbody className="divide-y divide-border">{list.data.data.map((row) => <tr key={row.id} className={selectedId === row.id ? 'bg-accent/40' : 'hover:bg-muted/40'}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{row.id}</td>
                  {config.fields.map((field) => <td key={field.name} className="min-w-28 px-4 py-3">{displayField(row, field.name)}</td>)}
                  <td className="px-4 py-3"><StatusBadge active={row.is_active} /></td>
                  <td className="px-4 py-3"><Button variant="outline" size="sm" disabled={list.isFetching} onClick={() => setSelectedId(row.id)} aria-label={`Lihat detail ${config.label} #${row.id}`}>Detail</Button></td>
                </tr>)}</tbody>
              </table>
            </TableScroll>
          )}
          {list.data && !list.isError && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
            <span>{list.data.meta.total_items} record · {list.data.meta.total_pages > 0 ? `Halaman ${list.data.meta.page} dari ${list.data.meta.total_pages}` : 'Tidak ada halaman'}</span>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={filters.page <= 1 || list.isFetching} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Sebelumnya</Button><Button size="sm" variant="outline" disabled={list.isFetching || filters.page >= list.data.meta.total_pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Selanjutnya</Button></div>
          </div>}
        </Card>

        <Card>
          <CardHeader><CardTitle>Detail {config.label}</CardTitle></CardHeader>
          <CardContent>
            {selectedId === null ? <p className="py-8 text-center text-sm leading-6 text-muted-foreground">Pilih record dari daftar untuk melihat detail.</p> : detail.isPending ? <LoadingState /> : detail.isError ? <ErrorFeedback error={detail.error} retry={() => { void detail.refetch() }} /> : record && <>
              <div className="mb-4 flex items-center justify-between"><span className="font-mono text-xs text-muted-foreground">ID #{record.id}</span><StatusBadge active={record.is_active} /></div>
              {detail.isFetching && <p role="status" className="mb-3 text-xs text-muted-foreground">Memperbarui detail…</p>}
              <dl className="space-y-4">{config.fields.map((field) => <div key={field.name}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="mt-1 break-words text-sm font-medium">{displayField(record, field.name)}</dd></div>)}
                <div><dt className="text-xs text-muted-foreground">Dibuat (WIB)</dt><dd className="mt-1 break-all font-mono text-xs"><Timestamp value={record.created_at} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">Diperbarui (WIB)</dt><dd className="mt-1 break-all font-mono text-xs"><Timestamp value={record.updated_at} /></dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4"><Button variant="outline" disabled={detail.isFetching} onClick={() => { setFormBusy(false); setEditor({ record }) }}>Ubah data</Button><Button variant={record.is_active ? 'destructive' : 'outline'} disabled={detail.isFetching} onClick={() => openStatus(record)}>{record.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Button></div>
            </>}
          </CardContent>
        </Card>
      </div>

      <Modal open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null) }} busy={formBusy} title={`${editor?.record ? 'Ubah' : 'Tambah'} ${config.label}`} description="Isi field yang tersedia. Status diubah terpisah melalui aksi aktivasi atau penonaktifan.">
        {editor && <MasterForm resource={resource} record={editor.record} onBusy={setFormBusy} onCancel={() => setEditor(null)} onComplete={(id, message) => { setEditor(null); setSelectedId(id); setFilters((current) => ({ ...current, page: 1 })); setNotice(message) }} />}
      </Modal>
      <Modal open={statusTarget !== null} onOpenChange={(open) => { if (!open) setStatusTarget(null) }} busy={status.isPending} title={statusTarget?.is_active ? 'Konfirmasi penonaktifan' : 'Konfirmasi aktivasi'} description={statusTarget?.is_active ? 'Penonaktifan dapat memengaruhi kegiatan terkait dan validitas jadwal. Riwayat tetap tersimpan.' : 'Reaktivasi data tidak mengaktifkan kembali jadwal yang sudah invalid.'}>
        {status.isError && <ErrorFeedback error={status.error} />}
        <p className="my-4 text-sm">{config.label} · ID #{statusTarget?.id}</p>
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={status.isPending} onClick={() => setStatusTarget(null)}>Batal</Button><Button variant={statusTarget?.is_active ? 'destructive' : 'default'} disabled={status.isPending} onClick={() => { if (statusTarget) status.mutate(statusTarget) }}>{status.isPending ? 'Menyimpan…' : statusTarget?.is_active ? 'Ya, nonaktifkan' : 'Ya, aktifkan'}</Button></div>
      </Modal>
    </div>
  )
}
