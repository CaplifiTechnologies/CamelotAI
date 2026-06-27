import { create } from 'zustand'
import { isHiddenSeat, SEATS, type SeatStatus } from '@/lib/seats'
import type { CostWarning } from '@/lib/costGuard'
import type { SeatUsage } from '@/lib/usage'

export interface Seat {
  key: string
  name: string
  provider: string
  model: string
  cost: 'local' | 'paid'
  status: SeatStatus
  enabled: boolean
  /** false = hidden fallback (not in seat rail) */
  visible?: boolean
}

const SEAT_ENABLED_KEY = 'camelot.seats.enabled'
const AGENT_TOOLS_KEY = 'camelot.agentTools'

/** New installs: local seats on, paid seats off until Matt enables them. */
const DEFAULT_SEAT_ENABLED: Record<string, boolean> = {
  odysseus: true,
  claude: false,
  grok: false,
  gpt: false,
  gemini: false,
  fugu: false,
  'fugu-ultra': false,
}

function loadAgentTools(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const v = localStorage.getItem(AGENT_TOOLS_KEY)
    return v !== '0'
  } catch {
    return true
  }
}

function loadSeatEnabled(key: string): boolean {
  if (isHiddenSeat(key)) return true
  const fallback = DEFAULT_SEAT_ENABLED[key] ?? false
  if (typeof window === 'undefined') return fallback
  try {
    const saved = JSON.parse(localStorage.getItem(SEAT_ENABLED_KEY) ?? '{}') as Record<string, boolean>
    if (Object.prototype.hasOwnProperty.call(saved, key)) return saved[key] !== false
    return fallback
  } catch {
    return fallback
  }
}

function persistSeatEnabled(seats: Seat[]) {
  if (typeof window === 'undefined') return
  const map = Object.fromEntries(seats.map((s) => [s.key, s.enabled]))
  localStorage.setItem(SEAT_ENABLED_KEY, JSON.stringify(map))
}

export interface Message {
  id: string
  seatKey: string
  content: string
  createdAt: string
  editedAt?: string
  threadId?: string
  usage?: SeatUsage
}

export interface SessionCost {
  paidRequests: number
  inputTokens: number
  outputTokens: number
  estUsd: number
}

export interface Task {
  id: string
  description: string
  status: string
  assignedTo?: string
  result?: string
}

export interface Ballot {
  seatKey: string
  option: string
  confidence: 'high' | 'med' | 'low'
}

export interface Vote {
  id: string
  topic: string
  options: string[]
  ballots: Ballot[]
}

export interface Thread {
  id: string
  parentMessageId: string
}

interface BoardroomStore {
  // Seats
  seats: Seat[]
  addSeat: (seat: Seat) => void
  updateSeatStatus: (key: string, status: SeatStatus) => void
  toggleSeatEnabled: (key: string) => void

  // Messages
  messages: Message[]
  addMessage: (msg: Message) => void
  hydrateMessages: (msgs: Message[]) => void
  editMessage: (id: string, content: string) => void

  // Tasks
  tasks: Task[]
  addTask: (task: Task) => void
  updateTask: (id: string, patch: Partial<Task>) => void

  // Votes
  activeVote: Vote | null
  openVote: (topic: string, options: string[]) => void
  castVote: (seatKey: string, option: string, confidence: Ballot['confidence']) => void
  closeVote: () => void

  // Threads
  threads: Thread[]
  openThread: (parentMessageId: string) => void

  // Local Only mode (locked feature)
  localOnly: boolean
  setLocalOnly: (on: boolean) => void

  // Agent tools — file read/write on allowed Mac folders
  agentTools: boolean
  setAgentTools: (on: boolean) => void

  // Cost guard
  tokenWarningPending: CostWarning | null
  setCostWarning: (warning: CostWarning | null) => void

  // Session API spend (resets on app restart; per-reply usage on messages)
  sessionCost: SessionCost
  recordUsage: (usage: SeatUsage) => void
  resetSessionCost: () => void
}

// Seed the table — `local` is internal-only; `qwen` is a hidden Ollama fallback.
const initialSeats: Seat[] = SEATS.filter((s) => s.key !== 'local').map((s) => ({
  key: s.key,
  name: s.name,
  provider: s.provider,
  model: s.model,
  cost: s.cost,
  status: s.cost === 'local' ? 'online' : 'offline',
  enabled: loadSeatEnabled(s.key),
  visible: !isHiddenSeat(s.key),
}))

export const useBoardroomStore = create<BoardroomStore>((set) => ({
  seats: initialSeats,
  addSeat: (seat) =>
    set((s) => {
      const seats = [...s.seats, { ...seat, enabled: seat.enabled ?? true }]
      persistSeatEnabled(seats)
      return { seats }
    }),
  updateSeatStatus: (key, status) =>
    set((s) => ({ seats: s.seats.map((x) => (x.key === key ? { ...x, status } : x)) })),
  toggleSeatEnabled: (key) =>
    set((s) => {
      if (isHiddenSeat(key)) return {}
      const seats = s.seats.map((x) => (x.key === key ? { ...x, enabled: !x.enabled } : x))
      persistSeatEnabled(seats)
      return { seats }
    }),
  messages: [],
  addMessage: (msg) =>
    set((s) =>
      s.messages.some((m) => m.id === msg.id)
        ? {}
        : { messages: [...s.messages, msg] },
    ),
  hydrateMessages: (msgs) => set(() => ({ messages: msgs })),
  editMessage: (id, content) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content, editedAt: new Date().toISOString() } : m,
      ),
    })),

  tasks: [],
  addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
  updateTask: (id, patch) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  activeVote: null,
  openVote: (topic, options) =>
    set(() => ({ activeVote: { id: `v_${Date.now()}`, topic, options, ballots: [] } })),
  castVote: (seatKey, option, confidence) =>
    set((s) =>
      s.activeVote
        ? {
            activeVote: {
              ...s.activeVote,
              ballots: [
                ...s.activeVote.ballots.filter((b) => b.seatKey !== seatKey),
                { seatKey, option, confidence },
              ],
            },
          }
        : {},
    ),
  closeVote: () => set(() => ({ activeVote: null })),

  threads: [],
  openThread: (parentMessageId) =>
    set((s) => ({
      threads: [...s.threads, { id: `t_${Date.now()}`, parentMessageId }],
    })),

  localOnly: false,
  setLocalOnly: (on) => set(() => ({ localOnly: on })),

  agentTools: loadAgentTools(),
  setAgentTools: (on) => {
    if (typeof window !== 'undefined') localStorage.setItem(AGENT_TOOLS_KEY, on ? '1' : '0')
    set(() => ({ agentTools: on }))
  },

  tokenWarningPending: null,
  setCostWarning: (warning) => set(() => ({ tokenWarningPending: warning })),

  sessionCost: { paidRequests: 0, inputTokens: 0, outputTokens: 0, estUsd: 0 },
  recordUsage: (usage) =>
    set((s) => ({
      sessionCost: {
        paidRequests: s.sessionCost.paidRequests + (usage.free ? 0 : 1),
        inputTokens: s.sessionCost.inputTokens + usage.inputTokens,
        outputTokens: s.sessionCost.outputTokens + usage.outputTokens,
        estUsd: s.sessionCost.estUsd + (usage.free ? 0 : usage.estUsd),
      },
    })),
  resetSessionCost: () =>
    set(() => ({ sessionCost: { paidRequests: 0, inputTokens: 0, outputTokens: 0, estUsd: 0 } })),
}))
