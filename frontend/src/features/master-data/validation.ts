import { z } from 'zod'
import type { MasterResource } from '@/api/types/master'
import { configFor } from './resources'
import type { FormValues, MasterEntity } from './resources'

export function formSchema(resource: MasterResource, original: FormValues, references: Record<string, readonly MasterEntity[]> = {}, editing = false) {
  return z.record(z.string(), z.string()).superRefine((values, ctx) => {
    const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [field], message })
    for (const field of configFor(resource).fields) {
      const value = values[field.name]?.trim() ?? ''
      if (!value) { issue(field.name, `${field.label} wajib diisi.`); continue }
      if (field.kind === 'integer' || field.kind === 'reference') {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) issue(field.name, 'Harus berupa integer positif yang dapat direpresentasikan dengan aman.')
        else if (field.kind === 'reference' && !(editing && Number(value) === Number(original[field.name])) && !references[field.name]?.some((item) => item.id === Number(value) && item.is_active)) issue(field.name, 'Pilih referensi aktif yang tersedia.')
      }
      if (field.kind === 'day' && !['1', '2', '3', '4', '5'].includes(value)) issue(field.name, 'Hari harus Senin sampai Jumat.')
      if (field.kind === 'time' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) issue(field.name, 'Gunakan format HH:MM yang valid.')
    }
    if (resource === 'slot-waktu') {
      const minutes = (time = '') => { const [h = NaN, m = NaN] = time.split(':').map(Number); return h * 60 + m }
      if (minutes(values.jam_selesai) - minutes(values.jam_mulai) !== 120) issue('jam_selesai', 'Durasi slot harus tepat 120 menit pada hari yang sama.')
    }
  })
}
