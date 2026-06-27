// Open table + roundtable orchestration (client-side).

import { api } from '@/lib/client'
import type { Turn } from '@/lib/providers/anthropic'
import { parseProposalBlock } from '@/lib/counsel'
import {
  askCounselSeat,
  roleForSeatKey,
  submitProposalFromReply,
} from '@/lib/counselDispatch'
import type { CounselRole } from '@/lib/counsel'
import {
  apiSeatLabels,
  buildHistory,
  OPEN_TABLE_ADDENDUM,
  ROUNDTABLE_ADDENDUM,
  seatStatusKey,
  synthesisSystemPrompt,
  tableSeatOrder,
  type TableMode,
} from '@/lib/tableFlow'
import type { Message, Seat } from '@/store/useBoardroomStore'
import type { SeatUsage } from '@/lib/usage'
import { displayName } from '@/lib/display'

export interface TableFlowInput {
  mode: TableMode
  counsel: boolean
  activeRoom: {
    id: string
    counselProject?: string | null
    counselPlaybook?: string | null
  } | null
  counselRoles: CounselRole[]
  seats: Seat[]
  messages: Message[]
  agentTools: boolean
  onSeatStatus: (key: string, status: Seat['status']) => void
  onMessage: (msg: Message, usage?: SeatUsage) => Promise<void>
  onNotice: (msg: string) => void
}

async function askSeatWithMode(
  seatKey: string,
  history: Turn[],
  input: TableFlowInput,
  extraSystem?: string,
) {
  const addendum = input.mode === 'roundtable' ? ROUNDTABLE_ADDENDUM : OPEN_TABLE_ADDENDUM
  const room = input.activeRoom

  if (input.counsel && room) {
    const { systemForCounselSeat } = await import('@/lib/counsel')
    const role = roleForSeatKey(input.counselRoles, seatKey)
    const base = systemForCounselSeat(seatKey, role, {
      counselProject: room.counselProject ?? undefined,
      playbook: room.counselPlaybook ?? undefined,
      messages: input.messages,
    })
    return api.askSeat(seatKey, history, {
      systemOverride: `${base}\n${addendum}`,
      roomId: room.id,
      agentTools: input.agentTools,
      cost: seatKey === 'claude' || seatKey === 'grok' ? 'paid' : 'local',
    })
  }

  const seat = input.seats.find((s) => s.key === seatKey)
  return api.askSeat(seatKey, history, {
    systemOverride: extraSystem ? `${extraSystem}\n${addendum}` : addendum,
    roomId: room?.id,
    agentTools: input.agentTools,
    model: seat?.model,
    cost: seat?.cost,
  })
}

export async function runTableRound(input: TableFlowInput): Promise<{ spoke: number; passed: number }> {
  const order = tableSeatOrder(input.seats, {
    counsel: input.counsel,
    counselRoles: input.counselRoles,
  })
  if (!order.length) {
    input.onNotice('No seats enabled at the table.')
    return { spoke: 0, passed: 0 }
  }

  let spoke = 0
  let passed = 0
  const apiSpoke: string[] = []
  let transcript = [...input.messages]

  for (const seatKey of order) {
    const history = buildHistory(transcript)
    const statusKey = seatStatusKey(seatKey)
    input.onSeatStatus(statusKey, 'busy')
    try {
      const { message, usage } = await askSeatWithMode(seatKey, history, input)
      input.onSeatStatus(statusKey, 'online')
      if (!message) {
        passed++
        continue
      }

      const { text, plan } = parseProposalBlock(message.content)
      const content = text || message.content
      const displayMsg: Message = {
        id: message.id,
        seatKey: message.seatKey,
        content,
        createdAt: message.createdAt,
        usage,
      }
      if (content !== message.content) {
        await api.editMessage(message.id, content).catch(() => {})
      }
      await input.onMessage(displayMsg, usage)
      transcript = [...transcript, displayMsg]
      spoke++

      if (seatKey === 'claude' || seatKey === 'grok' || seatKey.startsWith('ollama:')) {
        apiSpoke.push(seatKey)
      }

      if (input.counsel && input.activeRoom && plan) {
        const role = roleForSeatKey(input.counselRoles, seatKey)
        const label = role?.name ?? displayName(seatKey)
        const prop = await submitProposalFromReply(
          input.activeRoom.id,
          label,
          message.content,
          transcript,
        )
        if (prop.submitted) {
          input.onNotice(prop.duplicate ? 'Duplicate proposal skipped' : `${label} · gate pending`)
        }
      }
    } catch (e) {
      input.onSeatStatus(statusKey, 'error')
      input.onNotice(`${displayName(seatKey)}: ${e instanceof Error ? e.message : 'unavailable'}`)
    }
  }

  // Odysseus synthesis — fields API voices, then back to Matt.
  const synthEnabled = input.seats.some((s) => s.key === 'odysseus' && s.enabled)
  if (synthEnabled && (spoke > 0 || apiSpoke.length > 0)) {
    const history = buildHistory(transcript)
    const sys = synthesisSystemPrompt({
      counsel: input.counsel,
      counselProject: input.activeRoom?.counselProject ?? undefined,
      apiSeatLabels: apiSeatLabels(apiSpoke.length ? apiSpoke : order),
    })
    input.onSeatStatus('odysseus', 'busy')
    try {
      const { message, usage } = await api.askSeat('odysseus-synthesis', history, {
        systemOverride: sys,
        roomId: input.activeRoom?.id,
        agentTools: input.agentTools,
        cost: 'local',
      })
      input.onSeatStatus('odysseus', 'online')
      if (message) {
        await input.onMessage(
          {
            id: message.id,
            seatKey: 'odysseus',
            content: message.content,
            createdAt: message.createdAt,
            usage,
          },
          usage,
        )
        if (input.counsel && input.activeRoom) {
          await api.odysseusIngest({
            project: input.activeRoom.counselProject ?? undefined,
            summary: message.content,
            turns: transcript.slice(-16).map((m) => ({
              name: displayName(m.seatKey),
              content: m.content,
            })),
          }).catch(() => {})
        }
        spoke++
      }
    } catch (e) {
      input.onSeatStatus('odysseus', 'error')
      input.onNotice(`Odysseus synthesis: ${e instanceof Error ? e.message : 'failed'}`)
    }
  }

  if (spoke === 0 && passed > 0) {
    input.onNotice('Open table — all seats passed. Your move.')
  } else if (spoke > 0) {
    input.onNotice(input.mode === 'roundtable' ? 'Roundtable complete — your move.' : 'Open table — your move.')
  }

  return { spoke, passed }
}