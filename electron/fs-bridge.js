// Sandboxed filesystem access for the renderer (allowed roots only).

const fs = require('fs')
const path = require('path')
const { homedir } = require('os')

const DEFAULT_ROOTS = [
  homedir(),
  path.join(homedir(), 'CamelotAI'),
  path.join(homedir(), 'ALMI'),
  path.join(homedir(), 'ui-hub'),
  path.join(homedir(), 'goal-bot'),
  path.join(homedir(), 'odysseus'),
]

function allowedRoots() {
  const extra = (process.env.CAMELOT_FS_ROOTS ?? '')
    .split(path.delimiter)
    .map((s) => s.trim())
    .filter(Boolean)
  return [...DEFAULT_ROOTS, ...extra]
}

function resolveReal(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

function resolveAllowed(requested) {
  const resolved = path.resolve(requested)
  const real = resolveReal(resolved) ?? resolveReal(path.dirname(resolved))
  if (!real) return null
  for (const root of allowedRoots()) {
    const base = resolveReal(path.resolve(root)) ?? path.resolve(root)
    if (real === base || real.startsWith(base + path.sep)) return resolved
  }
  return null
}

function readText(filePath) {
  const p = resolveAllowed(filePath)
  if (!p) throw new Error('path not in allowed roots')
  return fs.readFileSync(p, 'utf8')
}

function writeText(filePath, content) {
  const p = resolveAllowed(filePath)
  if (!p) throw new Error('path not in allowed roots')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content ?? '', 'utf8')
  return p
}

function listDir(dirPath) {
  const p = resolveAllowed(dirPath)
  if (!p) throw new Error('path not in allowed roots')
  return fs.readdirSync(p, { withFileTypes: true }).map((d) => ({
    name: d.name,
    isDirectory: d.isDirectory(),
  }))
}

module.exports = { allowedRoots, readText, writeText, listDir }