import { NextResponse } from 'next/server'
import { councilBridgeJson } from '@/lib/councilBridge'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json()
  try {
    const data = await councilBridgeJson('/api/odysseus/ingest', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return NextResponse.json(data, { status: data.ok ? 200 : 400 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'ingest failed' },
      { status: 503 },
    )
  }
}