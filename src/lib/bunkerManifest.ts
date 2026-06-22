// Read AI bunker hot defaults from MANIFEST.yaml (4TSSD). Server-only.

import fs from 'node:fs'

export const BUNKER_MANIFEST_PATH =
  process.env.BUNKER_MANIFEST_PATH ?? '/Volumes/4TSSD/AI-Stack/bunker/MANIFEST.yaml'

const FALLBACK_HOT = ['qwen3.6:35b-mlx', 'qwen2.5:7b', 'nomic-embed-text']

export interface BunkerChatModel {
  id: string
  label: string
  description: string
  size: string
  tier: string
  default?: boolean
}

export function bunkerMounted(): boolean {
  try {
    return fs.existsSync(BUNKER_MANIFEST_PATH)
  } catch {
    return false
  }
}

function readManifestText(): string | null {
  if (!bunkerMounted()) return null
  try {
    return fs.readFileSync(BUNKER_MANIFEST_PATH, 'utf8')
  } catch {
    return null
  }
}

export function readHotDefaults(): string[] {
  const text = readManifestText()
  if (!text) return [...FALLBACK_HOT]
  const block = text.match(/hot_defaults:\s*\n((?:\s+-\s+.+\n)+)/)
  if (!block) return [...FALLBACK_HOT]
  const models = [...block[1].matchAll(/^\s+-\s+(.+)$/gm)].map((m) => m[1].trim())
  return models.length ? models : [...FALLBACK_HOT]
}

function titleCase(id: string): string {
  const base = id.split(':')[0]
  return base
    .replace(/[-_.]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function recommendedChatModels(): BunkerChatModel[] {
  const text = readManifestText()
  if (!text) return []

  const models: BunkerChatModel[] = []
  const chunks = text.split(/\n  - id: /).slice(1)
  for (const chunk of chunks) {
    const idLine = chunk.split('\n')[0]?.trim()
    if (!idLine) continue
    const tier = chunk.match(/\n    tier: (S\d)/)?.[1] ?? ''
    if (tier !== 'S1' && tier !== 'S2') continue
    const ollamaHot = chunk.match(/\n    ollama_hot: (.+)/)?.[1]?.trim()
    if (!ollamaHot) continue
    const sizeGb = chunk.match(/\n    size_gb: ([\d.]+)/)?.[1]
    const role = chunk.match(/\n    role: (.+)/)?.[1]?.trim() ?? 'local'
    models.push({
      id: ollamaHot,
      label: titleCase(ollamaHot),
      description: `Bunker ${tier} · ${role.replace(/-/g, ' ')}`,
      size: sizeGb ? `~${sizeGb} GB` : '',
      tier,
      default: ollamaHot === 'qwen2.5:7b',
    })
  }
  return models
}