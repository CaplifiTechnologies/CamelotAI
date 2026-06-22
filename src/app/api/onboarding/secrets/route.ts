// POST /api/onboarding/secrets — save a paid-seat key to macOS Keychain (never logged).

import { NextResponse } from 'next/server'
import { writeKeychain, type SecretService } from '@/lib/secrets'

export const runtime = 'nodejs'

const ALLOWED: SecretService[] = ['ANTHROPIC_API_KEY', 'XAI_API_KEY', 'ODYSSEUS_API_TOKEN']

export async function POST(req: Request) {
  if (process.platform !== 'darwin') {
    return NextResponse.json(
      { error: 'Keychain import is only available on macOS. Use .env or env vars on other platforms.' },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const service = body.service as SecretService
  const value = typeof body.value === 'string' ? body.value : ''

  if (!ALLOWED.includes(service)) {
    return NextResponse.json({ error: 'Unknown secret service.' }, { status: 400 })
  }
  if (!value.trim()) {
    return NextResponse.json({ error: 'API key is required.' }, { status: 400 })
  }

  try {
    writeKeychain(service, value)
    return NextResponse.json({ ok: true, service })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save to Keychain.' },
      { status: 500 },
    )
  }
}