import type { GenerateResult } from '@/api/types/scheduling'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { referenceLabel } from './presentation'

export function Diagnostics({ result }: { result: GenerateResult }) {
  const diagnostics = result.solver_diagnostics
  return <Card className="min-w-0 overflow-hidden">
    <CardHeader><CardTitle>Diagnostik solver</CardTitle></CardHeader>
    <CardContent>
      <dl className="grid gap-5 sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Solver wall time</dt><dd className="mt-1 font-mono text-lg">{diagnostics.wall_time_ms} ms</dd></div>
        <div><dt className="text-xs text-muted-foreground">Source revision</dt><dd className="mt-1 font-mono text-lg">{result.source_revision}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Verification overall</dt><dd className="mt-1 font-mono text-sm">{diagnostics.verification.overall}</dd></div>
      </dl>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Wall time adalah round-trip adapter/solver, termasuk startup, komunikasi, validasi respons, dan verifier; bukan CPU time atau durasi seluruh request HTTP. Verifikasi UNSAT tidak berlaku karena tidak ada assignment.</p>
    </CardContent>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm" aria-label="Domain kandidat awal">
      <thead className="border-y border-border bg-muted/60 text-xs text-muted-foreground"><tr>{['Kegiatan praktikum', 'Kandidat slot', 'Kandidat laboratorium', 'Pasangan teoritis'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-border">{diagnostics.domain_candidates.map((candidate) => {
        const assignment = result.status === 'success' ? result.assignments.find((item) => item.praktikum_id === candidate.praktikum_id) : undefined
        return <tr key={candidate.praktikum_id}><td className="min-w-44 px-4 py-3"><span className="block font-mono text-xs">Praktikum #{candidate.praktikum_id}</span>{assignment && <span className="mt-1 block text-xs text-muted-foreground">{referenceLabel(assignment.mata_praktikum)}</span>}</td><td className="px-4 py-3 font-mono">{candidate.slot_count}</td><td className="px-4 py-3 font-mono">{candidate.laboratory_count}</td><td className="px-4 py-3 font-mono">{candidate.theoretical_pairs}</td></tr>
      })}</tbody>
    </table></div>
    {diagnostics.domain_candidates.length === 0 && <p className="p-4 text-sm text-muted-foreground">Tidak ada item domain kandidat pada respons.</p>}
    <p className="p-4 text-xs leading-5 text-muted-foreground">Hitungan ini adalah domain awal sebelum constraint konflik antar-kegiatan. Pasangan teoritis bukan jumlah solusi, pruning, backtracking, atau search trace.</p>
  </Card>
}
