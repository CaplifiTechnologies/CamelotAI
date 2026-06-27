// Handoff drops from ~/ALMI/handoff_slop_watch.py → Odysseus opens with a summary.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { askOdysseus } from '@/lib/providers/odysseus'

const PRIMARY_EXCERPT_CHARS = 5_000
const PER_FILE_CHARS = 4_000
const INLINE_BUNDLE_MAX = 14_000
/** Odysseus rejects messages over 50k — keep formatted payload under this. */
const MAX_HANDOFF_PAYLOAD_CHARS = 46_000

const HOME = os.homedir()

export const HANDOFF_PICKUP_FILE = path.join(HOME, '.camelot', 'handoff-pickup.json')
export const HANDOFF_PICKUP_CONSUMED_FILE = path.join(HOME, '.camelot', 'handoff-pickup.consumed')

export type HandoffPickup = {
  id: string
  fingerprint: string
  project_id: string
  summary: string
  mode: 'discuss' | 'execute'
  mode_reason?: string
  primary: string
  bundle_dir: string
  file_count: number
  created_at: string
}

export function readHandoffPickup(): HandoffPickup | null {
  try {
    if (!fs.existsSync(HANDOFF_PICKUP_FILE)) return null
    const raw = JSON.parse(fs.readFileSync(HANDOFF_PICKUP_FILE, 'utf8')) as HandoffPickup
    if (!raw?.id || !raw.fingerprint || !raw.summary) return null
    return raw
  } catch {
    return null
  }
}

export function readConsumedFingerprint(): string | null {
  try {
    if (!fs.existsSync(HANDOFF_PICKUP_CONSUMED_FILE)) return null
    return fs.readFileSync(HANDOFF_PICKUP_CONSUMED_FILE, 'utf8').trim() || null
  } catch {
    return null
  }
}

export function markHandoffConsumed(fingerprint: string): void {
  fs.mkdirSync(path.dirname(HANDOFF_PICKUP_CONSUMED_FILE), { recursive: true })
  fs.writeFileSync(HANDOFF_PICKUP_CONSUMED_FILE, fingerprint, 'utf8')
}

export function pendingHandoffPickup(): HandoffPickup | null {
  const pickup = readHandoffPickup()
  if (!pickup) return null
  if (readConsumedFingerprint() === pickup.fingerprint) return null
  return pickup
}

function readInlineBundle(pickup: HandoffPickup): string {
  const paths: string[] = []
  try {
    if (fs.existsSync(HANDOFF_CONTEXT_PATHS_FILE)) {
      const fromFile = fs
        .readFileSync(HANDOFF_CONTEXT_PATHS_FILE, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      paths.push(...fromFile)
    }
  } catch {
    /* ignore */
  }
  if (!paths.length && pickup.bundle_dir) {
    try {
      const walk = (dir: string, depth: number) => {
        if (depth > 3 || paths.length > 24) return
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name)
          if (ent.isDirectory()) walk(full, depth + 1)
          else if (/\.(md|txt|json|yaml|yml)$/i.test(ent.name)) paths.push(full)
        }
      }
      walk(pickup.bundle_dir.replace(/^~/, HOME), 0)
    } catch {
      /* ignore */
    }
  }

  const sections: string[] = []
  let total = 0
  for (const raw of paths) {
    if (total >= INLINE_BUNDLE_MAX) break
    const file = raw.replace(/^~/, HOME)
    const body = readFileExcerpt(file, PER_FILE_CHARS)
    if (!body.trim()) continue
    const label = path.basename(file)
    const chunk = `### ${label}\n${body.trim()}`
    if (total + chunk.length > INLINE_BUNDLE_MAX) {
      sections.push(`${chunk.slice(0, INLINE_BUNDLE_MAX - total)}\n\n…[truncated]`)
      break
    }
    sections.push(chunk)
    total += chunk.length
  }
  return sections.join('\n\n')
}

const HANDOFF_CONTEXT_PATHS_FILE = path.join(HOME, '.camelot', 'handoff-context.paths')

function handoffSystemPrompt(mode: HandoffPickup['mode']): string {
  const lines = [
    'You are Odysseus, the local-first Council seat in Camelot.',
    'Matt dropped a handoff — all source text is inline in this message below.',
    'Your job is to OPEN the conversation with a structured handoff summary.',
    'CHAT ONLY: do not use tools, bash, or claim you will fetch anything.',
    'Summarize immediately from the inline context. Do not ask to proceed.',
    'Reply in plain markdown only. Be concise and substantive. Do not reply PASS.',
    'Format your reply with these sections:',
    '**Handoff summary** — what this is about (2–4 sentences)',
    '**Posture** — discuss-first or authorized execute',
    '**Risks & open questions** — bullet list',
    '**Suggested next step** — one clear recommendation for Matt',
  ]
  if (mode === 'discuss') {
    lines.push('Do NOT execute, implement, or ship anything. Council discuss only.')
  } else {
    lines.push('Execute is authorized; flag anything that should pause Grok before it ships.')
  }
  return lines.join(' ')
}

function readFileExcerpt(filePath: string, maxChars: number): string {
  try {
    const file = filePath.replace(/^~/, HOME)
    if (!fs.existsSync(file)) return ''
    const raw = fs.readFileSync(file, 'utf8')
    if (raw.length <= maxChars) return raw
    return `${raw.slice(0, maxChars)}\n\n…[truncated]`
  } catch {
    return ''
  }
}

function readPrimaryExcerpt(primaryPath: string): string {
  return readFileExcerpt(primaryPath, PRIMARY_EXCERPT_CHARS)
}

function trimHandoffUserPrompt(text: string, system: string): string {
  const overhead = system.length + 400
  const budget = MAX_HANDOFF_PAYLOAD_CHARS - overhead
  if (text.length <= budget) return text
  return `${text.slice(0, Math.max(0, budget - 80))}\n\n…[handoff context truncated for Odysseus message limit]`
}

function handoffUserPrompt(pickup: HandoffPickup, system: string): string {
  const excerpt = readPrimaryExcerpt(pickup.primary)
  const inline = readInlineBundle(pickup)
  const lines = [
    'HANDOFF PICKUP — deliver your structured summary now from the inline context below.',
    '',
    `Project: ${pickup.project_id}`,
    `Title: ${pickup.summary}`,
    `Mode: ${pickup.mode}${pickup.mode_reason ? ` (${pickup.mode_reason})` : ''}`,
    `Sources attached: ${pickup.file_count}`,
    '',
  ]
  if (excerpt.trim()) {
    lines.push('## Primary handoff', '', excerpt.trim(), '')
  }
  if (inline.trim()) {
    lines.push('## Bundled context (inline)', '', inline.trim(), '')
  }
  lines.push('Deliver your structured summary now — no preamble, no tools, no file writes.')
  return trimHandoffUserPrompt(lines.join('\n'), system)
}

export async function summarizeHandoffWithOdysseus(pickup: HandoffPickup) {
  const threadKey = `handoff-${pickup.fingerprint}`
  const system = handoffSystemPrompt(pickup.mode)
  return askOdysseus(
    [{ role: 'user', content: handoffUserPrompt(pickup, system) }],
    system,
    threadKey,
    {
      mode: 'chat',
      allowBash: false,
      allowWebSearch: false,
      handoff: true,
      useRag: false,
      timeoutMs: 180_000,
    },
  )
}