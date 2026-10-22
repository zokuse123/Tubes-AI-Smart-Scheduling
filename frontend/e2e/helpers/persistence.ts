import { spawnSync } from 'node:child_process'
import { expect } from '@playwright/test'
import type { IsolatedSystem } from '../system.ts'

// Read-only evidence from the SAME isolated DB; never inserts assignments or seeds data.
export function readPersistence(system: IsolatedSystem) {
  const code = `import json,sqlite3,sys
from pathlib import Path
with sqlite3.connect(Path(sys.argv[1]).as_uri()+'?mode=ro',uri=True) as db:
 db.row_factory=sqlite3.Row
 previews=[dict(r) for r in db.execute('SELECT id,status,hasil_json,snapshot_json FROM preview_jadwal ORDER BY created_at,id')]
 for p in previews:
  p['hasil_json']=json.loads(p['hasil_json']);p['snapshot_json']=json.loads(p['snapshot_json'])
 versions=[dict(r) for r in db.execute('SELECT id,status,snapshot_json FROM versi_jadwal ORDER BY id')]
 for v in versions:v['snapshot_json']=json.loads(v['snapshot_json'])
 print(json.dumps({'revision':db.execute("SELECT value FROM system_metadata WHERE key='source_revision'").fetchone()[0],'previews':previews,'versions':versions,'details':db.execute('SELECT COUNT(*) FROM detail_jadwal').fetchone()[0]}))`
  const process = spawnSync(globalThis.process.env.SMART_LAB_E2E_PYTHON || 'python', ['-B', '-c', code, system.database], { shell: false, windowsHide: true, timeout: 5_000, encoding: 'utf8' })
  expect(process.error).toBeUndefined()
  expect(process.status, process.stderr).toBe(0)
  return JSON.parse(process.stdout) as {
    revision: number
    previews: { id: string; status: string; hasil_json: Record<string, unknown>; snapshot_json: Record<string, unknown> }[]
    versions: { id: number; status: string; snapshot_json: Record<string, unknown> }[]
    details: number
  }
}
