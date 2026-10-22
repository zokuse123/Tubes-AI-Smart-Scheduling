import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateAfterAvailabilityMutation } from '@/api/invalidation'
import { queryKeys } from '@/api/queryKeys'
import type { AvailabilityOwner } from '@/api/types/availability'
import type { SlotWaktu } from '@/api/types/master'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorFeedback } from '@/features/master-data/Feedback'
import { replaceAvailability, sameIds } from './data'
import { SlotGrid } from './SlotGrid'

type Props = {
  type: AvailabilityOwner; id: number; serverIds: number[]; slots: SlotWaktu[]
  unavailable: boolean; refreshing: boolean
  onGuard: (state: { dirty: boolean; pending: boolean }) => void
}
export function AvailabilityEditor({ type, id, serverIds, slots, unavailable, refreshing, onGuard }: Props) {
  const client = useQueryClient()
  const [baseline, setBaseline] = useState(serverIds)
  const [draft, setDraft] = useState(serverIds)
  const [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState<'clear' | 'latest' | null>(null)
  const dirty = !sameIds(draft, baseline)
  const serverChanged = !sameIds(serverIds, baseline)
  const invalidIds = draft.filter((slotId) => !slots.some((slot) => slot.id === slotId && slot.is_active))
  const mutation = useMutation({
    mutationFn: () => replaceAvailability(type, id, draft),
    onSuccess: async (result) => {
      // Confirmed server data, not an optimistic update.
      client.setQueryData(queryKeys.availability.owner(type, id), result)
      setBaseline(result.data.slot_ids)
      setDraft(result.data.slot_ids)
      setNotice('Ketersediaan berhasil disimpan.')
      await invalidateAfterAvailabilityMutation(client, type, id)
    },
  })
  const blocked = unavailable || refreshing || mutation.isPending
  const blocker = useBlocker(dirty || mutation.isPending)

  useEffect(() => { onGuard({ dirty, pending: mutation.isPending }) }, [dirty, mutation.isPending, onGuard])
  useEffect(() => {
    if (!dirty && !mutation.isPending) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, mutation.isPending])

  function change(ids: number[]) { setDraft(ids); setNotice(''); mutation.reset() }
  function applyLatest() { setBaseline(serverIds); change(serverIds); setConfirmation(null) }

  return <Card>
    <CardHeader className="flex flex-wrap items-center justify-between gap-3">
      <CardTitle>Slot ketersediaan</CardTitle>
      <span role="status" className="text-xs text-muted-foreground">{draft.length} slot dipilih · {slots.filter((slot) => slot.is_active).length} slot aktif{dirty ? ' · Perubahan belum disimpan' : ' · Tidak ada perubahan'}</span>
    </CardHeader>
    <CardContent className="space-y-5">
      {notice && <div role="status" className="rounded-md border border-success/25 bg-success-muted p-4 text-sm"><p className="font-medium text-success">{notice}</p><p className="mt-1 text-xs text-muted-foreground">Validitas jadwal ditentukan backend. Perubahan ketersediaan dapat memengaruhi jadwal dan preview.</p></div>}
      {mutation.isError && <ErrorFeedback error={mutation.error} />}
      {unavailable && <p role="alert" className="rounded-md border border-destructive/25 bg-destructive-muted/30 p-3 text-sm">Resource tidak lagi aktif, tidak ditemukan, atau data belum dapat diverifikasi. Draft dipertahankan; muat ulang data sebelum menyimpan.</p>}
      {serverChanged && <div role="status" className="rounded-md border border-primary/30 bg-accent p-4 text-sm"><p>Data server berbeda dari baseline. Draft tidak ditimpa. Tinjau data terbaru sebelum menyimpan kembali.</p><Button className="mt-3" variant="outline" disabled={mutation.isPending} onClick={() => dirty ? setConfirmation('latest') : applyLatest()}>Gunakan data server</Button></div>}
      {invalidIds.length > 0 && <div role="status" className="rounded-md border border-border bg-muted p-4 text-sm"><p>Pilihan slot tidak aktif atau tidak ditemukan: {invalidIds.map((slotId) => `#${slotId}`).join(', ')}. Hapus pilihan ini secara eksplisit sebelum menyimpan.</p><Button className="mt-3" variant="outline" disabled={blocked} onClick={() => change(draft.filter((slotId) => !invalidIds.includes(slotId)))}>Hapus pilihan tidak tersedia</Button></div>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={blocked || !slots.some((slot) => slot.is_active)} onClick={() => change([...new Set([...draft, ...slots.filter((slot) => slot.is_active).map((slot) => slot.id)])])}>Pilih semua slot aktif</Button>
        <Button variant="outline" disabled={blocked || draft.length === 0} onClick={() => setConfirmation('clear')}>Kosongkan pilihan</Button>
      </div>
      {!slots.some((slot) => slot.is_active) && <p className="text-sm text-muted-foreground">Belum ada slot waktu aktif. Kelola slot melalui Data Master. Daftar kosong berarti tidak tersedia, bukan semua waktu tersedia.</p>}
      <SlotGrid slots={slots} selected={draft} disabled={blocked} toggle={(slotId) => change(draft.includes(slotId) ? draft.filter((value) => value !== slotId) : [...draft, slotId])} />
      <p className="text-xs leading-5 text-muted-foreground">Pilihan kosong berarti tidak tersedia. Simpan mengganti seluruh daftar slot untuk resource ini. Tidak ada penyimpanan otomatis.</p>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" disabled={!dirty || mutation.isPending} onClick={applyLatest}>Batalkan perubahan</Button>
        <Button disabled={!dirty || blocked || serverChanged || invalidIds.length > 0} onClick={() => { setNotice(''); mutation.mutate() }}>{mutation.isPending ? 'Menyimpan…' : 'Simpan perubahan'}</Button>
      </div>
    </CardContent>
    <Modal open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null) }} title={confirmation === 'clear' ? 'Kosongkan pilihan?' : 'Ganti draft dengan data server?'} description="Perubahan ini hanya mengubah draft. Tekan Simpan untuk mengirim perubahan ke server.">
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmation(null)}>Kembali</Button><Button onClick={() => { if (confirmation === 'latest') applyLatest(); else { change([]); setConfirmation(null) } }}>Ya, lanjutkan</Button></div>
    </Modal>
    <Modal open={blocker.state === 'blocked'} onOpenChange={(open) => { if (!open && blocker.state === 'blocked') blocker.reset() }} title="Tinggalkan halaman availability?" description={mutation.isPending ? 'Penyimpanan sedang berlangsung. Tunggu konfirmasi server sebelum meninggalkan halaman.' : 'Perubahan belum disimpan akan dibuang jika Anda meninggalkan halaman.'}>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { if (blocker.state === 'blocked') blocker.reset() }}>Tetap di halaman</Button><Button disabled={mutation.isPending} onClick={() => { if (blocker.state === 'blocked') blocker.proceed() }}>Buang dan tinggalkan</Button></div>
    </Modal>
  </Card>
}
