// POST /api/onboarding/assist — local Ollama answers setup questions (no keys in chat).

import { NextResponse } from 'next/server'
import { ONBOARDING_ASSISTANT_SYSTEM } from '@/lib/onboarding'
import { LOCAL_TALLY_MODEL } from '@/lib/seats'
import { askOllama, ollamaReachable } from '@/lib/providers/ollama'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const model = typeof body.model === 'string' && body.model ? body.model : LOCAL_TALLY_MODEL

  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: 'Question is too long.' }, { status: 400 })
  }

  const reachable = await ollamaReachable()
  if (!reachable) {
    return NextResponse.json(
      {
        error:
          'Local assistant is offline — finish the Ollama step first, or read the safety tips on this screen.',
      },
      { status: 503 },
    )
  }

  try {
    const { content: answer } = await askOllama(
      [{ role: 'user', content: question }],
      ONBOARDING_ASSISTANT_SYSTEM,
      model,
    )
    return NextResponse.json({ answer })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Local assistant failed.' },
      { status: 500 },
    )
  }
}