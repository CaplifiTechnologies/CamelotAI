// Grok seat (paid). xAI exposes an OpenAI-compatible Chat Completions API at
// https://api.x.ai/v1. Credentials, in priority order:
//   1. XAI_API_KEY in the environment (from Keychain via with-secrets.mjs), or
//   2. the OIDC session token in ~/.grok/auth.json (the Grok CLI login).
// Server-only. Never import from client code.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildUsage, type ProviderReply } from '@/lib/usage'

const XAI_BASE_URL = process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1'
const GROK_MODEL = process.env.GROK_MODEL ?? 'grok-4.3'
const GROK_AUTH_JSON = process.env.GROK_AUTH_JSON ?? join(homedir(), '.grok', 'auth.json')

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

interface GrokCredential {
  token: string
  source: 'env' | 'keychain' | 'cli'
  expiresAt?: number
}

function jwtExpiry(token: string): number | undefined {
  try {
    const payload = token.split('.')[1]
    if (!payload) return undefined
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof json.exp === 'number' ? json.exp : undefined
  } catch {
    return undefined
  }
}

// Reads the bearer token without caching it to disk or logging it.
export function grokCredential(): GrokCredential | null {
  if (process.env.XAI_API_KEY) {
    return { token: process.env.XAI_API_KEY, source: 'env', expiresAt: jwtExpiry(process.env.XAI_API_KEY) }
  }
  try {
    const k = execFileSync('security', ['find-generic-password', '-s', 'XAI_API_KEY', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (k) return { token: k, source: 'keychain', expiresAt: jwtExpiry(k) }
  } catch {
    /* not in Keychain — try the CLI session next */
  }
  try {
    const data = JSON.parse(readFileSync(GROK_AUTH_JSON, 'utf8'))
    const first = Object.values(data)[0] as { key?: string } | undefined
    if (first?.key) {
      return { token: first.key, source: 'cli', expiresAt: jwtExpiry(first.key) }
    }
  } catch {
    /* no CLI session */
  }
  return null
}

export function grokConfigured(): boolean {
  const cred = grokCredential()
  if (!cred) return false
  if (cred.expiresAt && cred.expiresAt * 1000 < Date.now()) return false
  return true
}

export function grokSource(): 'env' | 'keychain' | 'cli' | null {
  const cred = grokCredential()
  if (!cred) return null
  if (cred.expiresAt && cred.expiresAt * 1000 < Date.now()) return null
  return cred.source
}

function grokExpiryMessage(cred: GrokCredential | null): string {
  if (!cred) {
    return 'no xAI credential (set XAI_API_KEY or log in with the Grok CLI)'
  }
  if (cred.expiresAt && cred.expiresAt * 1000 < Date.now()) {
    return `Grok CLI session expired — re-run \`grok login\` (token source: ${cred.source})`
  }
  return 'no xAI credential (set XAI_API_KEY or log in with the Grok CLI)'
}

export async function askGrok(history: Turn[], system: string): Promise<ProviderReply> {
  const cred = grokCredential()
  if (!cred || (cred.expiresAt && cred.expiresAt * 1000 < Date.now())) {
    throw new Error(grokExpiryMessage(cred))
  }

  const res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cred.token}` },
    body: JSON.stringify({
      model: GROK_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'system', content: system }, ...history],
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 401) {
      throw new Error(
        `Grok session rejected (HTTP 401) — re-run \`grok login\` or set XAI_API_KEY. ${detail.slice(0, 120)}`,
      )
    }
    throw new Error(`xAI ${GROK_MODEL} failed: HTTP ${res.status} ${detail.slice(0, 200)}`)
  }
  const data = await res.json()
  const content = (data?.choices?.[0]?.message?.content ?? '').trim()
  const usage = data?.usage ?? {}
  return {
    content,
    usage: buildUsage(
      GROK_MODEL,
      usage.prompt_tokens ?? 0,
      usage.completion_tokens ?? 0,
    ),
  }
}
