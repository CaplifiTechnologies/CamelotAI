import { NextResponse } from 'next/server'
import { pendingHandoffPickup } from '@/lib/handoffPickup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const pickup = pendingHandoffPickup()
  if (!pickup) return NextResponse.json({ pending: false })
  return NextResponse.json({ pending: true, pickup })
}