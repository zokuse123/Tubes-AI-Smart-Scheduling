import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdtemp, readFile, readdir, realpath, rmdir, unlink } from 'node:fs/promises'
import { createConnection, createServer } from 'node:net'
import type { Server } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const root = resolve(frontend, '..')
const mainDatabase = join(root, 'backend', 'db', 'lab_scheduling.db')
const python = process.env.SMART_LAB_E2E_PYTHON?.trim() || 'python'
export const frontendUrl = 'http://localhost:5173'
export const apiUrl = 'http://127.0.0.1:5007/api/v1'

async function isListening(port: number, host: string) {
  return new Promise<boolean>((accept, reject) => {
    const socket = createConnection({ port, host })
    const finish = (result: boolean) => { socket.destroy(); accept(result) }
    socket.setTimeout(750, () => finish(true)) // Fail closed if availability is uncertain.
    socket.once('connect', () => finish(true))
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.destroy()
      if (['ECONNREFUSED', 'EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code ?? '')) accept(false)
      else reject(error)
    })
  })
}
/** Probe both loopbacks first: Windows wildcard binds alone can miss listeners. */
export async function assertPortFree(port: number) {
  for (const host of ['127.0.0.1', '::1']) {
    if (await isListening(port, host)) throw new Error(`E2E port ${port} is unavailable. Close its server yourself; no existing server will be reused or stopped.`)
  }
  const reservations: Server[] = []
  try {
    for (const host of ['0.0.0.0', '::']) {
      const server = createServer()
      try {
        await new Promise<void>((accept, reject) => {
          server.once('error', reject)
          server.listen({ port, host, exclusive: true, ipv6Only: true }, () => { server.removeListener('error', reject); accept() })
        })
        reservations.push(server)
      } catch (error) {
        if (host === '::' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes((error as NodeJS.ErrnoException).code ?? '')) continue
        throw new Error(`E2E port ${port} is unavailable. Close its server yourself; no existing server will be reused or stopped.`, { cause: error })
      }
    }
  } finally {
    await Promise.all(reservations.map((server) => new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()))))
  }
}

export async function removeFixtureDirectory(directory: string) {
  const parent = await realpath(tmpdir())
  const actual = await realpath(directory)
  if (!isAbsolute(directory) || actual !== resolve(directory) || dirname(actual) !== parent || !basename(actual).startsWith('smart-lab-e2e-') || (await lstat(directory)).isSymbolicLink()) {
    throw new Error('Refusing cleanup outside the owned temporary fixture directory')
  }
  const files = await readdir(actual)
  for (const name of files) {
    if (!['test.sqlite', 'test.sqlite-wal', 'test.sqlite-shm'].includes(name) || !(await lstat(join(actual, name))).isFile()) {
      throw new Error(`Unexpected fixture artifact; refusing cleanup: ${name}`)
    }
  }
  for (const name of files) await unlink(join(actual, name))
  await rmdir(actual) // Never recursive; unexpected contents must fail safely.
}

