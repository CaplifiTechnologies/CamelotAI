// Fugu Responses API — streaming, web_search, reasoning effort.
// Gated by fuguAgenticConfig().enabled — not used by default @fugu chat seat.

import { readKeychain } from '@/lib/secrets'
import { fuguAgenticConfig } from '@/lib/fuguConfig'
import { buildUsage, type ProviderReply } from '@/lib/usage'

const FUGU_BASE_URL = process.env.FUGU_BASE_URL ?? process.env.SAKANA_BASE_URL ?? 'https://api.sakana.ai/v1'

export interface FuguMissionInput {
  prompt: string
  instructions?: string
  model?: string
  reasoningEffort?: 'high' | 'xhigh' | 'max'
  webSearch?: boolean
  stream?: boolean
}

export interface FuguStreamEvent {
  type: string
  delta?: string
  [key: string]: unknown
}

function apiKey(): string {
  const key = readKeychain('SAKANA_API_KEY')
  if (!key) throw new Error('Fugu offline — SAKANA_API_KEY missing')
  return key
}

function timeoutFor(model: string): number {
  const cfg = fuguAgenticConfig()
  return model.includes('ultra') ? cfg.ultraTimeoutMs : cfg.defaultTimeoutMs
}

export async function fuguResponses(
  input: FuguMissionInput,
): Promise<ProviderReply & { raw?: Record<string, unknown> }> {
  const cfg = fuguAgenticConfig()
  const model = input.model ?? cfg.defaultModel
  const tools = input.webSearch && cfg.webSearch ? [{ type: 'web_search' as const }] : undefined
  const body: Record<string, unknown> = {
    model,
    input: input.prompt,
    stream: false,
    reasoning: { effort: input.reasoningEffort ?? (model.includes('ultra') ? 'xhigh' : 'high') },
  }
  if (input.instructions) body.instructions = input.instructions
  if (tools?.length) body.tools = tools

  const res = await fetch(`${FUGU_BASE_URL}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutFor(model)),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Fugu responses ${model}: HTTP ${res.status} ${detail.slice(0, 200)}`)
  }
  const raw = (await res.json()) as Record<string, unknown>
  let text = String(raw.output_text ?? '').trim()
  if (!text && Array.isArray(raw.output)) {
    for (const item of raw.output as Array<Record<string, unknown>>) {
      if (item.type !== 'message') continue
      for (const part of (item.content as Array<Record<string, unknown>>) ?? []) {
        if (part.type === 'output_text' || part.type === 'text') text += String(part.text ?? '')
      }
    }
    text = text.trim()
  }
  const usage = (raw.usage ?? {}) as Record<string, number>
  return {
    content: text,
    usage: buildUsage(model, usage.input_tokens ?? 0, usage.output_tokens ?? 0),
    raw,
  }
}

export async function* fuguResponsesStream(
  input: FuguMissionInput,
): AsyncGenerator<FuguStreamEvent, ProviderReply, undefined> {
  const cfg = fuguAgenticConfig()
  const model = input.model ?? cfg.defaultModel
  const tools = input.webSearch && cfg.webSearch ? [{ type: 'web_search' as const }] : undefined
  const body: Record<string, unknown> = {
    model,
    input: input.prompt,
    stream: true,
    reasoning: { effort: input.reasoningEffort ?? (model.includes('ultra') ? 'xhigh' : 'high') },
  }
  if (input.instructions) body.instructions = input.instructions
  if (tools?.length) body.tools = tools

  const res = await fetch(`${FUGU_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutFor(model)),
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Fugu stream ${model}: HTTP ${res.status} ${detail.slice(0, 200)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const textParts: string[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    while (buf.includes('\n')) {
      const idx = buf.indexOf('\n')
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') break
      try {
        const event = JSON.parse(payload) as FuguStreamEvent
        if (event.type === 'response.output_text.delta' && event.delta) {
          textParts.push(event.delta)
        }
        yield event
      } catch {
        /* partial SSE line */
      }
    }
  }

  const content = textParts.join('').trim()
  return { content, usage: buildUsage(model, 0, 0) }
}