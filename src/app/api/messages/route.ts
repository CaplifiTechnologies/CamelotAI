// Persistence (locked decision #1): messages live in SQLite via Prisma.
// GET   /api/messages            → main transcript (no thread), oldest first
// GET   /api/messages?threadId=… → one side thread's messages
// POST  /api/messages {seatKey, content, threadId?} → persist one message
// PATCH /api/messages {id, content}                 → edit (records editedAt)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const threadId = searchParams.get('threadId')
  const roomId = searchParams.get('roomId')
  const where: { threadId: string | null; roomId?: string | null } = threadId
    ? { threadId }
    : { threadId: null }
  if (roomId) where.roomId = roomId
  else if (!threadId) where.roomId = null
  const messages = await prisma.message.findMany({ where, orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ messages })
}

export async function POST(req: Request) {
  const { seatKey, content, threadId, roomId } = (await req.json()) ?? {}
  if (!seatKey || typeof content !== 'string') {
    return NextResponse.json({ error: 'seatKey and content required' }, { status: 400 })
  }
  const message = await prisma.message.create({
    data: {
      seatKey,
      content,
      threadId: threadId ?? null,
      roomId: roomId ?? null,
    },
  })
  return NextResponse.json({ message })
}

export async function PATCH(req: Request) {
  const { id, content } = (await req.json()) ?? {}
  if (!id || typeof content !== 'string') {
    return NextResponse.json({ error: 'id and content required' }, { status: 400 })
  }
  const message = await prisma.message.update({
    where: { id },
    data: { content, editedAt: new Date() },
  })
  return NextResponse.json({ message })
}
