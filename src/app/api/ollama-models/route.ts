// Available local models for the Invite modal — read from Ollama's tag list.
// GET /api/ollama-models → { models: string[] }

import { NextResponse } from 'next/server'
import { OLLAMA_BASE_URL } from '@/lib/seats'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    if (!res.ok) return NextResponse.json({ models: [] })
    const data = await res.json()
    const models: string[] = (data.models ?? []).map((m: any) => m.name).sort()
    return NextResponse.json({ models })
  } catch {
    return NextResponse.json({ models: [] })
  }
}
