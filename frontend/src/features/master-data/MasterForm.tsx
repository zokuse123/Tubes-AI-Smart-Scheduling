import { useState } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ApiError } from '@/api/errors'
import { invalidateAfterMasterMutation } from '@/api/invalidation'
import { queryKeys } from '@/api/queryKeys'
import type { MasterResource } from '@/api/types/master'
import { Input, Select } from '@/components/ui/controls'
import { Button } from '@/components/ui/button'
import { ErrorFeedback } from './Feedback'
import { changedValues, configFor, createRecord, days, initialValues, rawField, readList, referenceResources, updateRecord } from './resources'
import type { FormValues, MasterEntity } from './resources'
import { formSchema } from './validation'

async function activeReferences(resource: MasterResource, signal: AbortSignal) {
  const filters = { page: 1, page_size: 100, is_active: 'true', sort_by: 'id', sort_order: 'asc' } as const
  const first = await readList(resource, filters, signal)
  const rows = [...first.data]
  for (let page = 2; page <= first.meta.total_pages; page += 1) rows.push(...(await readList(resource, { ...filters, page }, signal)).data)
  return [...new Map(rows.filter((row) => row.is_active).map((row) => [row.id, row])).values()]
}

type Props = { resource: MasterResource; record?: MasterEntity; onComplete: (id: number, message: string) => void; onCancel: () => void; onBusy: (busy: boolean) => void }
export function MasterForm({ resource, record, onComplete, onCancel, onBusy }: Props) {
  const client = useQueryClient()
  const config = configFor(resource)
  const [original] = useState(() => initialValues(resource, record))
  const referenceQueries = useQueries({ queries: Object.entries(referenceResources).map(([field, name]) => ({
    queryKey: [...queryKeys.master.lists(name), 'references', 'active'],
    queryFn: ({ signal }: { signal: AbortSignal }) => activeReferences(name, signal),
    enabled: resource === 'praktikum',
    meta: { field },
  })) })
  const references = Object.fromEntries(Object.keys(referenceResources).map((field, index) => [field, referenceQueries[index]?.data ?? []]))
  const waiting = resource === 'praktikum' && referenceQueries.some((q) => q.isFetching || q.isPending)
  const referenceError = resource === 'praktikum' ? referenceQueries.find((q) => q.isError)?.error : null
  const missingReferences = resource === 'praktikum' && !record && Object.values(references).some((rows) => rows.length === 0)
  const form = useForm<FormValues>({ defaultValues: original, resolver: zodResolver(formSchema(resource, original, references, !!record)) })
  const mutation = useMutation({
    mutationFn: (values: FormValues) => record ? updateRecord(resource, record.id, changedValues(resource, original, values)) : createRecord(resource, values),
    onMutate: () => onBusy(true),
    onSuccess: async (result) => {
      await invalidateAfterMasterMutation(client, resource)
      onComplete(result.data.id, record ? 'Perubahan berhasil disimpan.' : 'Data berhasil ditambahkan.')
    },
    onError: (error) => {
      if (!(error instanceof ApiError) || !error.details || Array.isArray(error.details)) return
      const known = new Set(config.fields.map((field) => field.name))
      const addError = (name: string, message: string) => { if (known.has(name)) form.setError(name, { type: 'server', message }, { shouldFocus: true }) }
      if (typeof error.details.field === 'string') addError(error.details.field, error.message)
      const fields = error.details.fields
      if (Array.isArray(fields)) fields.forEach((field) => { if (typeof field === 'string') addError(field, error.message) })
      else if (fields && typeof fields === 'object') Object.entries(fields).forEach(([field, message]) => addError(field, typeof message === 'string' ? message : error.message))
    },
    onSettled: () => onBusy(false),
  })
  const blocked = mutation.isPending || waiting || !!referenceError || missingReferences

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => {
      if (blocked) return
      if (record && Object.keys(changedValues(resource, original, values)).length === 0) {
        onComplete(record.id, 'Tidak ada perubahan. Tidak ada request PATCH yang dikirim.')
        return
      }
      mutation.mutate(values)
    })} className="space-y-4">
      {mutation.isError && <ErrorFeedback error={mutation.error} />}
      {waiting && <p role="status" className="text-sm text-muted-foreground">Memuat referensi aktif…</p>}
      {referenceError && <ErrorFeedback error={referenceError} retry={() => { void Promise.all(referenceQueries.map((q) => q.refetch())) }} />}
      {!waiting && !referenceError && missingReferences && <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm">Referensi aktif belum lengkap. Tambahkan mata praktikum, kelompok, dan asisten aktif terlebih dahulu.</p>}
      <fieldset disabled={mutation.isPending || waiting || !!referenceError} className="space-y-4">
        {config.fields.map((field) => {
          const id = `master-field-${field.name}`
          const error = form.formState.errors[field.name]
          const rows = references[field.name] ?? []
          const current = original[field.name]
          const currentMissing = record && field.kind === 'reference' && current && !rows.some((row) => row.id === Number(current))
          return (
            <div key={field.name}>
              <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{field.label}</label>
              {field.kind === 'reference' || field.kind === 'day' ? (
                <Select id={id} {...form.register(field.name)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}>
                  <option value="" disabled>Pilih {field.label.toLowerCase()}</option>
                  {field.kind === 'day' ? days.map((day, index) => <option key={day} value={index + 1}>{day}</option>) : rows.map((row) => <option key={row.id} value={row.id}>{rawField(row, 'nama')} · ID #{row.id}</option>)}
                  {currentMissing && <option value={current} disabled>Referensi saat ini #{current} — tidak tersedia untuk dipilih</option>}
                </Select>
              ) : (
                <Input id={id} {...form.register(field.name)} type={field.kind === 'time' ? 'time' : 'text'} inputMode={field.kind === 'integer' ? 'numeric' : undefined} step={field.kind === 'time' ? 60 : undefined} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} autoComplete="off" />
              )}
              {error && <p id={`${id}-error`} className="mt-1 text-xs text-destructive">{String(error.message ?? 'Nilai tidak valid.')}</p>}
            </div>
          )
        })}
      </fieldset>
      {resource === 'slot-waktu' && <p className="text-xs leading-5 text-muted-foreground">Durasi wajib 120 menit. Slot aktif yang bersebelahan diizinkan; overlap diperiksa backend.</p>}
      {resource === 'praktikum' && record && <p className="text-xs leading-5 text-muted-foreground">Referensi saat ini yang tidak tersedia hanya dapat dipertahankan tanpa perubahan. Penggantinya harus aktif.</p>}
      <p className="text-xs text-muted-foreground">Validasi dan integritas akhir tetap diperiksa oleh backend.</p>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={blocked}>{mutation.isPending ? 'Menyimpan…' : 'Simpan data'}</Button>
      </div>
    </form>
  )
}
