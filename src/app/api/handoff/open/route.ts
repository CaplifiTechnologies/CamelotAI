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

export async function POST() {
  const pickup = pendingHandoffPickup()
  if (!pickup) {
    return NextResponse.json({ opened: false, reason: 'no_pending_handoff' })
  }
  if (!odysseusConfigured()) {
    return NextResponse.json(
      { error: 'Odysseus offline — add ODYSSEUS_API_TOKEN to open handoff summaries.' },
      { status: 503 },
    )
  }

  try {
    const intro = await prisma.message.create({
      data: {
        seatKey: 'matt',
        content: `📥 Handoff received — **${pickup.summary}** (${pickup.mode})`,
      },
    })

    const reply = await summarizeHandoffWithOdysseus(pickup)
    const summary = await prisma.message.create({
      data: { seatKey: 'odysseus', content: reply.content },
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
  }
}