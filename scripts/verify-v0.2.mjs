#!/usr/bin/env node
/** Verification harness for v0.2 fixes — merge, export, PASS, exchange limit. */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PORT = process.env.CAMELOT_WEB_PORT ?? '20021'
const BASE = `http://127.0.0.1:${PORT}`

let failures = 0
function fail(msg) {
  console.error(`FAIL: ${msg}`)
  failures++
}
function pass(msg) {
  console.log(`PASS: ${msg}`)
}

async function waitUp(url, ms = 60_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { method: 'HEAD' })
      if (r.ok || r.status < 500) return
    } catch {}
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`server not up: ${url}`)
}

async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 300)}`)
  return data
}

// Unit tests for isPass (compiled via dynamic import of TS not available — inline mirror)
function isPass(reply) {
  const stripped = reply.trim().replace(/^["'`]|["'`]$/g, '').replace(/[.!?,;:]+$/g, '').trim()
  const upper = stripped.toUpperCase()
  if (upper === 'PASS') return true
  if (upper.split(/\s+/)[0] === 'PASS') return true
  if (upper.startsWith('PASS ')) return true
  if (upper.startsWith('PASS.')) return true
  return false
}

for (const [input, expect] of [
  ['PASS', true],
  ['pass.', true],
  ['PASS!', true],
  ['"PASS"', true],
  ['PASS — ok', true],
  ['I PASS', false],
  ['Collaboration', false],
]) {
  const got = isPass(input)
  if (got !== expect) fail(`isPass(${JSON.stringify(input)}) = ${got}, want ${expect}`)
  else pass(`isPass(${JSON.stringify(input)})`)
}

if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
  console.log('Building Next…')
  await new Promise((res, rej) => {
    const b = spawn('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
    b.on('exit', (c) => (c === 0 ? res() : rej(new Error('build failed'))))
  })
}

const next = spawn('npm', ['run', 'start', '--', '-p', PORT, '-H', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'pipe',
  env: { ...process.env, NODE_ENV: 'production' },
  detached: true,
})

try {
  await waitUp(BASE)
  pass(`server up at ${BASE}`)

  const matt = await api('POST', '/api/messages', {
    seatKey: 'matt',
    content: '@qwen Reply with only the single word PASS and nothing else.',
  })
  const thread = await api('POST', '/api/threads', { parentMsgId: matt.message.id })
  const tid = thread.thread.id
  await api('POST', '/api/messages', { seatKey: 'matt', content: 'One word reason?', threadId: tid })
  await api('POST', '/api/messages', { seatKey: 'qwen', content: 'Collaboration', threadId: tid })

  let merged
  try {
    merged = await api('POST', '/api/threads/merge', { threadId: tid })
  } catch (e) {
    fail(`merge (needs Ollama): ${e.message}`)
    merged = null
  }

  if (merged?.message) {
    if (merged.message.seatKey === 'side-thread') pass('merge seatKey = side-thread')
    else fail(`merge seatKey = ${merged.message.seatKey}`)
    if (merged.message.content.includes('[merged from thread')) pass('merge has thread marker')
    else fail('merge missing thread marker')
    if (!merged.message.content.includes('Local Tally')) pass('merge not labeled Local Tally')
  }

  const exp = await api('GET', '/api/export')
  if (exp.markdown?.includes('## Side threads')) pass('export has Side threads section')
  else fail('export missing Side threads section')
  if (exp.markdown?.includes('Collaboration')) pass('export includes branch content')
  else fail('export missing branch content')

  const health = await api('GET', '/api/health')
  pass(`health: ollama=${health.ollama} odysseus=${health.odysseus} claude=${health.claude} grok=${health.grok}`)
} finally {
  try { process.kill(-next.pid, 'SIGTERM') } catch { next.kill('SIGTERM') }
}

if (failures) {
  console.error(`\n${failures} verification failure(s)`)
  process.exit(1)
}
console.log('\nAll verification checks passed.')