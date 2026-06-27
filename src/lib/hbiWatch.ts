// HBI queue watch — fingerprint MANIFEST.json; notify Matt, never auto-execute.

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = os.homedir()

const HBI_PATHS = [
  path.join(HOME, 'Dropbox', 'Caplifi', 'HBI', 'MANIFEST.json'),
  path.join(HOME, 'HBI', 'MANIFEST.json'),
  path.join(HOME, 'idea-log-engine', 'MANIFEST.json'),
]

export type HbiSnapshot = {
  ok: boolean
  path: string | null
  fingerprint: string
  count: number
  newCount: number
  titles: string[]
  changed: boolean
}

function resolveManifest(): string | null {
  for (const p of HBI_PATHS) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function fingerprintFile(filePath: string): string {
  const st = fs.statSync(filePath)
  const raw = fs.readFileSync(filePath, 'utf8')
  return crypto.createHash('sha256').update(`${st.mtimeMs}:${st.size}:${raw}`).digest('hex').slice(0, 16)
}

function parseItems(raw: string): { title: string; status?: string }[] {
  try {
    const data = JSON.parse(raw)
    const items = data.items ?? data.queue ?? (Array.isArray(data) ? data : [])
    const out: { title: string; status?: string }[] = []
    for (const it of items) {
      if (typeof it === 'string') out.push({ title: it })
      else if (it && typeof it === 'object') {
        out.push({
          title: String(it.title ?? it.name ?? it.id ?? 'item'),
          status: it.status,
        })
      }
    }
    return out
  } catch {
    return []
  }
}

export function readHbiSnapshot(previousFingerprint?: string | null): HbiSnapshot {
  const manifest = resolveManifest()
  if (!manifest) {
    return {
      ok: false,
      path: null,
      fingerprint: '',
      count: 0,
      newCount: 0,
      titles: [],
      changed: false,
    }
  }
  const fp = fingerprintFile(manifest)
  const items = parseItems(fs.readFileSync(manifest, 'utf8'))
  const pending = items.filter((i) =>
    ['new', 'queued', 'pending', ''].includes(String(i.status ?? '').toLowerCase()),
  )
  const changed = Boolean(previousFingerprint && previousFingerprint !== fp)
  return {
    ok: true,
    path: manifest,
    fingerprint: fp,
    count: items.length,
    newCount: pending.length,
    titles: pending.slice(0, 6).map((i) => i.title),
    changed,
  }
}