// Client-side seat dispatch with automatic fallback when a seat fails.

import { api } from '@/lib/client'
import {
  routeMessage,
  seatFallbackChain,
  type RouteContext,
} from '@/lib/orchestrator'
import type { Turn } from '@/lib/providers/anthropic'
import { SEATS } from '@/lib/seats'
import type { SeatUsage } from '@/lib/usage'

import type { Seat } from '@/store/useBoardroomStore'

export interface DispatchInput {
  text: string
  mention?: string
  localOnly: boolean
  seats: Seat[]
  history: Turn[]
  threadId?: string
  agentTools?: boolean
  onSeatStatus: (key: string, status: Seat['status']) => void
}

export interface DispatchResult {
  message: { id: string; seatKey: string; content: string; createdAt: string } | null
  usage?: SeatUsage
  notice?: string
  error?: string
}

export function buildRouteContext(seats: Seat[], localOnly: boolean): RouteContext {
  const routing = seats.filter((s) => s.enabled)
  return {
    localOnly,
    activeSeatKeys: routing.map((s) => s.key),
    seatStatus: Object.fromEntries(routing.map((s) => [s.key, s.status])),
  }
}

export function visibleEnabledSeats(seats: Seat[]): Seat[] {
  return seats.filter((s) => s.enabled && s.visible !== false)
}

function seatLabel(key: string): string {
  return SEATS.find((s) => s.key === key)?.name ?? key
}

export async function dispatchWithFallback(input: DispatchInput): Promise<DispatchResult> {
  const ctx = buildRouteContext(input.seats, input.localOnly)
  const route = routeMessage(input.text, ctx, input.mention)

  if (route.seat === 'system') {
    return { message: null, error: route.note ?? 'Blocked by Cost Guard.' }
  }

  const chain = seatFallbackChain(route.seat, ctx)
  const failures: string[] = []

  for (const seatKey of chain) {
    const seat = input.seats.find((s) => s.key === seatKey)
    input.onSeatStatus(seatKey, 'busy')
    try {
      const { message, usage } = await api.askSeat(seatKey, input.history, {
        model: seat?.model,
        cost: seat?.cost,
        threadId: input.threadId,
        agentTools: input.agentTools,
      })
      input.onSeatStatus(seatKey, 'online')
      if (seatKey !== route.seat) {
        return {
          message,
          usage,
          notice: `${seatLabel(seatKey)} stepped in (${seatLabel(route.seat)} unavailable).`,
        }
      }
      return { message, usage }
    } catch (e) {
      input.onSeatStatus(seatKey, 'error')
      const msg = e instanceof Error ? e.message : String(e)
      failures.push(`${seatLabel(seatKey)}: ${shortError(msg)}`)
    }
  }

  return {
    message: null,
    error:
      failures.length > 0
        ? `No seat could reply.\n${failures.join('\n')}`
        : 'No callable seat at the table.',
  }
}

function shortError(raw: string): string {
  if (raw.includes('credit balance') || raw.includes('billing')) {
    return 'billing/credits issue'
  }
  if (raw.includes('401') || raw.includes('403')) return 'auth rejected'
  if (raw.includes('offline')) return 'offline'
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw
}