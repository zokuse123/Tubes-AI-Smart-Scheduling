// Read-only analysis of a Vite build made with: npm run build -- --manifest
// Initial bytes include the entry and the transitive *static* import graph.
// Dynamic route chunks are reported separately, never counted as initial JS.
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
const manifest = JSON.parse(readFileSync(resolve(dist, '.vite/manifest.json'), 'utf8'))
const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry)
const initial = new Set()
function visit(key, selected = initial) {
  const chunk = manifest[key]
  if (!chunk || selected.has(chunk.file)) return
  selected.add(chunk.file)
  for (const dependency of chunk.imports ?? []) visit(dependency, selected)
}
entries.forEach((key) => visit(key))
const chunks = readdirSync(resolve(dist, 'assets')).filter((file) => file.endsWith('.js')).map((file) => {
  const content = readFileSync(resolve(dist, 'assets', file))
  return { file, initial: initial.has(`assets/${file}`), raw: content.length, gzip: gzipSync(content).length }
}).sort((a, b) => b.raw - a.raw)
const landing = new Set(initial)
visit('src/pages/OverviewPage.tsx', landing)
const sum = (files, metric) => chunks.filter((chunk) => files.has(`assets/${chunk.file}`)).reduce((total, chunk) => total + chunk[metric], 0)
console.log(JSON.stringify({
  method: 'bytes; gzip per chunk; initial = entry + transitive static imports; excludes dynamic imports, CSS and fonts',
  initialRaw: chunks.filter((chunk) => chunk.initial).reduce((sum, chunk) => sum + chunk.raw, 0),
  initialGzip: chunks.filter((chunk) => chunk.initial).reduce((sum, chunk) => sum + chunk.gzip, 0),
  overviewRaw: sum(landing, 'raw'), overviewGzip: sum(landing, 'gzip'),
  chunks,
}, null, 2))
