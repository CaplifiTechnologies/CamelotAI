// POST /api/fugu/mission — Responses API agentic turn (disabled by default).

import { NextResponse } from 'next/server'
import { requireAgenticEnabled } from '@/lib/fuguConfig'
import { fuguConfigured } from '@/lib/providers/fugu'
import { fuguResponses } from '@/lib/providers/fuguAgentic'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: Request) {
  const gate = requireAgenticEnabled()
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }
  if (!fuguConfigured()) {
    return NextResponse.json(
      { error: 'SAKANA_API_KEY not configured — console.sakana.ai → Keychain' },
      { status: 503 },
    )
  }

  const body = (await req.json()) as {
    prompt?: string
    instructions?: string
    model?: string
    reasoningEffort?: 'high' | 'xhigh' | 'max'
    webSearch?: boolean
  }
  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  }

  try {
    const reply = await fuguResponses({
      prompt: body.prompt,
      instructions: body.instructions,
      model: body.model,
      reasoningEffort: body.reasoningEffort,
      webSearch: body.webSearch ?? true,
    })
    return NextResponse.json({
      content: reply.content,
      usage: reply.usage,
      model: body.model ?? process.env.FUGU_MODEL ?? 'fugu',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}