import { api } from '@/lib/client'
import type { Turn } from '@/lib/providers/anthropic'
import {
  councilRoleSeatKeys,
  parseProposalBlock,
  shouldSkipProposal,
  systemForCounselSeat,
  type CounselRole,
} from '@/lib/counsel'
import type { Message } from '@/store/useBoardroomStore'

export interface CounselRoomMeta {
  id: string
  counselProject?: string | null
  counselPlaybook?: string | null
}

export async function askCounselSeat(
  seatKey: string,
  role: CounselRole | undefined,
  history: Turn[],
  room: CounselRoomMeta,
  messages: Message[],
  opts: { synthesis?: boolean; agentTools?: boolean },
) {
  const systemOverride = systemForCounselSeat(seatKey, role, {
    counselProject: room.counselProject ?? undefined,
    playbook: room.counselPlaybook ?? undefined,
    messages,
    synthesis: opts.synthesis,
  })
  return api.askSeat(seatKey, history, {
    systemOverride,
    roomId: room.id,
    agentTools: opts.agentTools,
    cost: seatKey === 'claude' || seatKey === 'grok' ? 'paid' : 'local',
  })
}

export async function submitProposalFromReply(
  roomId: string,
  seatLabel: string,
  content: string,
  messages: Message[],
) {
  const { plan } = parseProposalBlock(content)
  if (!plan) return { submitted: false as const }
  const ptype = plan.type || plan.proposal_type
  const summary = plan.summary || plan.title
  if (!ptype || !summary) return { submitted: false as const }

  let pending: { proposal_type: string; summary: string }[] = []
  try {
    const d = await api.councilProposals(roomId)
    pending = d.items ?? []
  } catch {
    pending = []
  }

  const skip = shouldSkipProposal(plan, messages, pending)
  if (skip) return { submitted: false as const, skipped: skip }

  const resp = await api.councilPropose({
    room_id: roomId,
    seat: seatLabel,
    type: ptype,
    summary,
    body: plan.body ?? '',
  })
  return { submitted: true as const, duplicate: !!(resp as { duplicate?: boolean }).duplicate }
}

export function roleForSeatKey(roles: CounselRole[], seatKey: string): CounselRole | undefined {
  if (seatKey.startsWith('counsel:')) {
    const id = seatKey.slice('counsel:'.length)
    return roles.find((r) => r.id === id)
  }
  if (seatKey === 'claude' || seatKey === 'grok') return roles.find((r) => r.id === seatKey)
  return undefined
}

export function roundtableSeatOrder(roles: CounselRole[]): string[] {
  return [...councilRoleSeatKeys(roles), 'odysseus-synthesis']
}