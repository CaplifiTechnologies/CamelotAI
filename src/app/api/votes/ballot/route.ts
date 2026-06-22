// Cast (or change) one seat's ballot on the open vote. Free — no model call.
// POST /api/votes/ballot {voteId, seatKey, option, confidence}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { voteId, seatKey, option, confidence } = (await req.json()) ?? {}
  if (!voteId || !seatKey || !option || !confidence) {
    return NextResponse.json({ error: 'voteId, seatKey, option, confidence required' }, { status: 400 })
  }
  // One ballot per seat — replace any existing one.
  await prisma.ballot.deleteMany({ where: { voteId, seatKey } })
  await prisma.ballot.create({ data: { voteId, seatKey, option, confidence } })
  const ballots = await prisma.ballot.findMany({ where: { voteId } })
  return NextResponse.json({ ballots })
}
