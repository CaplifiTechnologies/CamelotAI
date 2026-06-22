// Tally the open vote and close it. The numeric result is computed
// deterministically; a FREE local model (Ollama qwen2.5:7b) narrates it.
// Cost rule: tally NEVER uses a paid seat.
// POST /api/votes/tally {voteId} → { winner, counts, rationale, via }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tallyVotes } from '@/lib/orchestrator'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { voteId } = (await req.json()) ?? {}
  if (!voteId) return NextResponse.json({ error: 'voteId required' }, { status: 400 })

  const vote = await prisma.vote.findUnique({ where: { id: voteId }, include: { ballots: true } })
  if (!vote) return NextResponse.json({ error: 'vote not found' }, { status: 404 })

  const tally = await tallyVotes(
    vote.topic,
    vote.ballots.map((b) => ({
      seatKey: b.seatKey,
      option: b.option,
      confidence: b.confidence as 'high' | 'med' | 'low',
    })),
  )

  await prisma.vote.update({
    where: { id: voteId },
    data: { status: 'closed', winner: tally.winner, result: tally.rationale },
  })

  return NextResponse.json({ tally })
}
