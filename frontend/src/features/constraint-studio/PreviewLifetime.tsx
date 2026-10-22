import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GenerateSuccess } from '@/api/types/scheduling'

export function PreviewLifetime({ preview, busy, save }: { preview: GenerateSuccess; busy: boolean; save: () => void }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [preview.preview_id])
  const expired = now >= Date.parse(preview.expires_at)
  return <div className="space-y-4 p-5">
    <dl className="grid gap-4 text-xs sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Preview ID</dt><dd className="mt-1 break-all font-mono">{preview.preview_id}</dd></div>
      <div><dt className="text-muted-foreground">Source revision preview</dt><dd className="mt-1 font-mono">{preview.source_revision}</dd></div>
      <div><dt className="text-muted-foreground">Dibuat (UTC)</dt><dd className="mt-1 break-all font-mono"><time dateTime={preview.created_at}>{preview.created_at}</time></dd></div>
      <div><dt className="text-muted-foreground">Berlaku sampai (UTC)</dt><dd className="mt-1 break-all font-mono"><time dateTime={preview.expires_at}>{preview.expires_at}</time></dd></div>
    </dl>
    <p className="text-xs leading-5 text-muted-foreground">Preview berlaku 30 menit menurut waktu backend. Jam lokal hanya petunjuk; backend menentukan expiry dan stale saat simpan. Preview hanya tersedia di memori halaman ini, tidak dapat dilanjutkan setelah reload atau meninggalkan halaman.</p>
    {expired && <p role="status" className="text-sm text-destructive">Preview melewati expires_at menurut jam perangkat. Generate ulang; periksa jam perangkat bila tidak sesuai.</p>}
    <Button disabled={busy || expired} onClick={save}>{busy ? 'Menyimpan jadwal…' : 'Simpan Jadwal'}</Button>
  </div>
}
