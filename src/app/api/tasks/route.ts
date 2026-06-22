// Task queue persistence (build log: TaskPanel).
// GET   /api/tasks                                   → all tasks, newest first
// POST  /api/tasks {description, assignedTo?}        → create (status "open")
// PATCH /api/tasks {id, status?, assignedTo?, result?} → claim / complete / edit

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  const tasks = await prisma.task.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ tasks })
}

export async function POST(req: Request) {
  const { description, assignedTo } = (await req.json()) ?? {}
  if (!description || typeof description !== 'string') {
    return NextResponse.json({ error: 'description required' }, { status: 400 })
  }
  const task = await prisma.task.create({
    data: { description, assignedTo: assignedTo ?? null },
  })
  return NextResponse.json({ task })
}

export async function PATCH(req: Request) {
  const { id, status, assignedTo, result } = (await req.json()) ?? {}
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const task = await prisma.task.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(assignedTo !== undefined ? { assignedTo } : {}),
      ...(result !== undefined ? { result } : {}),
    },
  })
  return NextResponse.json({ task })
}
