import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  markHandoffConsumed,
  pendingHandoffPickup,
  summarizeHandoffWithOdysseus,
} from '@/lib/handoffPickup'
import { odysseusConfigured } from '@/lib/providers/odysseus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let inFlightFingerprint: string | null = null
let inFlightSince = 0
const IN_FLIGHT_STALE_MS = 120_000

export async function POST() {
  const pickup = pendingHandoffPickup()
  if (!pickup) {
    return NextResponse.json({ opened: false, reason: 'no_pending_handoff' })
  }
  if (
    inFlightFingerprint === pickup.fingerprint &&
    Date.now() - inFlightSince < IN_FLIGHT_STALE_MS
  ) {
    return NextResponse.json({ opened: false, reason: 'already_opening' })
  }
  if (inFlightFingerprint && Date.now() - inFlightSince >= IN_FLIGHT_STALE_MS) {
    inFlightFingerprint = null
  }
  if (!odysseusConfigured()) {
    return NextResponse.json(
      { error: 'Odysseus offline — add ODYSSEUS_API_TOKEN to open handoff summaries.' },
      { status: 503 },
    )
  }

  inFlightFingerprint = pickup.fingerprint
  inFlightSince = Date.now()
  try {
    const introMarker = `📥 Handoff received — **${pickup.summary}** (${pickup.mode})`
    const existingIntro = await prisma.message.findFirst({
      where: { seatKey: 'matt', content: introMarker },
      orderBy: { createdAt: 'desc' },
    })

    const intro =
      existingIntro ??
      (await prisma.message.create({
        data: { seatKey: 'matt', content: introMarker },
      }))

    const reply = await summarizeHandoffWithOdysseus(pickup)
    const clean = reply.content.trim()
    if (!clean) {
      throw new Error('Odysseus returned an empty summary')
    }

    const summary = await prisma.message.create({
      data: { seatKey: 'odysseus', content: clean },
    })

    markHandoffConsumed(pickup.fingerprint)

    return NextResponse.json({
      opened: true,
      pickup,
      messages: [intro, summary],
      usage: reply.usage,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: `Handoff open failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 },
    )
  } finally {
    inFlightFingerprint = null
  }
}