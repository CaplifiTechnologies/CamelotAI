// Table modes — Open (default), Roundtable, Vote (VotePanel).

import type { Turn } from '@/lib/providers/anthropic'
import { isSummonOnlySeat, SEATS } from '@/lib/seats'
import { councilRoleSeatKeys, type CounselRole } from '@/lib/counsel'
import type { Seat } from '@/store/useBoardroomStore'

export type TableMode = 'open' | 'roundtable'

export const OPEN_TABLE_ADDENDUM =
  'Open table: reply only if you have something substantive for Matt. If you have nothing to add, reply with exactly PASS — you will not appear in the transcript.'

export const ROUNDTABLE_ADDENDUM =
  'Roundtable: you are expected to speak. Give your genuine perspective on what Matt raised; use PASS only if literally nothing applies to your role.'

export function synthesisSystemPrompt(opts: {
  counsel?: boolean
  counselProject?: string
  apiSeatLabels: string[]
}): string {
  const topic = opts.counselProject ? `Project: ${opts.counselProject}. ` : ''
  const peers = opts.apiSeatLabels.length ? opts.apiSeatLabels.join(', ') : 'the other seats'
  return [
    `You are Odysseus, Matt's helm agent in Camelot. ${topic}`,
    `SYNTHESIS — ${peers} just spoke on Matt's behalf.`,
    'Your job: (1) summarize what each voice said that matters for Matt,',
    '(2) merge any URLs/steps into one numbered list if present,',
    '(3) state what you will remember for future sessions.',
    'Do not reply PASS. Be substantive — this turn goes back to Matt.',
  ].join(' ')
}

/** Seats that get a turn before Odysseus synthesis (API/local peers — not synthesis). */
export function tableSeatOrder(
  seats: Seat[],
  opts: { counsel: boolean; counselRoles: CounselRole[] },
): string[] {
  const enabled = seats.filter((s) => s.enabled && s.visible !== false && !isSummonOnlySeat(s.key))
  const enabledKeys = new Set(enabled.map((s) => s.key))

  if (opts.counsel) {
    const roleKeys = councilRoleSeatKeys(opts.counselRoles).filter((k) => k !== 'odysseus-synthesis')
    const ordered = roleKeys.filter((k) => {
      if (k === 'claude' || k === 'grok') return enabledKeys.has(k)
      return true // counsel:* always attempted via odysseus
    })
    return ordered
  }

  const order: string[] = []
  for (const k of ['claude', 'grok', 'odysseus'] as const) {
    if (enabledKeys.has(k)) order.push(k)
  }
  for (const s of enabled) {
    if (!order.includes(s.key) && s.key !== 'qwen' && s.key !== 'local') {
      order.push(s.key)
    }
  }
  return order.filter((k) => k !== 'odysseus-synthesis')
}

export function apiSeatLabels(seatKeys: string[]): string[] {
  return seatKeys
    .filter((k) => k === 'claude' || k === 'grok' || k.startsWith('ollama:'))
    .map((k) => SEATS.find((s) => s.key === k)?.name ?? k)
}

export function seatStatusKey(seatKey: string): string {
  return seatKey.startsWith('counsel:') ? 'odysseus' : seatKey
}

export function buildHistory(messages: { seatKey: string; content: string }[]): Turn[] {
  return messages.map((m) => ({
    role: m.seatKey === 'matt' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }))
}