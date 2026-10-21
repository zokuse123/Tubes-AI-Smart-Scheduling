import { ArrowLeft, FileQuestion } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <Card className="grid min-h-[28rem] place-items-center p-6 text-center">
      <div>
        <FileQuestion size={36} strokeWidth={1.3} className="mx-auto mb-5 text-muted-foreground" aria-hidden="true" />
        <p className="font-mono text-xs font-medium tracking-widest text-primary">404 / NOT FOUND</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Alamat ini tidak tersedia. Gunakan navigasi atau kembali ke Overview.</p>
        <Button asChild className="mt-6" size="lg">
          <Link to="/"><ArrowLeft aria-hidden="true" />Kembali ke Overview</Link>
        </Button>
      </div>
    </Card>
  )
}
