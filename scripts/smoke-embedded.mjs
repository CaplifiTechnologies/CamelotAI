// Smoke the embedded Next server path (what ships in .dmg) — no external next start.
// Sets CAMELOT_FORCE_PACKAGED=1 and does NOT set CAMELOT_WEB_URL.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SMOKE = process.env.CAMELOT_SMOKE !== '0'

if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
  console.log('[smoke-embedded] next build …')
  await new Promise((res, rej) => {
    const b = spawn('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
    b.on('exit', (c) => (c === 0 ? res() : rej(new Error(`build ${c}`))))
  })
}

console.log('[smoke-embedded] launching Electron (embedded Next server)…')
const electron = spawn('npx', ['electron', '.'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    CAMELOT_FORCE_PACKAGED: '1',
    CAMELOT_SMOKE: SMOKE ? '1' : '',
  },
})

electron.on('exit', (code) => process.exit(code ?? 0))