type Managed = { child: ChildProcess; label: string; output: () => string; failure: () => Error | undefined; closed: Promise<void> }
function start(command: string, args: string[], env: NodeJS.ProcessEnv, label: string, cwd = root): Managed {
  const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  let failure: Error | undefined
  const capture = (data: Buffer) => { output = (output + data.toString()).slice(-16_384) }
  child.stdout!.on('data', capture)
  child.stderr!.on('data', capture)
  child.on('error', (error) => { failure = error })
  const closed = new Promise<void>((accept) => child.once('close', () => accept()))
  return { child, label, output: () => output, failure: () => failure, closed }
}
function assertRunning(managed: Managed) {
  if (managed.failure() || managed.child.exitCode !== null || managed.child.signalCode !== null) {
    throw new Error(`${managed.label} failed: ${managed.output()}`, { cause: managed.failure() })
  }
}
async function bounded<T>(promise: Promise<T>, milliseconds: number, description: string): Promise<T> {
  const controller = new AbortController()
  try {
    return await Promise.race([promise, delay(milliseconds, undefined, { signal: controller.signal }).then(() => { throw new Error(description) })])
  } finally { controller.abort() }
}
async function stop(managed: Managed) {
  const { child } = managed
  if (!child.pid || child.exitCode !== null || child.signalCode !== null || managed.failure()) { await bounded(managed.closed, 5_000, `Owned ${managed.label} did not close`); return }
  // Only PIDs returned by spawn() above are eligible; never kill by port/name.
  if (process.platform === 'win32') {
    const killer = start('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], process.env, `stop ${managed.label}`)
    await bounded(killer.closed, 5_000, `Timed out stopping ${managed.label}`)
    if (killer.child.exitCode !== 0 && child.exitCode === null) throw new Error(`Could not stop owned ${managed.label} PID ${child.pid}`)
  } else {
    child.kill('SIGTERM')
  }
  await bounded(managed.closed, 5_000, `Owned ${managed.label} did not exit`)
}
async function ready(managed: Managed, marker: string, url: string) {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    assertRunning(managed)
    // Owned stdout must confirm binding BEFORE sending any HTTP requests.
    if (managed.output().includes(marker)) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2_000) })
        await response.arrayBuffer()
        assertRunning(managed)
        if (response.ok) return
      } catch { assertRunning(managed) }
    }
    await delay(100)
  }
  throw new Error(`${managed.label} startup/readiness timed out: ${managed.output()}`)
}
async function mainHash() {
  try { return createHash('sha256').update(await readFile(mainDatabase)).digest('hex') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}

export type IsolatedSystem = { directory: string; database: string; mainHashBefore: string | null }

export async function withIsolatedSystem(run: (system: IsolatedSystem) => Promise<void>) {
  // Fail before mkdtemp/init/spawn if either target belongs to another process.
  await assertPortFree(5173)
  await assertPortFree(5007)
  const mainHashBefore = await mainHash()
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'smart-lab-e2e-'))
  const database = join(directory, 'test.sqlite')
  const env = { ...process.env, SMART_LAB_DATABASE: database, PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1', FLASK_SKIP_DOTENV: '1' }
  const managed: Managed[] = []
  const problems: unknown[] = []
  try {
    const initialization = start(python, ['-B', join(root, 'backend/db/init_db.py'), '--db-path', database], env, 'SQLite initialization')
    managed.push(initialization)
    await bounded(initialization.closed, 30_000, 'SQLite initialization timed out')
    if (initialization.failure() || initialization.child.exitCode !== 0) throw new Error(`SQLite initialization failed: ${initialization.output()}`, { cause: initialization.failure() })
    const flask = start(python, ['-B', join(frontend, 'e2e/flask_server.py'), '--database', database], env, 'Flask fixture')
    managed.push(flask)
    await ready(flask, 'SMART_LAB_E2E_DATABASE_VERIFIED_AND_BOUND', `${apiUrl}/health`)
    const vite = start(process.execPath, [join(frontend, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', '5173', '--strictPort'], { ...env, VITE_API_BASE_URL: apiUrl, FORCE_COLOR: '0' }, 'Vite fixture', frontend)
    managed.push(vite)
    await ready(vite, 'http://localhost:5173', frontendUrl)
    console.log(`[e2e] isolated database=${database}; owned Flask PID=${flask.child.pid}, Vite PID=${vite.child.pid}; primary SHA256=${mainHashBefore}`)
    await run({ directory, database, mainHashBefore })
  } catch (error) { problems.push(error) }
  const stops = await Promise.allSettled([...managed].reverse().map(stop))
  const stopFailures = stops.filter((result) => result.status === 'rejected').map((result) => result.reason)
  problems.push(...stopFailures)
  if (stopFailures.length === 0) {
    try { await removeFixtureDirectory(directory) } catch (error) { problems.push(error) }
  }
  try { if (await mainHash() !== mainHashBefore) problems.push(new Error('Primary database hash changed during E2E')) }
  catch (error) { problems.push(error) }
  for (const port of [5173, 5007]) {
    try { await assertPortFree(port) } catch (error) { problems.push(error) }
  }
  if (problems.length) throw new AggregateError(problems, `E2E setup/test/teardown failed; fixture directory ${directory}`)
  console.log(`[e2e] cleanup verified: owned processes stopped, ports free, temporary directory removed, primary SHA256 unchanged (${mainHashBefore})`)
}
