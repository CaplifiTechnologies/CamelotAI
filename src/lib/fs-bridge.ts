// Sandboxed filesystem access for agent tools (server-side). Mirrors electron/fs-bridge.js.

import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

const DEFAULT_ROOTS = [
  homedir(),
  path.join(homedir(), 'CamelotAI'),
  path.join(homedir(), 'ALMI'),
  path.join(homedir(), 'ui-hub'),
  path.join(homedir(), 'goal-bot'),
  path.join(homedir(), 'odysseus'),
]

function allowedRoots(): string[] {
  const extra = (process.env.CAMELOT_FS_ROOTS ?? '')
    .split(path.delimiter)
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set([...DEFAULT_ROOTS, ...extra].map((r) => path.resolve(r)))]
}

function resolveReal(p: string): string | null {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

function resolveAllowed(requested: string): string | null {
  const resolved = path.resolve(requested)
  const real = resolveReal(resolved) ?? resolveReal(path.dirname(resolved))
  if (!real) return null
  for (const root of allowedRoots()) {
    const base = resolveReal(root) ?? root
    if (real === base || real.startsWith(base + path.sep)) return resolved
  }
  return null
}

export function getAllowedRoots(): string[] {
  return allowedRoots()
}

export function readTextFile(filePath: string): string {
  const p = resolveAllowed(filePath)
  if (!p) throw new Error(`Path not allowed: ${filePath}`)
  return fs.readFileSync(p, 'utf8')
}

export function writeTextFile(filePath: string, content: string): string {
  const p = resolveAllowed(filePath)
  if (!p) throw new Error(`Path not allowed: ${filePath}`)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content ?? '', 'utf8')
  return p
}

export function listDirectory(dirPath: string): { name: string; isDirectory: boolean }[] {
  const p = resolveAllowed(dirPath)
  if (!p) throw new Error(`Path not allowed: ${dirPath}`)
  return fs.readdirSync(p, { withFileTypes: true }).map((d) => ({
    name: d.name,
    isDirectory: d.isDirectory(),
  }))
}