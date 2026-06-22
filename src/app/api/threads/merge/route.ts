// Merge a side thread back to the main feed with a local-model summary.
// Posts as seatKey "side-thread" (not "local" / Local Tally).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { callOllama } from '@/lib/orchestrator'
import { LOCAL_TALLY_MODEL } from '@/lib/seats'
import { displayName, SIDE_THREAD_SEAT_KEY } from '@/lib/display'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { threadId } = (await req.json()) ?? {}
  if (!threadId) {
    return NextResponse.json({ error: 'threadId required' }, { status: 400 })
  }

  const thread = await prisma.thread.findUnique({ where: { id: threadId } })
  if (!thread) {
    return NextResponse.json({ error: 'thread not found' }, { status: 404 })
  }

  const branch = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: 'asc' },
  })
  if (branch.length === 0) {
    return NextResponse.json({ error: 'side thread is empty' }, { status: 400 })
  }

  const transcript = branch
    .map((m) => `${displayName(m.seatKey)}: ${m.content}`)
    .join('\n')

  let summary: string
  try {
    summary = await callOllama(LOCAL_TALLY_MODEL, [
      {
        role: 'system',
        content:
          'Summarize the side-thread discussion in 2–3 sentences for the main boardroom. Start with exactly "Side-thread summary:".',
      },
      { role: 'user', content: transcript },
    ])
  } catch (err) {
    return NextResponse.json(
      { error: `Local summary failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  const trimmed = summary.trim()
  const content = trimmed.startsWith('Side-thread summary:')
    ? trimmed
    : `Side-thread summary: ${trimmed}`

  const message = await prisma.message.create({
    data: {
      seatKey: SIDE_THREAD_SEAT_KEY,
      content: `[merged from thread ${threadId}]\n\n${content}`,
      threadId: null,
    },
  })

  return NextResponse.json({ message })
}