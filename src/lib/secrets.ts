// macOS Keychain helpers for paid seats. Server-only — never import from client code.
// Keys are read at call time and written only via add-generic-password (never to disk).

import { execFileSync } from 'node:child_process'

export type SecretService = 'ANTHROPIC_API_KEY' | 'XAI_API_KEY' | 'ODYSSEUS_API_TOKEN'

export function readKeychain(service: SecretService): string | null {
  if (process.env[service]) return process.env[service]!
  try {
    const value = execFileSync('security', ['find-generic-password', '-s', service, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return value || null
  } catch {
    return null
  }
}

export function secretConfigured(service: SecretService): boolean {
  return Boolean(readKeychain(service))
}

/** Persist a key in the Keychain and hydrate the current process env (no file write). */
export function writeKeychain(service: SecretService, value: string): void {
  const trimmed = value.trim()
  if (trimmed.length < 8) throw new Error('API key looks too short — double-check and try again.')
  execFileSync(
    'security',
    ['add-generic-password', '-U', '-s', service, '-a', 'Camelot', '-w', trimmed],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  process.env[service] = trimmed
}