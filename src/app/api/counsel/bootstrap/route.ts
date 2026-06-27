import { NextResponse } from 'next/server'
import { councilBridgeJson } from '@/lib/councilBridge'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const inbox = new URL(req.url).searchParams.get('inbox')
  if (!inbox) return NextResponse.json({ ok: false, error: 'inbox required' }, { status: 400 })
  try {
    const data = await councilBridgeJson(`/api/counsel/bootstrap?inbox=${encodeURIComponent(inbox)}`)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'bootstrap failed' },
      { status: 503 },
    )
  }
}