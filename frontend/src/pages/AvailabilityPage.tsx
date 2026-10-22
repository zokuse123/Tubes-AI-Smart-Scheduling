import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AvailabilityOwner } from '@/api/types/availability'
import { queryKeys } from '@/api/queryKeys'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/controls'
import { ErrorFeedback, LoadingState } from '@/features/master-data/Feedback'
import { AvailabilityEditor } from '@/features/availability/AvailabilityEditor'
import { catalogKey, readAvailability, readOwners, readSlots } from '@/features/availability/data'

type Selection = { type: AvailabilityOwner; id: number | null }
export function AvailabilityPage() {
  const [selection, setSelection] = useState<Selection>({ type: 'kelompok', id: null })
  const [guard, setGuard] = useState({ dirty: false, pending: false })
  const [next, setNext] = useState<Selection | null>(null)
  const owners = useQuery({ queryKey: catalogKey(selection.type), queryFn: ({ signal }) => readOwners(selection.type, signal) })
  const slots = useQuery({ queryKey: catalogKey('slot-waktu'), queryFn: ({ signal }) => readSlots(signal) })
  const availability = useQuery({ queryKey: queryKeys.availability.owner(selection.type, selection.id ?? 0), queryFn: ({ signal }) => readAvailability(selection.type, selection.id!, signal), enabled: selection.id !== null })
  const selectedOwner = owners.data?.find((owner) => owner.id === selection.id)
  const refreshing = owners.isFetching || slots.isFetching || availability.isFetching

  function choose(value: Selection) {
    if (value.type === selection.type && value.id === selection.id) return
    if (guard.pending) return
    if (guard.dirty) setNext(value)
    else { setGuard({ dirty: false, pending: false }); setSelection(value) }
  }

  return <>
    <PageHeader section="Workspace" title="Resource Availability" description="Atur allowlist slot waktu kelompok dan asisten. Pilihan kosong berarti tidak tersedia." badge="Flask REST API" />
    <div className="space-y-5">
      <Card><CardContent className="flex flex-wrap items-end gap-4">
        <div><label htmlFor="availability-type" className="mb-1.5 block text-sm font-medium">Jenis resource</label><Select id="availability-type" value={selection.type} disabled={guard.pending} onChange={(event) => choose({ type: event.target.value === 'asisten' ? 'asisten' : 'kelompok', id: null })}><option value="kelompok">Kelompok</option><option value="asisten">Asisten</option></Select></div>
        <div className="min-w-0 flex-1 sm:min-w-64"><label htmlFor="availability-owner" className="mb-1.5 block text-sm font-medium">{selection.type === 'kelompok' ? 'Pilih kelompok' : 'Pilih asisten'}</label><Select id="availability-owner" value={selection.id ?? ''} disabled={owners.isPending || owners.isError || guard.pending} onChange={(event) => choose({ ...selection, id: event.target.value ? Number(event.target.value) : null })}>
          <option value="">Pilih resource aktif</option>
          {owners.data?.map((owner) => <option key={owner.id} value={owner.id}>{owner.nama} · ID #{owner.id}</option>)}
          {selection.id !== null && !selectedOwner && <option value={selection.id} disabled>Resource #{selection.id} tidak tersedia</option>}
        </Select></div>
        <Button variant="outline" disabled={refreshing || guard.pending} onClick={() => { void owners.refetch(); void slots.refetch(); if (selection.id !== null) void availability.refetch() }}>Muat ulang data</Button>
      </CardContent></Card>
      {(owners.isPending || slots.isPending) && <LoadingState />}
      {owners.isError && <ErrorFeedback error={owners.error} retry={() => { void owners.refetch() }} />}
      {slots.isError && <ErrorFeedback error={slots.error} retry={() => { void slots.refetch() }} />}
      {owners.isSuccess && owners.data.length === 0 && <p className="rounded-lg border border-border bg-card p-6 text-sm">Belum ada {selection.type} aktif. Tambahkan atau aktifkan resource melalui Data Master.</p>}
      {selection.id === null && owners.isSuccess && owners.data.length > 0 && <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Pilih resource untuk memuat ketersediaan. Belum ada perubahan yang dikirim.</p>}
      {selection.id !== null && availability.isPending && <LoadingState />}
      {selection.id !== null && availability.isError && <ErrorFeedback error={availability.error} retry={() => { void availability.refetch() }} />}
      {selection.id !== null && availability.data && slots.data && <AvailabilityEditor key={`${selection.type}:${selection.id}`} type={selection.type} id={selection.id} serverIds={availability.data.data.slot_ids} slots={slots.data} unavailable={!selectedOwner || owners.isError || slots.isError || availability.isError} refreshing={refreshing} onGuard={setGuard} />}
    </div>
    <Modal open={next !== null} onOpenChange={(open) => { if (!open) setNext(null) }} title="Ganti resource dan buang draft?" description="Perubahan yang belum disimpan akan dibuang. Availability resource tujuan akan dimuat dari server.">
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setNext(null)}>Tetap di resource ini</Button><Button onClick={() => { if (next) { setGuard({ dirty: false, pending: false }); setSelection(next); setNext(null) } }}>Buang dan ganti</Button></div>
    </Modal>
  </>
}
