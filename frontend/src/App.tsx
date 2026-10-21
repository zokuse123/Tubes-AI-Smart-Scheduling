import { Route, Routes } from 'react-router'
import { BootstrapPage } from '@/pages/BootstrapPage'

function NotFoundPage() {
  return (
    <main className="grid min-h-svh place-items-center px-6 text-center">
      <div>
        <p className="font-mono text-sm text-amber-800">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Halaman tidak ditemukan</h1>
        <a className="mt-5 inline-block rounded-lg bg-stone-950 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700" href="/">
          Kembali ke beranda
        </a>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BootstrapPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
