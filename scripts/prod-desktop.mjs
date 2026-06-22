// Production desktop launch: next build (if needed), next start, Electron.
// Use to verify packaged behavior before electron-builder.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PORT = process.env.CAMELOT_WEB_PORT ?? '20020'
const URL = `http://127.0.0.1:${PORT}`
const SMOKE = process.env.CAMELOT_SMOKE === '1'

const children = []
function killAll(code) {
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGTERM')
    } catch {
      try { c.kill('SIGTERM') } catch {}
    }
  }
  process.exit(code ?? 0)
}
process.on('SIGINT', () => killAll(0))
process.on('SIGTERM', () => killAll(0))

async function waitForServer(url, timeoutMs = 90_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.ok || res.status < 500) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
  console.log('[prod-desktop] running next build …')
  await new Promise((resolve, reject) => {
    const b = spawn('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
    b.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`))))
  })
}

console.log(`[prod-desktop] starting next start on :${PORT} …`)
const next = spawn('npm', ['run', 'start', '--', '-p', PORT, '-H', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
  detached: true,
})
children.push(next)
next.on('exit', (code) => {
  console.error(`[prod-desktop] next start exited (${code}).`)
  killAll(code ?? 1)
})

const up = await waitForServer(URL)
if (!up) {
  console.error(`[prod-desktop] server never reachable at ${URL}`)
  killAll(1)
}

console.log(`[prod-desktop] server up. Launching Electron → ${URL}`)
const electron = spawn('npx', ['electron', '.'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, CAMELOT_WEB_URL: URL, CAMELOT_SMOKE: SMOKE ? '1' : '' },
  detached: true,
})
children.push(electron)
electron.on('exit', (code) => {
  console.log(`[prod-desktop] Electron exited (${code}).`)
  killAll(code ?? 0)
})