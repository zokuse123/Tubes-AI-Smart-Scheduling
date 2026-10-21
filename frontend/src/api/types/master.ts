import { z } from 'zod'
import { identifierSchema, timestampSchema } from './common'
import type { ApiList, AtLeastOne, ListQuery } from './common'

export const daySchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
export const slotTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
export type Day = z.infer<typeof daySchema>
export type SlotTime = z.infer<typeof slotTimeSchema>

const masterFields = {
  id: identifierSchema,
  is_active: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
}
export const namedReferenceSchema = z.object({ id: identifierSchema, nama: z.string() })
export const groupReferenceSchema = namedReferenceSchema.extend({ jumlah_peserta: z.number().int().positive() })
export const laboratoryReferenceSchema = namedReferenceSchema.extend({ kapasitas: z.number().int().positive() })
export const slotReferenceSchema = z.object({ id: identifierSchema, hari: daySchema, jam_mulai: slotTimeSchema, jam_selesai: slotTimeSchema })

export const mataPraktikumSchema = z.object({ ...masterFields, nama: z.string() })
export const kelompokSchema = z.object({ ...masterFields, nama: z.string(), jumlah_peserta: z.number().int().positive() })
export const asistenSchema = z.object({ ...masterFields, nama: z.string() })
export const laboratoriumSchema = z.object({ ...masterFields, nama: z.string(), kapasitas: z.number().int().positive() })
export const slotWaktuSchema = z.object({ ...masterFields, hari: daySchema, jam_mulai: slotTimeSchema, jam_selesai: slotTimeSchema })
export const praktikumSchema = z.object({
  ...masterFields,
  mata_praktikum_id: identifierSchema,
  kelompok_id: identifierSchema,
  asisten_id: identifierSchema,
  mata_praktikum: namedReferenceSchema,
  kelompok: groupReferenceSchema,
  asisten: namedReferenceSchema,
})

export type MataPraktikum = z.infer<typeof mataPraktikumSchema>
export type Kelompok = z.infer<typeof kelompokSchema>
export type Asisten = z.infer<typeof asistenSchema>
export type Laboratorium = z.infer<typeof laboratoriumSchema>
export type SlotWaktu = z.infer<typeof slotWaktuSchema>
export type Praktikum = z.infer<typeof praktikumSchema>

export type CreateMataPraktikum = { nama: string }
export type CreateKelompok = { nama: string; jumlah_peserta: number }
export type CreateAsisten = { nama: string }
export type CreateLaboratorium = { nama: string; kapasitas: number }
export type CreateSlotWaktu = { hari: Day; jam_mulai: SlotTime; jam_selesai: SlotTime }
export type CreatePraktikum = { mata_praktikum_id: number; kelompok_id: number; asisten_id: number }
export type UpdateMataPraktikum = AtLeastOne<CreateMataPraktikum>
export type UpdateKelompok = AtLeastOne<CreateKelompok>
export type UpdateAsisten = AtLeastOne<CreateAsisten>
export type UpdateLaboratorium = AtLeastOne<CreateLaboratorium>
export type UpdateSlotWaktu = AtLeastOne<CreateSlotWaktu>
export type UpdatePraktikum = AtLeastOne<CreatePraktikum>
export type StatusUpdate = { is_active: boolean }

type CommonSort = 'id' | 'created_at' | 'updated_at'
type NamedQuery = ListQuery<CommonSort | 'nama'> & { search?: string }
export type MataPraktikumQuery = NamedQuery
export type AsistenQuery = NamedQuery
export type KelompokQuery = ListQuery<CommonSort | 'nama' | 'jumlah_peserta'> & { search?: string }
export type LaboratoriumQuery = ListQuery<CommonSort | 'nama' | 'kapasitas'> & { search?: string }
export type SlotWaktuQuery = ListQuery<CommonSort | 'hari' | 'jam_mulai' | 'jam_selesai'>
export type PraktikumQuery = ListQuery<CommonSort | 'mata_praktikum_id' | 'kelompok_id' | 'asisten_id'>

export type MataPraktikumCollection = ApiList<MataPraktikum>
export type KelompokCollection = ApiList<Kelompok>
export type AsistenCollection = ApiList<Asisten>
export type LaboratoriumCollection = ApiList<Laboratorium>
export type SlotWaktuCollection = ApiList<SlotWaktu>
export type PraktikumCollection = ApiList<Praktikum>

export type MasterQueryMap = {
  'mata-praktikum': MataPraktikumQuery
  kelompok: KelompokQuery
  asisten: AsistenQuery
  laboratorium: LaboratoriumQuery
  'slot-waktu': SlotWaktuQuery
  praktikum: PraktikumQuery
}
export type MasterResource = keyof MasterQueryMap
