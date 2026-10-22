import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtemp, readFile, writeFile, unlink, rmdir, access, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertPortFree, removeFixtureDirectory, withIsolatedSystem } from './system.ts'

for (const host of ['127.0.0.1', '::1']) {
  test(`port guard rejects an existing ${host} listener without stopping it`, async () => {
    const foreign = createServer()
    await new Promise<void>((accept, reject) => { foreign.once('error', reject); foreign.listen(0, host, accept) })
    try {
      const address = foreign.address()
      assert.ok(address && typeof address !== 'string')
      await assert.rejects(assertPortFree(address.port), /no existing server will be reused or stopped/)
      assert.equal(foreign.listening, true)
    } finally { await new Promise<void>((accept) => foreign.close(() => accept())) }
  })
}

for (const port of [5173, 5007]) test(`port guard rejects occupied ${port} before system setup or callback`, async () => {
  // This test never closes an existing user server: only its own exclusive bind.
  const foreign = createServer()
  await new Promise<void>((accept, reject) => { foreign.once('error', reject); foreign.listen({ port, host: '127.0.0.1', exclusive: true }, accept) })
  let called = false
  try {
    await assert.rejects(withIsolatedSystem(async () => { called = true }), /port (5173|5007) is unavailable/)
    assert.equal(called, false)
    assert.equal(foreign.listening, true)
  } finally { await new Promise<void>((accept) => foreign.close(() => accept())) }
})

test('test-only Flask launcher rejects a missing database environment before binding', async () => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'smart-lab-e2e-'))
  const database = join(directory, 'test.sqlite')
  await writeFile(database, '')
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  delete env.SMART_LAB_DATABASE
  try {
    const child = spawnSync(process.env.SMART_LAB_E2E_PYTHON || 'python', ['-B', fileURLToPath(new URL('./flask_server.py', import.meta.url)), '--database', database], { env, windowsHide: true, timeout: 5_000, encoding: 'utf8' })
    assert.ifError(child.error)
    assert.notEqual(child.status, 0)
    assert.match(child.stderr, /SMART_LAB_DATABASE is required; no default is permitted/)
  } finally { await removeFixtureDirectory(directory) }
})

test('an exception after startup still tears down both owned servers and SQLite', async () => {
  let directory = ''
  await assert.rejects(withIsolatedSystem(async (system) => {
    directory = system.directory
    throw new Error('controlled test body failure')
  }), (error: unknown) => error instanceof AggregateError && error.errors.some((item) => item instanceof Error && item.message === 'controlled test body failure'))
  assert.ok(directory)
  await assert.rejects(access(directory), { code: 'ENOENT' })
  await assertPortFree(5173)
  await assertPortFree(5007)
})

test('cleanup removes only named SQLite artifacts from an owned temp directory', async () => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'smart-lab-e2e-'))
  for (const file of ['test.sqlite', 'test.sqlite-wal', 'test.sqlite-shm']) await writeFile(join(directory, file), 'test only')
  await removeFixtureDirectory(directory)
  await assert.rejects(access(directory), { code: 'ENOENT' })
})

test('cleanup preserves unexpected data and refuses a non-fixture directory', async () => {
  await assert.rejects(removeFixtureDirectory(process.cwd()), /Refusing cleanup/)
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'smart-lab-e2e-'))
  const unexpected = join(directory, 'do-not-delete.txt')
  await writeFile(unexpected, 'unique sentinel')
  try {
    await assert.rejects(removeFixtureDirectory(directory), /Unexpected fixture artifact/)
    assert.equal(await readFile(unexpected, 'utf8'), 'unique sentinel')
  } finally {
    await unlink(unexpected)
    await rmdir(directory)
  }
})
