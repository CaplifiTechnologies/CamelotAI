// Multi-turn tool loop for seats with agent tools enabled.

import Anthropic from '@anthropic-ai/sdk'
import { readKeychain } from '@/lib/secrets'
import {
  anthropicToolDefs,
  executeTool,
  MAX_TOOL_ROUNDS,
  openAiToolDefs,
  TOOL_SYSTEM_APPEND,
  allowedRootsForPrompt,
} from '@/lib/agentTools'
import { askOllama } from '@/lib/providers/ollama'
import type { Turn } from '@/lib/providers/anthropic'
import { grokCredential } from '@/lib/providers/grok'
import { buildUsage, type ProviderReply, type SeatUsage } from '@/lib/usage'

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
const GROK_MODEL = process.env.GROK_MODEL ?? 'grok-4.3'
const XAI_BASE_URL = process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1'

function mergeUsage(a: SeatUsage, b: SeatUsage): SeatUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    model: b.model || a.model,
    estUsd: a.estUsd + b.estUsd,
    free: a.free && b.free,
  }
}

function toolSystem(base: string): string {
  return `${base}\n\nAllowed roots: ${allowedRootsForPrompt()}\n${TOOL_SYSTEM_APPEND}`
}

function extractAnthropicText(blocks: Anthropic.ContentBlock[]): string {
  return blocks
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

export async function askClaudeWithTools(turns: Turn[], system: string): Promise<ProviderReply> {
  const apiKey = readKeychain('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('Claude seat offline')
  const client = new Anthropic({ apiKey })

  type Msg = Anthropic.MessageParam
  let messages: Msg[] = turns.map((t) => ({ role: t.role, content: t.content }))
  let usage = buildUsage(ANTHROPIC_MODEL, 0, 0)

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let res
    try {
      res = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: toolSystem(system),
        tools: anthropicToolDefs,
        messages,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/credit balance|billing/i.test(msg)) {
        throw new Error('Anthropic credits too low — add billing at console.anthropic.com')
      }
      throw err instanceof Error ? err : new Error(msg)
    }

    usage = mergeUsage(usage, buildUsage(ANTHROPIC_MODEL, res.usage.input_tokens, res.usage.output_tokens))

    if (res.stop_reason === 'end_turn') {
      return { content: extractAnthropicText(res.content), usage }
    }

    if (res.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: res.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue
        const result = await executeTool(block.name, block.input as Record<string, unknown>)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        })
      }
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    return { content: extractAnthropicText(res.content) || 'PASS', usage }
  }

  return { content: 'Tool loop limit reached — try a narrower request.', usage }
}

export async function askGrokWithTools(turns: Turn[], system: string): Promise<ProviderReply> {
  const cred = grokCredential()
  if (!cred) throw new Error('Grok seat offline')

  type OaiMsg = { role: string; content?: string; tool_calls?: any[]; tool_call_id?: string; name?: string }
  const messages: OaiMsg[] = [
    { role: 'system', content: toolSystem(system) },
    ...turns.map((t) => ({ role: t.role, content: t.content })),
  ]
  let usage = buildUsage(GROK_MODEL, 0, 0)

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cred.token}` },
      body: JSON.stringify({
        model: GROK_MODEL,
        max_tokens: 4096,
        tools: openAiToolDefs,
        messages,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`xAI failed: HTTP ${res.status} ${detail.slice(0, 200)}`)
    }
    const data = await res.json()
    const u = data?.usage ?? {}
    usage = mergeUsage(
      usage,
      buildUsage(GROK_MODEL, u.prompt_tokens ?? 0, u.completion_tokens ?? 0),
    )

    const choice = data?.choices?.[0]
    const msg = choice?.message ?? {}
    const toolCalls = msg.tool_calls as any[] | undefined

    if (toolCalls?.length) {
      messages.push(msg)
      for (const tc of toolCalls) {
        const fn = tc.function ?? {}
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(fn.arguments ?? '{}')
        } catch {
          args = {}
        }
        const result = await executeTool(fn.name, args)
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: fn.name,
          content: result,
        })
      }
      continue
    }

    const content = (msg.content ?? '').trim()
    return { content, usage }
  }

  return { content: 'Tool loop limit reached — try a narrower request.', usage }
}

/** Ollama: single-turn with tool results injected via follow-up if model emits TOOL JSON. */
export async function askOllamaWithTools(
  turns: Turn[],
  system: string,
  model: string,
): Promise<ProviderReply> {
  let usage = buildUsage(model, 0, 0, true)
  let history = [...turns]
  const sys = `${toolSystem(system)}\nIf you need a tool, reply ONLY with JSON: {"tool":"read_file","path":"..."} then wait.`

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reply = await askOllama(history, sys, model)
    usage = mergeUsage(usage, reply.usage)

    const toolMatch = reply.content.match(/\{[\s\S]*"tool"\s*:\s*"(list_dir|read_file|write_file)"[\s\S]*\}/)
    if (!toolMatch) {
      return { content: reply.content, usage }
    }

    try {
      const parsed = JSON.parse(toolMatch[0]) as Record<string, unknown>
      const toolName = String(parsed.tool ?? '')
      const result = await executeTool(toolName, parsed)
      history = [
        ...history,
        { role: 'assistant', content: reply.content },
        { role: 'user', content: `Tool result:\n${result}\n\nContinue your answer for the user.` },
      ]
    } catch {
      return { content: reply.content, usage }
    }
  }

  return { content: 'Tool loop limit reached.', usage }
}