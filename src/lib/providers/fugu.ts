// Fugu guest seat (paid). Sakana's OpenAI-compatible multi-agent orchestrator.
// Summon-only via @fugu in Council — never auto-routed.
// Server-only. Never import from client code.

import { readKeychain } from '@/lib/secrets'
import { buildUsage, type ProviderReply } from '@/lib/usage'

const FUGU_BASE_URL = process.env.FUGU_BASE_URL ?? process.env.SAKANA_BASE_URL ?? 'https://api.sakana.ai/v1'
const FUGU_MODEL = process.env.FUGU_MODEL ?? 'fugu'
const FUGU_TIMEOUT_MS = Number(
  process.env.FUGU_TIMEOUT_MS ?? (FUGU_MODEL.includes('ultra') ? 300_000 : 120_000),
)

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export function fuguConfigured(): boolean {
  return Boolean(readKeychain('SAKANA_API_KEY'))
}

export function fuguSource(): 'env' | 'keychain' | null {
  if (process.env.SAKANA_API_KEY) return 'env'
  return readKeychain('SAKANA_API_KEY') ? 'keychain' : null
}

export async function askFugu(
  history: Turn[],
  system: string,
  opts?: { model?: string; timeoutMs?: number },
): Promise<ProviderReply> {
  const apiKey = readKeychain('SAKANA_API_KEY')
  if (!apiKey) {
    throw new Error('Fugu is offline — add SAKANA_API_KEY to Keychain or .env (console.sakana.ai)')
  }

  const model = opts?.model ?? FUGU_MODEL
  const timeoutMs = opts?.timeoutMs ?? (model.includes('ultra') ? 300_000 : FUGU_TIMEOUT_MS)

  const res = await fetch(`${FUGU_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: 'system', content: system }, ...history],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Fugu auth rejected — check SAKANA_API_KEY. ${detail.slice(0, 120)}`)
    }
    throw new Error(`Fugu ${model} failed: HTTP ${res.status} ${detail.slice(0, 200)}`)
  }
  const data = await res.json()
  const content = (data?.choices?.[0]?.message?.content ?? '').trim()
  const usage = data?.usage ?? {}
  return {
    content,
    usage: buildUsage(model, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0),
  }
}