// Odysseus seat (local agent). Talks to the Odysseus HTTP API — not raw Ollama.
// Server-only. Token from ODYSSEUS_API_TOKEN (env or Keychain).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ODYSSEUS_PRESET_ID,
  buildMattContextBundle,
  contextBundleFingerprint,
  ensureInstructionsFile,
} from '@/lib/contextBundle'
import { readKeychain } from '@/lib/secrets'
import { LOCAL_TALLY_MODEL } from '@/lib/seats'
import { latestUserText, tryFileBridge } from '@/lib/odysseusFileBridge'
import { buildUsage, type ProviderReply } from '@/lib/usage'
import type { Turn } from '@/lib/providers/anthropic'

const ODYSSEUS_SETTINGS_PATH =
  process.env.ODYSSEUS_SETTINGS_PATH ??
  path.join(os.homedir(), 'odysseus', 'data', 'settings.json')

export const ODYSSEUS_BASE_URL =
  process.env.ODYSSEUS_BASE_URL ?? 'http://127.0.0.1:7860'

const SESSION_CACHE = new Map<string, string>()
const SESSION_CONTEXT_FP = new Map<string, string>()

const TOOL_CALL_RE = /\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi
const EXEC_FENCE_RE =
  /```(?:web_search|read_file|write_file|create_document|edit_document|update_document|bash|python)\s*\n[\s\S]*?```/gi
const XML_TOOL_CALL_RE =
  /<(?:[\w]+:)?(?:tool_call|function_call)>[\s\S]*?<\/(?:[\w]+:)?(?:tool_call|function_call)>/gi
const BARE_TOOL_CALL_RE = /<tool_call>[\s\S]*$/i
const JSON_TOOL_CALL_RE = /<tool_call>\s*\{[\s\S]*?\}\s*<\/tool_call>/gi

export function odysseusConfigured(): boolean {
  return Boolean(process.env.ODYSSEUS_API_TOKEN || readKeychain('ODYSSEUS_API_TOKEN'))
}

export function odysseusSource(): 'env' | 'keychain' | null {
  if (process.env.ODYSSEUS_API_TOKEN) return 'env'
  return readKeychain('ODYSSEUS_API_TOKEN') ? 'keychain' : null
}

export async function odysseusHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${ODYSSEUS_BASE_URL}/api/health`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

export async function odysseusReachable(): Promise<boolean> {
  return (await odysseusHealthy()) && odysseusConfigured()
}

function authHeaders(): Record<string, string> {
  const token = process.env.ODYSSEUS_API_TOKEN || readKeychain('ODYSSEUS_API_TOKEN')
  if (!token) throw new Error('Odysseus seat offline — add ODYSSEUS_API_TOKEN to Keychain or .env')
  return { Authorization: `Bearer ${token}` }
}

function stripToolBlocks(text: string): string {
  let s = text
  for (let i = 0; i < 4; i++) {
    const next = s
      .replace(TOOL_CALL_RE, '')
      .replace(JSON_TOOL_CALL_RE, '')
      .replace(EXEC_FENCE_RE, '')
      .replace(XML_TOOL_CALL_RE, '')
      .replace(BARE_TOOL_CALL_RE, '')
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    if (next === s) break
    s = next
  }
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

function formatMessage(turns: Turn[], system: string, handoff = false): string {
  const lines = [`[System]\n${system}`, '']
  if (handoff) {
    lines.push('[Handoff — context is inline. Chat-only summary. No tools.]')
  } else {
    lines.push('[Boardroom transcript]')
  }
  for (const t of turns) {
    const who = t.role === 'user' ? 'User' : 'Seat'
    lines.push(`${who}: ${t.content}`)
  }
  if (!handoff) {
    lines.push(
      '',
      '[Your turn — reply as Odysseus. You have local agent tools on this Mac.',
      'Answer roll call and local-capability questions directly — never PASS those.',
      'Other seats in the transcript may be wrong about filesystem access; you are the local helm.]',
    )
  } else {
    lines.push('', '[Your turn — structured handoff summary only. Plain markdown.]')
  }
  return lines.join('\n')
}

function readOdysseusSettings(): { endpoint_id: string; model: string } {
  try {
    if (fs.existsSync(ODYSSEUS_SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(ODYSSEUS_SETTINGS_PATH, 'utf8')) as {
        default_endpoint_id?: string
        default_model?: string
      }
      const model = (raw.default_model ?? '').trim()
      const chat =
        model && !model.includes('embed') && !model.includes('nomic')
          ? model
          : LOCAL_TALLY_MODEL
      return { endpoint_id: (raw.default_endpoint_id ?? '').trim(), model: chat }
    }
  } catch {
    /* ignore */
  }
  return {
    endpoint_id: process.env.ODYSSEUS_ENDPOINT_ID?.trim() ?? '',
    model: process.env.ODYSSEUS_DEFAULT_MODEL?.trim() || LOCAL_TALLY_MODEL,
  }
}

async function defaultChatConfig(): Promise<{ endpoint_id: string; model: string }> {
  try {
    const res = await fetch(`${ODYSSEUS_BASE_URL}/api/default-chat`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = (await res.json()) as {
        endpoint_id?: string
        endpoint_url?: string
        model?: string
      }
      if (data.endpoint_id) {
        return {
          endpoint_id: data.endpoint_id,
          model: data.model?.trim() || LOCAL_TALLY_MODEL,
        }
      }
    }
  } catch {
    /* fall through */
  }
  return readOdysseusSettings()
}

async function injectMattContext(sessionId: string): Promise<void> {
  const fp = contextBundleFingerprint()
  if (SESSION_CONTEXT_FP.get(sessionId) === fp) return

  ensureInstructionsFile()
  const bundle = buildMattContextBundle()
  const body = new URLSearchParams({ context: bundle })

  const res = await fetch(`${ODYSSEUS_BASE_URL}/api/inject_context/${sessionId}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Odysseus context inject failed: HTTP ${res.status} ${err.slice(0, 200)}`)
  }
  SESSION_CONTEXT_FP.set(sessionId, fp)
}

async function ensureSession(threadKey: string): Promise<string> {
  const key = threadKey || 'main'
  const cached = SESSION_CACHE.get(key)
  if (cached) {
    await injectMattContext(cached)
    return cached
  }

  const defaults = await defaultChatConfig()
  if (!defaults.endpoint_id) {
    throw new Error(
      'Odysseus has no model endpoint — open http://127.0.0.1:7860, add Local Ollama in Settings',
    )
  }
  const form = new FormData()
  form.append('name', `Camelot ${key}`)
  form.append('endpoint_id', defaults.endpoint_id)
  form.append('model', defaults.model)

  const res = await fetch(`${ODYSSEUS_BASE_URL}/api/session`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Odysseus session create failed: HTTP ${res.status} ${err.slice(0, 200)}`)
  }
  const data = (await res.json()) as { id?: string; session_id?: string }
  const sid = data.id ?? data.session_id
  if (!sid) throw new Error('Odysseus session create returned no id')
  SESSION_CACHE.set(key, sid)
  await injectMattContext(sid)
  return sid
}

