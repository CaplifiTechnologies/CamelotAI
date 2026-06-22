// Local seat (free). Talks to Ollama directly — no key, no cost. Server-only so
// it isn't blocked by browser CORS. Default model is the boardroom tally model.

import { LOCAL_TALLY_MODEL, OLLAMA_BASE_URL } from '@/lib/seats'
import { buildUsage, type ProviderReply } from '@/lib/usage'

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export async function askOllama(
  history: Turn[],
  system: string,
  model: string = LOCAL_TALLY_MODEL,
): Promise<ProviderReply> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: 'system', content: system }, ...history],
    }),
  })
  if (!res.ok) throw new Error(`Ollama ${model} failed: HTTP ${res.status}`)
  const data = await res.json()
  const content = (data?.message?.content ?? '').trim()
  return {
    content,
    usage: buildUsage(
      model,
      data.prompt_eval_count ?? 0,
      data.eval_count ?? 0,
      true,
    ),
  }
}

export async function ollamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    return res.ok
  } catch {
    return false
  }
}
