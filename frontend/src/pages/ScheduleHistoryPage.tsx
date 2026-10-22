import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError } from '@/api/errors'
import { scheduleApi } from '@/api/services/scheduling'
import { queryKeys } from '@/api/queryKeys'
import type { HistoryQuery } from '@/api/types/scheduling'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/controls'
import { ErrorFeedback, LoadingState } from '@/features/master-data/Feedback'
import { HistoryDetail } from '@/features/schedule-history/HistoryDetail'
import { VersionStatus } from '@/features/schedule-history/VersionStatus'

export function ScheduleHistoryPage() {
  const [params, setParams] = useState<Required<HistoryQuery>>({ page: 1, page_size: 20, sort_by: 'created_at', sort_order: 'desc', status: 'all' })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const list = useQuery({ queryKey: queryKeys.schedules.historyList(params), queryFn: ({ signal }) => scheduleApi.history(params, { signal }) })
  const detail = useQuery({
    queryKey: queryKeys.schedules.historyDetail(selectedId ?? 0),
    queryFn: async ({ signal }) => {
      const response = await scheduleApi.historyDetail(selectedId!, { signal })
      if (response.data.id !== selectedId) throw new ApiError('protocol', 'Respons detail tidak sesuai ID versi yang dipilih.')
      return response
    },
    enabled: selectedId !== null,
  })
  const selectedRow = list.data?.data.find((row) => row.id === selectedId)
  const missingOnPage = selectedId !== null && list.isSuccess && !list.isFetching && !selectedRow
  const notFound = detail.error instanceof ApiError && detail.error.code === 'RESOURCE_NOT_FOUND'
  const differentStatus = selectedRow && detail.data && !detail.isError && !list.isError && selectedRow.status !== detail.data.data.status
  const meta = list.data?.meta
  const pageLabel = !meta || meta.total_pages === 0 ? 'Tidak ada halaman' : meta.page > meta.total_pages ? `Halaman ${meta.page} di luar ${meta.total_pages} halaman` : `Halaman ${meta.page} dari ${meta.total_pages}`
  function changeParams(changes: Partial<Required<HistoryQuery>>) {
    setParams((current) => ({ ...current, ...changes, page: changes.page ?? 1 }))
    setSelectedId(null)
  }
  function refresh() { void list.refetch(); if (selectedId !== null) void detail.refetch() }

  return <>
    <PageHeader section="AI Scheduling" title="Schedule History" description="Telusuri versi tersimpan dan snapshot historis immutable. Status versi dapat berubah; isi snapshot tidak diganti oleh data master terkini." badge="Read-only · Flask REST API" />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><nav aria-label="Navigasi riwayat" className="flex flex-wrap gap-4 text-sm"><Link to="/timetable" className="rounded text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Buka Timetable</Link><Link to="/constraint-studio" className="rounded text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Buka Constraint Studio</Link></nav><Button variant="outline" disabled={list.isFetching || detail.isFetching} onClick={refresh}>Refresh riwayat</Button></div>
    <Card className="mb-5"><CardContent className="flex flex-wrap items-end gap-4">
      <div><label htmlFor="history-status" className="mb-1.5 block text-xs font-medium">Status versi</label><Select id="history-status" value={params.status} onChange={(event) => changeParams({ status: event.target.value as Required<HistoryQuery>['status'] })}><option value="all">Semua status</option><option value="active">active</option><option value="invalid">invalid</option><option value="archived">archived</option></Select></div>
      <div><label htmlFor="history-sort" className="mb-1.5 block text-xs font-medium">Urutkan riwayat</label><Select id="history-sort" value={params.sort_by} onChange={(event) => changeParams({ sort_by: event.target.value as Required<HistoryQuery>['sort_by'] })}><option value="created_at">Waktu simpan</option><option value="id">ID versi</option></Select></div>
      <div><label htmlFor="history-order" className="mb-1.5 block text-xs font-medium">Arah urutan</label><Select id="history-order" value={params.sort_order} onChange={(event) => changeParams({ sort_order: event.target.value as Required<HistoryQuery>['sort_order'] })}><option value="desc">Terbaru / menurun</option><option value="asc">Terlama / menaik</option></Select></div>
      <div><label htmlFor="history-size" className="mb-1.5 block text-xs font-medium">Versi per halaman</label><Select id="history-size" value={params.page_size} onChange={(event) => changeParams({ page_size: Number(event.target.value) })}>{[20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</Select></div>
    </CardContent></Card>
    <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)]">
      <Card className="min-w-0 overflow-hidden"><CardHeader><CardTitle>Daftar versi jadwal</CardTitle></CardHeader>
        {list.isPending && <LoadingState />}
        {list.isFetching && !list.isPending && <p role="status" className="p-4 text-xs text-muted-foreground">Memperbarui daftar… Status dan jumlah yang masih terlihat berasal dari cache sebelumnya.</p>}
        {list.isError && <div className="space-y-3 p-4"><ErrorFeedback error={list.error} retry={() => { void list.refetch() }} /><p className="text-xs text-muted-foreground">{list.data ? 'Daftar cache mungkin tidak mutakhir; status dan jumlah belum terkonfirmasi.' : 'Riwayat belum dapat dibaca. Kegagalan request bukan bukti bahwa riwayat kosong.'}</p></div>}
        {list.data && list.data.data.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm" aria-label="Daftar versi jadwal"><thead className="border-y border-border bg-muted/60 text-xs text-muted-foreground"><tr>{['Versi', 'Status', 'Disimpan (UTC)', 'Revision', 'Penempatan', 'Aksi'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{list.data.data.map((row) => <tr key={row.id} className={selectedId === row.id ? 'bg-accent/40' : ''}>
          <td className="px-4 py-3 font-mono text-xs">#{row.id}{selectedId === row.id && <span className="mt-1 block font-sans text-xs text-accent-foreground">Terpilih</span>}</td>
          <td className="px-4 py-3"><VersionStatus status={row.status} unconfirmed={list.isFetching || list.isError} /></td>
          <td className="px-4 py-3 font-mono text-[10px]"><time dateTime={row.created_at}>{row.created_at}</time></td>
          <td className="px-4 py-3 font-mono text-xs">{row.source_revision}</td><td className="px-4 py-3 font-mono text-xs">{row.summary.total_assignment}</td>
          <td className="px-4 py-3"><Button size="sm" variant="outline" aria-label={`Lihat versi #${row.id}`} aria-pressed={selectedId === row.id} disabled={list.isFetching} onClick={() => setSelectedId(row.id)}>Detail</Button></td>
        </tr>)}</tbody></table></div>}
        {list.isSuccess && !list.isFetching && list.data.data.length === 0 && <CardContent><p className="text-sm">{list.data.meta.total_items > 0 || params.page > 1 ? 'Halaman ini tidak memuat versi. Gunakan navigasi halaman untuk meninjau riwayat yang tersedia.' : params.status === 'all' ? 'Belum ada versi jadwal tersimpan. Generate dan simpan melalui Constraint Studio.' : `Tidak ada versi dengan status ${params.status}.`}</p></CardContent>}
        <div className="space-y-3 border-t border-border p-4 text-xs text-muted-foreground"><p>{meta ? `${list.isError || list.isFetching ? 'Metadata terakhir: ' : ''}${meta.total_items} versi sesuai filter · ${pageLabel} · ${list.data?.data.length ?? 0} versi pada halaman ini.` : 'Jumlah versi belum tersedia.'}</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={params.page === 1 || list.isFetching} onClick={() => changeParams({ page: 1 })}>Halaman pertama</Button><Button variant="outline" size="sm" disabled={params.page === 1 || list.isFetching} onClick={() => changeParams({ page: params.page - 1 })}>Sebelumnya</Button><Button variant="outline" size="sm" disabled={!meta || params.page >= meta.total_pages || list.isFetching} onClick={() => changeParams({ page: params.page + 1 })}>Selanjutnya</Button></div></div>
      </Card>
      <section aria-label="Panel detail riwayat" className="min-w-0 space-y-4"><h2 className="text-sm font-semibold">{selectedId === null ? 'Detail snapshot' : `Detail versi terpilih #${selectedId}`}</h2>
        {selectedId === null ? <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Pilih satu versi dari daftar. Detail dan assignment hanya ditampilkan setelah GET detail versi tersebut.</p> : <>
          <Button size="sm" variant="outline" onClick={() => setSelectedId(null)}>Tutup detail</Button>
          {missingOnPage && <p role="status" className="text-sm text-muted-foreground">Versi terpilih #{selectedId} tidak ada pada halaman/filter daftar terbaru. Tidak ada versi pengganti yang dipilih otomatis.</p>}
          {detail.isPending && <LoadingState />}
          {detail.isFetching && !detail.isPending && <p role="status" className="text-xs text-muted-foreground">Memperbarui detail versi #{selectedId}…</p>}
          {detail.isError && <div className="space-y-3"><ErrorFeedback error={detail.error} retry={() => { void detail.refetch() }} />{notFound && <p className="text-sm">Versi #{selectedId} tidak ditemukan. Daftar riwayat tetap dapat ditinjau.</p>}</div>}
          {differentStatus && !detail.isFetching && !list.isFetching && <p role="status" className="rounded-md border border-primary/25 bg-accent p-3 text-sm">Status daftar dan detail berbeda antar pembacaan. Metadata panel berasal dari GET detail; refresh untuk memeriksa kembali keduanya.</p>}
          {detail.data && !notFound && <HistoryDetail detail={detail.data.data} unconfirmed={detail.isFetching || detail.isError} />}
        </>}
      </section>
    </div>
  </>
}