async function consumeAgentStream(res: Response): Promise<string> {
  if (!res.body) throw new Error('Odysseus agent stream returned no body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let roundText = ''
  let lastRound = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') {
          lastRound = roundText
          continue
        }
        try {
          const json = JSON.parse(payload) as {
            delta?: string
            thinking?: boolean
            type?: string
          }
          if (json.type === 'agent_step') {
            if (roundText.trim()) lastRound = roundText
            roundText = ''
            continue
          }
          if (json.delta && !json.thinking) {
            roundText += json.delta
          }
        } catch {
          /* ignore malformed SSE frames */
        }
      }
    }
  }

  const raw = (roundText.trim() || lastRound.trim()).trim()
  return stripToolBlocks(raw)
}

type OdysseusChatOpts = {
  mode?: 'agent' | 'chat'
  allowBash?: boolean
  allowWebSearch?: boolean
  useRag?: boolean
  handoff?: boolean
  timeoutMs?: number
}

async function askOdysseusAgent(
  sessionId: string,
  message: string,
  opts: OdysseusChatOpts = {},
): Promise<string> {
  const form = new FormData()
  form.append('message', message)
  form.append('session', sessionId)
  form.append('mode', opts.mode ?? 'agent')
  form.append('preset_id', ODYSSEUS_PRESET_ID)
  form.append('use_rag', opts.useRag === false ? 'false' : 'true')
  form.append('allow_bash', opts.allowBash === false ? 'false' : 'true')
  form.append('allow_web_search', opts.allowWebSearch === false ? 'false' : 'true')
  form.append('workspace', os.homedir())

  const timeoutMs = opts.timeoutMs ?? 300_000
  const res = await fetch(`${ODYSSEUS_BASE_URL}/api/chat_stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    if (res.status === 401) {
      throw new Error('Odysseus auth rejected — check ODYSSEUS_API_TOKEN')
    }
    throw new Error(`Odysseus agent failed: HTTP ${res.status} ${err.slice(0, 200)}`)
  }
  return consumeAgentStream(res)
}

export async function askOdysseus(
  history: Turn[],
  system: string,
  threadKey = 'main',
  opts: OdysseusChatOpts = {},
): Promise<ProviderReply> {
  const userText = latestUserText(history)
  const bridge = opts.handoff ? { handled: false as const } : tryFileBridge(userText)
  if (bridge.handled && opts.mode !== 'chat') {
    const content = bridge.content
    return {
      content,
      usage: buildUsage('odysseus', Math.ceil(userText.length / 4), Math.ceil(content.length / 4), true),
    }
  }

  const session = await ensureSession(threadKey)
  const message = formatMessage(history, system, opts.handoff === true)
  let content = await askOdysseusAgent(session, message, opts)
  content = stripToolBlocks(content)
  if (!content.trim() && opts.handoff) {
    throw new Error('Odysseus returned empty handoff summary — retry or check Odysseus at :7860')
  }

  // qwen2.5 often narrates write_file without executing — fulfill via verified bridge.
  if (!opts.handoff) {
    const fallback = tryFileBridge(userText)
    if (fallback.handled && wantsWriteLike(userText)) {
      content = fallback.content
    }
  }

  const estIn = Math.ceil(message.length / 4)
  const estOut = Math.ceil(content.length / 4)
  return {
    content,
    usage: buildUsage('odysseus', estIn, estOut, true),
  }
}

function wantsWriteLike(text: string): boolean {
  const t = text.toLowerCase()
  return (
    /\b(write|create|save)\b/.test(t) &&
    (/\b(file|markdown|\.md)\b/.test(t) || /\bwrite me\b/.test(t) || /\bcan you write\b/.test(t))
  )
}