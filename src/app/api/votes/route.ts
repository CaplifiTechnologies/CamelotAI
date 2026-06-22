// Voting persistence (build log: VotePanel). Tally is Ollama-only (cost rule).
// GET  /api/votes              → the current open vote (with ballots) or null
// POST /api/votes {topic, options[]} → open a new vote

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  const vote = await prisma.vote.findFirst({
    where: { status: 'open' },
    orderBy: { createdAt: 'desc' },
    include: { ballots: true },
  })
  if (!vote) return NextResponse.json({ vote: null })
  return NextResponse.json({ vote: { ...vote, options: JSON.parse(vote.options) } })
}

export async function POST(req: Request) {
  const { topic, options } = (await req.json()) ?? {}
  if (!topic || !Array.isArray(options) || options.length < 2) {
    return NextResponse.json({ error: 'topic and >=2 options required' }, { status: 400 })
  }
  // One open vote at a time — close any prior open vote.
  await prisma.vote.updateMany({ where: { status: 'open' }, data: { status: 'abandoned' } })
  const vote = await prisma.vote.create({
    data: { topic, options: JSON.stringify(options) },
    include: { ballots: true },
  })
  return NextResponse.json({ vote: { ...vote, options } })
}
