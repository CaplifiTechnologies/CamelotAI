// Optional context injected into Odysseus at session start.
// Configure via ODYSSEUS_INSTRUCTIONS_PATH and CAMELOT_CONTEXT_FILES (comma-separated paths).

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = os.homedir()

export const ODYSSEUS_INSTRUCTIONS_PATH =
  process.env.ODYSSEUS_INSTRUCTIONS_PATH ??
  path.join(HOME, '.camelot', 'odysseus-instructions.md')

export const ODYSSEUS_PRESET_ID = 'camelot_helm'

function contextSources(): { label: string; file: string; maxChars: number }[] {
  const extra = process.env.CAMELOT_CONTEXT_FILES?.trim()
  if (!extra) return []
  return extra.split(',').map((p, i) => ({
    label: `CONTEXT_${i + 1}`,
    file: p.trim().replace(/^~/, HOME),
    maxChars: 32_000,
  }))
}

function readExcerpt(filePath: string, maxChars: number): string {
  try {
    if (!fs.existsSync(filePath)) return ''
    const raw = fs.readFileSync(filePath, 'utf8')
    if (raw.length <= maxChars) return raw
    return `${raw.slice(0, maxChars)}\n\n…[truncated]`
  } catch {
    return ''
  }
}

export function contextBundleFingerprint(): string {
  const parts: string[] = []
  for (const src of contextSources()) {
    try {
      const st = fs.statSync(src.file)
      parts.push(`${src.file}:${st.mtimeMs}:${st.size}`)
    } catch {
      parts.push(`${src.file}:missing`)
    }
  }
  parts.push(ODYSSEUS_INSTRUCTIONS_PATH)
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)
}

export function ensureInstructionsFile(): string {
  if (fs.existsSync(ODYSSEUS_INSTRUCTIONS_PATH)) return ODYSSEUS_INSTRUCTIONS_PATH
  const template = `# Odysseus instructions

Edit this file anytime. Camelot injects it into Odysseus at session start.

## Tone & role
- Concise, capable, honest about limits.
- Prefer doing work with tools over telling the user what to run.

## Boardroom behavior
- Reply as **Odysseus** in a multi-seat boardroom.
- Say **PASS** when you have nothing to add.

## Custom rules
(Add your own standing orders here.)
`
  fs.mkdirSync(path.dirname(ODYSSEUS_INSTRUCTIONS_PATH), { recursive: true })
  fs.writeFileSync(ODYSSEUS_INSTRUCTIONS_PATH, template, 'utf8')
  return ODYSSEUS_INSTRUCTIONS_PATH
}

export function buildMattContextBundle(): string {
  ensureInstructionsFile()

  const sections: string[] = [
    '# Camelot → Odysseus context',
    '',
    'You are Odysseus, a local-first agent seat in the Camelot boardroom.',
    'Optional context files are listed below when CAMELOT_CONTEXT_FILES is set.',
    '',
  ]

  const custom = readExcerpt(ODYSSEUS_INSTRUCTIONS_PATH, 16_000)
  if (custom.trim()) {
    sections.push('## CUSTOM_INSTRUCTIONS', '', custom.trim(), '')
  }

  for (const src of contextSources()) {
    const body = readExcerpt(src.file, src.maxChars)
    if (!body.trim()) continue
    sections.push(`## ${src.label}`, '', body.trim(), '')
  }

  return sections.join('\n')
}