import { NextResponse } from 'next/server'
import { readHbiSnapshot } from '@/lib/hbiWatch'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const prev = new URL(req.url).searchParams.get('fingerprint')
  const snap = readHbiSnapshot(prev)
  return NextResponse.json(snap)
}