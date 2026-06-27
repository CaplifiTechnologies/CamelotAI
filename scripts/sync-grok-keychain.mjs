#!/usr/bin/env node
// Copy ~/.grok/auth.json session token into Keychain as XAI_API_KEY for Camelot.
// Run after `grok login` when you refresh xAI credentials.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const authPath = process.env.GROK_AUTH_JSON ?? join(homedir(), '.grok', 'auth.json')

let token = ''
try {
  const data = JSON.parse(readFileSync(authPath, 'utf8'))
  const first = Object.values(data)[0]
  token = first?.key?.trim() ?? ''
} catch {
  console.error(`[sync-grok] could not read ${authPath} — run grok login first`)
  process.exit(1)
}

if (token.length < 8) {
  console.error('[sync-grok] no token in auth.json')
  process.exit(1)
}

execFileSync(
  'security',
  ['add-generic-password', '-U', '-s', 'XAI_API_KEY', '-a', 'Camelot', '-w', token],
  { stdio: ['ignore', 'ignore', 'pipe'] },
)
console.log('[sync-grok] XAI_API_KEY updated in Keychain from Grok CLI session')