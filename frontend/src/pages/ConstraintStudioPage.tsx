import { scheduleStatusLabels } from '@/lib/presentation'
import { Timestamp } from '@/components/Timestamp'
import { Link } from 'react-router'
import { Workflow } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorFeedback } from '@/features/master-data/Feedback'
import { AssignmentsTable } from '@/features/constraint-studio/AssignmentsTable'
import { Diagnostics } from '@/features/constraint-studio/Diagnostics'
import { PreviewLifetime } from '@/features/constraint-studio/PreviewLifetime'
import { useStudio } from '@/features/constraint-studio/useStudio'

const constraints = [
  'C01: Setiap kegiatan mendapat tepat satu penempatan.',
  'C02: Slot yang dipilih terdaftar dan aktif.',
  'C03: Laboratorium yang dipilih terdaftar dan aktif.',
  'C04: Kapasitas laboratorium mencukupi peserta kelompok.',
  'C05: Kelompok tidak memiliki kegiatan yang bertabrakan waktu.',
  'C06: Asisten tidak membimbing kegiatan yang bertabrakan waktu.',
  'C07: Laboratorium tidak dipakai kegiatan yang bertabrakan waktu.',
  'C08: Kelompok tersedia pada slot terpilih.',
  'C09: Asisten tersedia pada slot terpilih.',
]

export function ConstraintStudioPage() {
  const { result, saved, failure, phase, generate, save } = useStudio()
  const busy = phase !== 'idle'
  return <>
    <PageHeader section="AI Scheduling" title="Constraint Studio" description="Generate satu solusi CSP melalui SWI-Prolog, tinjau preview, lalu simpan secara terpisah." badge="Flask REST API" />
    <div className="space-y-5">
      <Card><CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><h2 className="flex items-center gap-2 text-sm font-semibold"><Workflow aria-hidden="true" size={18} />SWI-Prolog CLP(FD)</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Prolog memilih slot dan laboratorium untuk setiap kegiatan dengan C01–C09. Flask memeriksa kesiapan data dan memverifikasi hasil; React tidak menyusun assignment.</p></div><Button disabled={busy} onClick={generate}>Generate Schedule</Button></div>
        <nav aria-label="Data pendukung penjadwalan" className="flex flex-wrap gap-4 text-sm"><Link to="/data-master" className="rounded text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Tinjau Data Master</Link><Link to="/availability" className="rounded text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Tinjau Availability</Link></nav>
        <details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Aturan sistem C01–C09</summary><p className="mt-2 text-xs text-muted-foreground">Definisi aturan, bukan laporan PASS/FAIL individual untuk run ini.</p><ul className="mt-3 space-y-2 text-xs leading-5">{constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul></details>
      </CardContent></Card>
      {phase === 'generating' && <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-primary/25 bg-accent p-5 text-sm"><span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" />Pencarian solusi sedang berlangsung. Tidak ada persentase progres dari solver; timeout backend 30 detik.</div>}
      {!result && !saved && !failure && phase === 'idle' && <Card><CardContent><h2 className="text-sm font-semibold">Belum ada hasil generate</h2><p className="mt-2 text-sm text-muted-foreground">Siapkan data master dan availability, lalu tekan Generate Schedule. Tidak ada generate otomatis dan hasil tidak langsung menjadi jadwal aktif.</p></CardContent></Card>}
      {failure && <div className="space-y-3"><h2 className="text-sm font-semibold">{failure.stage === 'generate' ? 'Generate gagal' : 'Penyimpanan tidak terkonfirmasi'}</h2><ErrorFeedback error={failure.error} />{failure.discarded && <p className="text-sm text-muted-foreground">{failure.uncertain ? 'Status simpan belum dapat dipastikan. Tidak ada retry otomatis; periksa jadwal tersimpan sebelum mencoba kembali. Preview lokal tidak dapat disimpan ulang.' : 'Tidak ada preview yang dapat disimpan. Tinjau pesan backend dan generate ulang secara eksplisit.'}</p>}</div>}
      {result?.status === 'unsatisfiable' && <Card><CardHeader><CardTitle><Badge tone="neutral">UNSAT</Badge> Tidak ditemukan solusi</CardTitle></CardHeader><CardContent><p className="text-sm">{result.message}</p><p className="mt-3 text-sm leading-6 text-muted-foreground">Periksa availability kelompok/asisten, kapasitas laboratorium, dan kegiatan praktikum. Ini saran peninjauan, bukan diagnosis penyebab pasti. Tidak ada preview atau assignment untuk disimpan.</p></CardContent></Card>}
      {result?.status === 'success' && <Card className="min-w-0 overflow-hidden"><CardHeader><CardTitle><Badge tone="success">SAT</Badge> Solusi ditemukan — belum disimpan</CardTitle></CardHeader><CardContent><p className="text-sm">{result.summary.total_praktikum} kegiatan praktikum · {result.summary.total_assignment} penempatan dari respons backend.</p><p className="mt-2 text-xs text-muted-foreground">Nama berasal dari nested snapshot respons generate, bukan lookup master terkini. Hasil bersifat read-only.</p></CardContent><AssignmentsTable assignments={result.assignments} /><PreviewLifetime key={result.preview_id} preview={result} busy={phase === 'saving'} save={save} /></Card>}
      {result && <Diagnostics result={result} />}
      {saved && <Card><CardHeader><CardTitle>Jadwal berhasil disimpan</CardTitle></CardHeader><CardContent><div role="status" className="space-y-2 text-sm"><p>Versi #{saved.id} · status {scheduleStatusLabels[saved.status]} · source revision {saved.source_revision}</p><p className="text-xs text-muted-foreground">Tersimpan (WIB): <Timestamp value={saved.created_at} /></p><p>{saved.summary.total_praktikum} kegiatan praktikum · {saved.summary.total_assignment} penempatan.</p><p className="text-xs text-muted-foreground">Preview telah digunakan. Tidak ada aksi simpan ulang. Data jadwal aktif dan riwayat akan dimuat ulang saat diperlukan.</p></div></CardContent></Card>}
    </div>
  </>
}
