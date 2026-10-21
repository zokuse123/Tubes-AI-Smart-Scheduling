import { ArrowUpRight, CalendarDays, Database, FlaskConical, Workflow } from 'lucide-react'

const technologies = [
  { name: 'React', role: 'Antarmuka pengguna', icon: Workflow },
  { name: 'Flask', role: 'REST API dan orkestrasi', icon: FlaskConical },
  { name: 'SQLite', role: 'Data dan riwayat jadwal', icon: Database },
  { name: 'SWI-Prolog', role: 'Solver CSP', icon: CalendarDays },
]

export function BootstrapPage() {
  return (
    <main className="relative isolate min-h-svh overflow-hidden px-5 py-8 sm:px-8 lg:px-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-32 -top-40 size-[28rem] rounded-full bg-amber-200/35 blur-3xl" />
        <div className="absolute -bottom-52 -left-40 size-[32rem] rounded-full bg-stone-200/55 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <a className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-700" href="/" aria-label="Smart Lab Scheduling System beranda">
            <span className="grid size-10 place-items-center rounded-xl bg-stone-950 text-amber-300 shadow-sm">
              <CalendarDays aria-hidden="true" size={20} />
            </span>
            <span className="text-sm font-semibold tracking-tight text-stone-900 sm:text-base">Smart Lab</span>
          </a>
          <span className="rounded-full border border-amber-300/80 bg-amber-50 px-3 py-1.5 font-mono text-[11px] font-medium tracking-wide text-amber-950 sm:text-xs">
            F02 · FRONTEND FOUNDATION
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:py-20">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/80 px-3.5 py-2 text-sm text-stone-600 shadow-sm shadow-stone-900/[0.03]">
              <span className="size-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/10" />
              Fondasi frontend berhasil dijalankan
            </div>

            <p className="mb-4 font-mono text-xs font-medium uppercase tracking-[0.22em] text-amber-800 sm:text-sm">
              Laboratory scheduling · CSP
            </p>
            <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-stone-950 sm:text-5xl lg:text-6xl">
              Smart Lab Scheduling System
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              Penjadwalan praktikum laboratorium dengan Constraint Satisfaction Problem. Fondasi React siap dikembangkan untuk terhubung ke backend Flask.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3 text-sm text-stone-500">
              <span className="rounded-lg bg-stone-950 px-3 py-2 font-mono text-xs font-medium text-white">React + TypeScript</span>
              <span className="inline-flex items-center gap-1.5 px-1 py-2">Vite <ArrowUpRight aria-hidden="true" size={14} /></span>
              <span className="px-1 py-2">Tailwind CSS</span>
              <span className="px-1 py-2">shadcn/ui</span>
            </div>
          </div>

          <aside aria-label="Arsitektur sistem" className="rounded-3xl border border-stone-200/90 bg-white/85 p-5 shadow-[0_24px_80px_-40px_rgba(28,25,23,0.35)] backdrop-blur sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-5">
              <div>
                <p className="text-sm font-medium text-stone-900">Arsitektur sistem</p>
                <p className="mt-1 text-sm text-stone-500">Komponen inti penjadwalan</p>
              </div>
              <span className="rounded-lg bg-amber-100 p-2.5 text-amber-900">
                <Workflow aria-hidden="true" size={18} />
              </span>
            </div>

            <ul className="divide-y divide-stone-100">
              {technologies.map(({ name, role, icon: Icon }) => (
                <li className="flex items-center gap-4 py-4 first:pt-5 last:pb-1" key={name}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700">
                    <Icon aria-hidden="true" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-stone-900">{name}</span>
                    <span className="mt-0.5 block text-sm text-stone-500">{role}</span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-stone-400">ready</span>
                </li>
              ))}
            </ul>

            <p className="mt-5 rounded-xl bg-stone-50 px-4 py-3 text-xs leading-5 text-stone-500">
              Tampilan ini adalah scaffold F02. Integrasi API dan halaman fitur dimulai pada tahap berikutnya.
            </p>
          </aside>
        </section>

        <footer className="flex flex-col gap-2 border-t border-stone-200/80 py-5 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
          <span>UAS Inteligensi Artifisial · Sistem Penjadwalan Praktikum</span>
          <span className="font-mono">frontend · localhost:5173</span>
        </footer>
      </div>
    </main>
  )
}
