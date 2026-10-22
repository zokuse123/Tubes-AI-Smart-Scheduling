import type { SlotWaktu } from '@/api/types/master'
import { days } from '@/features/master-data/resources'

export function SlotGrid({ slots, selected, disabled, toggle }: { slots: readonly SlotWaktu[]; selected: readonly number[]; disabled: boolean; toggle: (id: number) => void }) {
  const ordered = [...slots].sort((a, b) => a.hari - b.hari || a.jam_mulai.localeCompare(b.jam_mulai) || a.jam_selesai.localeCompare(b.jam_selesai) || a.id - b.id)
  const presentDays = [...new Set(ordered.map((slot) => slot.hari))]
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {presentDays.map((day) => <fieldset key={day} className="min-w-0 space-y-3">
        <legend className="mb-3 text-sm font-semibold">{days[day - 1]}</legend>
        {ordered.filter((slot) => slot.hari === day).map((slot) => {
          const checked = selected.includes(slot.id)
          return <label key={slot.id} className={`flex min-h-28 items-start gap-3 rounded-lg border p-4 transition-colors ${!slot.is_active ? 'border-border bg-muted text-muted-foreground' : checked ? 'border-primary/50 bg-accent' : 'border-border bg-card hover:bg-muted/40'} ${disabled || !slot.is_active ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" checked={checked} disabled={disabled || !slot.is_active} onChange={() => toggle(slot.id)} aria-label={`${days[day - 1]} ${slot.jam_mulai}–${slot.jam_selesai} · ID #${slot.id}`} />
            <span className="min-w-0 space-y-2"><span className="block font-mono text-xs">{slot.jam_mulai}–{slot.jam_selesai}</span><span className="block text-sm font-medium">{!slot.is_active ? 'Slot nonaktif' : checked ? 'Tersedia' : 'Tidak tersedia'}</span><span className="block font-mono text-[10px] text-muted-foreground">ID #{slot.id}</span></span>
          </label>
        })}
      </fieldset>)}
    </div>
  )
}
