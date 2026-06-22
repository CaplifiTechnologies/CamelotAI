// Claude seat (paid). Uses the official Anthropic SDK. Server-only — the API
// key comes from process.env.ANTHROPIC_API_KEY, loaded from the macOS Keychain
// by scripts/with-secrets.mjs at launch. Never import this from client code.

import Anthropic from '@anthropic-ai/sdk'
import { readKeychain } from '@/lib/secrets'
import { buildUsage, type ProviderReply } from '@/lib/usage'

// Default to Sonnet for routine boardroom turns; override with ANTHROPIC_MODEL.
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export function anthropicConfigured(): boolean {
  return Boolean(readKeychain('ANTHROPIC_API_KEY'))
}

export function anthropicSource(): 'env' | 'keychain' | null {
  if (process.env.ANTHROPIC_API_KEY) return 'env'
  return readKeychain('ANTHROPIC_API_KEY') ? 'keychain' : null
}

export async function askClaude(history: Turn[], system: string): Promise<ProviderReply> {
  const apiKey = readKeychain('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('Claude seat offline — add ANTHROPIC_API_KEY to Keychain or .env')
  const client = new Anthropic({ apiKey })

  let res
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: history.map((t) => ({ role: t.role, content: t.content })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/credit balance|billing|purchase credits/i.test(msg)) {
      throw new Error('Anthropic credits too low — add billing at console.anthropic.com')
    }
    throw err instanceof Error ? err : new Error(msg)
  }

  const content = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  return {
    content,
    usage: buildUsage(MODEL, res.usage.input_tokens, res.usage.output_tokens),
  }
}
