import { NextResponse } from 'next/server'
import { councilBridgeJson } from '@/lib/councilBridge'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const data = await councilBridgeJson('/api/counsel/roles')
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'roles unavailable' },
      { status: 503 },
    )
  }
}