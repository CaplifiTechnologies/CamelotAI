import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const DEFAULT_ROOM = { name: 'Main room', counsel: false }

async function ensureDefaultRoom() {
  const count = await prisma.room.count()
  if (count > 0) return
  await prisma.room.create({ data: DEFAULT_ROOM })
}

export async function GET() {
  await ensureDefaultRoom()
  const rooms = await prisma.room.findMany({ orderBy: { updatedAt: 'desc' } })
  return NextResponse.json({ rooms })
}

export async function POST(req: Request) {
  const body = (await req.json()) ?? {}
  const data = {
    ...(typeof body.id === 'string' && body.id.trim() ? { id: body.id.trim() } : {}),
    name: String(body.name || 'Room').trim() || 'Room',
    counsel: Boolean(body.counsel),
    counselProject: body.counselProject ?? null,
    counselInboxId: body.counselInboxId != null ? Number(body.counselInboxId) : null,
    counselPlaybook: body.counselPlaybook ?? null,
  }
  const room = await prisma.room.create({ data })
  return NextResponse.json({ room })
}

export async function PATCH(req: Request) {
  const body = (await req.json()) ?? {}
  const id = body.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const room = await prisma.room.update({
    where: { id },
    data: {
      ...(body.name != null ? { name: String(body.name) } : {}),
      ...(body.counselProject != null ? { counselProject: body.counselProject } : {}),
      ...(body.counselPlaybook != null ? { counselPlaybook: body.counselPlaybook } : {}),
      ...(body.counselInboxId != null ? { counselInboxId: Number(body.counselInboxId) } : {}),
    },
  })
  return NextResponse.json({ room })
}