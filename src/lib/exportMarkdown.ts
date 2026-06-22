// Build a full transcript markdown including side-thread branches.

import { prisma } from './prisma'
import { displayName } from './display'

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtMsg(seatKey: string, content: string, createdAt: Date): string[] {
  return [`**${displayName(seatKey)}** — ${fmtTime(createdAt)}`, '', content, '']
}

export async function buildExportMarkdown(): Promise<string> {
  const lines = [
    '# Camelot Transcript',
    '',
    `*exported ${new Date().toLocaleString()}*`,
    '',
    '## Main boardroom',
    '',
  ]

  const main = await prisma.message.findMany({
    where: { threadId: null },
    orderBy: { createdAt: 'asc' },
  })
  for (const m of main) {
    lines.push(...fmtMsg(m.seatKey, m.content, m.createdAt))
  }

  const threads = await prisma.thread.findMany({ orderBy: { createdAt: 'asc' } })
  if (threads.length > 0) {
    lines.push('## Side threads', '')
  }

  for (const t of threads) {
    const parent = await prisma.message.findUnique({ where: { id: t.parentMsgId } })
    const branch = await prisma.message.findMany({
      where: { threadId: t.id },
      orderBy: { createdAt: 'asc' },
    })
    lines.push(`### Thread ${t.id}`, '')
    if (parent) {
      lines.push(
        `*Branched from ${displayName(parent.seatKey)} at ${fmtTime(parent.createdAt)}:*`,
        `> ${parent.content.replace(/\n/g, '\n> ')}`,
        '',
      )
    }
    if (branch.length === 0) {
      lines.push('*(empty branch)*', '')
      continue
    }
    for (const m of branch) {
      lines.push(...fmtMsg(m.seatKey, m.content, m.createdAt))
    }
    lines.push('---', '')
  }

  return lines.join('\n')
}