import { describe, expect, it } from 'vitest'
import { asisten, kelompok, mata } from '@/api/__tests__/fixtures'
import { formSchema } from './validation'

describe('master form boundary validation', () => {
  it.each(['0', '6', '1.0', 'true', '-1'])('rejects invalid day %s', (hari) => {
    expect(formSchema('slot-waktu', {}).safeParse({ hari, jam_mulai: '08:00', jam_selesai: '10:00' }).success).toBe(false)
  })
  it.each(['8:00', '24:00', '08:60', '08:00:00', ''])('rejects invalid start time %s', (jam_mulai) => {
    expect(formSchema('slot-waktu', {}).safeParse({ hari: '1', jam_mulai, jam_selesai: '10:00' }).success).toBe(false)
  })
  it.each([['00:00', '02:00'], ['21:59', '23:59'], ['10:00', '12:00']])('accepts same-day two-hour slot %s–%s', (jam_mulai, jam_selesai) => {
    expect(formSchema('slot-waktu', {}).safeParse({ hari: '5', jam_mulai, jam_selesai }).success).toBe(true)
  })
  it.each(['0', '-1', '1.5', '9007199254740992'])('rejects invalid lab capacity %s', (kapasitas) => {
    expect(formSchema('laboratorium', {}).safeParse({ nama: 'Lab', kapasitas }).success).toBe(false)
  })
  it('does not impose a made-up business limit on valid positive counts', () => {
    expect(formSchema('kelompok', {}).safeParse({ nama: 'Kelompok', jumlah_peserta: '1000000' }).success).toBe(true)
  })
  it('allows an unchanged inactive FK in PATCH but rejects a new inactive or unknown reference', () => {
    const original = { mata_praktikum_id: String(mata.id), kelompok_id: String(kelompok.id), asisten_id: String(asisten.id) }
    const references = { mata_praktikum_id: [mata], kelompok_id: [kelompok], asisten_id: [{ ...asisten, is_active: false }] }
    expect(formSchema('praktikum', original, references, true).safeParse(original).success).toBe(true)
    expect(formSchema('praktikum', {}, references).safeParse(original).success).toBe(false)
    expect(formSchema('praktikum', original, references, true).safeParse({ ...original, asisten_id: '999' }).success).toBe(false)
  })
})
