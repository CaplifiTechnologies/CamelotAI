// Side-thread persistence (build log: SideThread). Branch a conversation off a
// message into an isolated context; messages in the thread carry threadId.
// GET  /api/threads                 → all threads
// POST /api/threads {parentMsgId}   → create a thread branched off a message

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  const threads = await prisma.thread.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ threads })
}

export async function POST(req: Request) {
  const { parentMsgId } = (await req.json()) ?? {}
  if (!parentMsgId) return NextResponse.json({ error: 'parentMsgId required' }, { status: 400 })
  const thread = await prisma.thread.create({ data: { parentMsgId } })
  return NextResponse.json({ thread })
}
