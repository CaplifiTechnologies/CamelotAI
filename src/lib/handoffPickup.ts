// Handoff drops from ~/ALMI/handoff_slop_watch.py → Odysseus opens with a summary.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { askOdysseus } from '@/lib/providers/odysseus'

const PRIMARY_EXCERPT_CHARS = 12_000

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

function handoffSystemPrompt(mode: HandoffPickup['mode']): string {
  const lines = [
    'You are Odysseus, the local-first Council seat in Camelot.',
    'Matt just dropped a handoff document — the full text and cited references are in your injected context.',
    'Your job right now is to OPEN the conversation with a structured handoff summary.',
    'Read every injected context file before replying.',
    'Do NOT use bash, tools, or file reads — the handoff is already in your injected context.',
    'Do NOT say you will read files or ask to proceed — summarize immediately.',
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

function readPrimaryExcerpt(primaryPath: string): string {
  try {
    const file = primaryPath.replace(/^~/, HOME)
    if (!fs.existsSync(file)) return ''
    const raw = fs.readFileSync(file, 'utf8')
    if (raw.length <= PRIMARY_EXCERPT_CHARS) return raw
    return `${raw.slice(0, PRIMARY_EXCERPT_CHARS)}\n\n…[truncated]`
  } catch {
    return ''
  }
}

function handoffUserPrompt(pickup: HandoffPickup): string {
  const excerpt = readPrimaryExcerpt(pickup.primary)
  const lines = [
    'HANDOFF PICKUP — respond NOW with your structured summary (no preamble, no tool use).',
    '',
    `Project: ${pickup.project_id}`,
    `Title: ${pickup.summary}`,
    `Mode: ${pickup.mode}${pickup.mode_reason ? ` (${pickup.mode_reason})` : ''}`,
    `Bundle: ${pickup.bundle_dir}`,
    `Context files: ${pickup.file_count}`,
    '',
  ]
  if (excerpt.trim()) {
    lines.push('## Primary handoff (excerpt)', '', excerpt.trim(), '')
  }
  lines.push(
    'Additional cited references and HBI context are in your injected context sections.',
    'Open this conversation with your structured summary now.',
  )
  return lines.join('\n')
}

export async function summarizeHandoffWithOdysseus(pickup: HandoffPickup) {
  const threadKey = `handoff-${pickup.id}`
  return askOdysseus(
    [{ role: 'user', content: handoffUserPrompt(pickup) }],
    handoffSystemPrompt(pickup.mode),
    threadKey,
    { mode: 'chat', allowBash: false, allowWebSearch: false },
  )
}