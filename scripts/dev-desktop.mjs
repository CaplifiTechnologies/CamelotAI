// One-command desktop launch: start Next dev, wait for the port, open Electron.
// Tears the dev server down when Electron exits. Dependency-free.
//
//   npm run desktop          → launch the desktop app
//   CAMELOT_SMOKE=1 ...      → boot, confirm the shell loads, then quit (CI smoke)

import { spawn } from 'node:child_process'

const PORT = process.env.CAMELOT_WEB_PORT ?? '20020'
const URL = `http://localhost:${PORT}`
const SMOKE = process.env.CAMELOT_SMOKE === '1'

const children = []
function killAll(code) {
  for (const c of children) {
    try {
      // Children are spawned detached → they lead their own process group.
      // Negative PID signals the whole group, reaping grandchildren (e.g. the
      // next-server forked by `next dev`) so the port is always released.
      process.kill(-c.pid, 'SIGTERM')
    } catch {
      try { c.kill('SIGTERM') } catch {}
    }
  }
  process.exit(code ?? 0)
}
process.on('SIGINT', () => killAll(0))
process.on('SIGTERM', () => killAll(0))

async function waitForServer(url, timeoutMs = 60_000) {
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

console.log(`[desktop] starting council bridge on :${process.env.CAMELOT_COUNCIL_PORT ?? '20022'} …`)
const { startCouncilBridge } = await import('./start-council-bridge.mjs')
startCouncilBridge()

console.log(`[desktop] starting Next dev on :${PORT} …`)
const next = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  env: process.env,
  detached: true, // own process group → killAll reaps the next-server grandchild
})
children.push(next)
next.on('exit', (code) => {
  console.error(`[desktop] Next dev exited (${code}).`)
  killAll(code ?? 1)
})

const up = await waitForServer(URL)
if (!up) {
  console.error(`[desktop] Next dev never became reachable at ${URL}.`)
  killAll(1)
}
console.log(`[desktop] Next is up at ${URL}. Launching Electron…`)

const electron = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  env: { ...process.env, CAMELOT_SMOKE: SMOKE ? '1' : '' },
  detached: true,
})
children.push(electron)
electron.on('exit', (code) => {
  console.log(`[desktop] Electron exited (${code}). Shutting down dev server.`)
  killAll(code ?? 0)
})
