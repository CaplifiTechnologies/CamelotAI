// Thin client-side API wrapper used by the page and panels. Keeps fetch logic
// in one place. All persistence goes through these calls → SQLite.

import type { Turn } from '@/lib/providers/anthropic'
import type { SeatUsage } from '@/lib/usage'

export interface AskSeatResult {
  message: any | null
  usage?: SeatUsage
}

async function json<T>(r: Response | Promise<Response>): Promise<T> {
  const res = await r
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as any).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const patch = (url: string, body: unknown) =>
  fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// --- Messages ---------------------------------------------------------------
export const api = {
  health: () => fetch('/api/health').then((r) => r.json()),

  loadMessages: (opts?: { threadId?: string; roomId?: string }) => {
    const q = new URLSearchParams()
    if (opts?.threadId) q.set('threadId', opts.threadId)
    if (opts?.roomId) q.set('roomId', opts.roomId)
    const qs = q.toString()
    return json<{ messages: any[] }>(fetch(`/api/messages${qs ? `?${qs}` : ''}`))
  },
  saveMessage: (m: { seatKey: string; content: string; threadId?: string; roomId?: string }) =>
    json<{ message: any }>(post('/api/messages', m)).then((d) => d.message),
  editMessage: (id: string, content: string) =>
    json<{ message: any }>(patch('/api/messages', { id, content })).then((d) => d.message),

  // Ask a seat; returns the persisted assistant message, or null if it PASSed.
  askSeat: async (
    seat: string,
    history: Turn[],
    opts?: {
      model?: string
      cost?: 'local' | 'paid'
      threadId?: string
      agentTools?: boolean
      systemOverride?: string
      roomId?: string
    },
  ): Promise<AskSeatResult> => {
    const res = await post('/api/chat', { seat, history, ...opts })
    const d = await json<{ message?: any; passed?: boolean; usage?: SeatUsage }>(res)
    return { message: d.passed ? null : (d.message ?? null), usage: d.usage }
  },

  // --- Tasks ----------------------------------------------------------------
  listTasks: () => json<{ tasks: any[] }>(fetch('/api/tasks')).then((d) => d.tasks),
  createTask: (description: string, assignedTo?: string) =>
    json<{ task: any }>(post('/api/tasks', { description, assignedTo })).then((d) => d.task),
  updateTask: (id: string, patchData: { status?: string; assignedTo?: string | null; result?: string }) =>
    json<{ task: any }>(patch('/api/tasks', { id, ...patchData })).then((d) => d.task),

  // --- Votes ----------------------------------------------------------------
  openVote: () => json<{ vote: any | null }>(fetch('/api/votes')).then((d) => d.vote),
  startVote: (topic: string, options: string[]) =>
    json<{ vote: any }>(post('/api/votes', { topic, options })).then((d) => d.vote),
  castBallot: (voteId: string, seatKey: string, option: string, confidence: string) =>
    json<{ ballots: any[] }>(post('/api/votes/ballot', { voteId, seatKey, option, confidence })).then((d) => d.ballots),
  tally: (voteId: string) =>
    json<{ tally: any }>(post('/api/votes/tally', { voteId })).then((d) => d.tally),

  // --- Threads --------------------------------------------------------------
  createThread: (parentMsgId: string) =>
    json<{ thread: any }>(post('/api/threads', { parentMsgId })).then((d) => d.thread),
  mergeThread: (threadId: string) =>
    json<{ message: any }>(post('/api/threads/merge', { threadId })).then((d) => d.message),

  exportTranscript: () =>
    json<{ markdown: string }>(fetch('/api/export')).then((d) => d.markdown),

  // --- Invite ---------------------------------------------------------------
  ollamaModels: () => fetch('/api/ollama-models').then((r) => r.json()).then((d) => d.models as string[]),

  // --- Onboarding -----------------------------------------------------------
  onboardingStatus: () => json<any>(fetch('/api/onboarding/status')),
  onboardingModels: () => json<{ bunker: boolean; models: any[] }>(fetch('/api/onboarding/models')),
  saveSecret: (
    service: 'ANTHROPIC_API_KEY' | 'XAI_API_KEY' | 'ODYSSEUS_API_TOKEN' | 'SAKANA_API_KEY',
    value: string,
  ) =>
    json<{ ok: boolean }>(post('/api/onboarding/secrets', { service, value })),
  onboardingAssist: (question: string, model?: string) =>
    json<{ answer: string }>(post('/api/onboarding/assist', { question, model })),

  // --- Handoff pickup (AI HANDOFF SLOP watcher) ----------------------------
  handoffPending: () =>
    json<{ pending: boolean; pickup?: any }>(fetch('/api/handoff/pending')),
  openHandoff: () =>
    json<{ opened: boolean; messages?: any[]; usage?: SeatUsage; reason?: string }>(
      post('/api/handoff/open', {}),
    ),

  // --- Rooms ----------------------------------------------------------------
  listRooms: () => json<{ rooms: any[] }>(fetch('/api/rooms')).then((d) => d.rooms),
  createRoom: (data: {
    id?: string
    name: string
    counsel?: boolean
    counselProject?: string
    counselInboxId?: number
    counselPlaybook?: string
  }) => json<{ room: any }>(post('/api/rooms', data)).then((d) => d.room),
  patchRoom: (id: string, fields: Record<string, unknown>) =>
    json<{ room: any }>(patch('/api/rooms', { id, ...fields })).then((d) => d.room),

  // --- Council (deterministic gate via Python sidecar) ----------------------
  counselRoles: () => json<{ ok: boolean; roles: any[] }>(fetch('/api/counsel/roles')),
  counselBootstrap: (inboxId: number) =>
    json<any>(fetch(`/api/counsel/bootstrap?inbox=${inboxId}`)),
  councilRegisterRoom: (roomId: string, project?: string, inboxId?: number) =>
    json<any>(post('/api/council/room', { room_id: roomId, project, inbox_id: inboxId })),
  councilOdinPull: (roomId: string, project?: string) =>
    json<any>(post('/api/council/odin/pull', { room_id: roomId, project })),
  councilProposals: (roomId: string) =>
    json<{ items: any[] }>(fetch(`/api/council/proposals?room=${encodeURIComponent(roomId)}`)),
  councilLedger: (roomId: string) =>
    json<{ entries: any[] }>(fetch(`/api/council/ledger?room=${encodeURIComponent(roomId)}&limit=12`)),
  councilPropose: (data: {
    room_id: string
    seat: string
    type: string
    summary: string
    body?: string
  }) => json<any>(post('/api/council/propose', data)),
  councilResolve: (proposalId: number, approve: boolean) =>
    json<any>(
      post(approve ? '/api/council/approve' : '/api/council/deny', {
        proposal_id: proposalId,
        human_token: approve ? 'matt' : undefined,
      }),
    ),
  councilInvite: (roomId: string, email: string, role: string) =>
    json<any>(post('/api/council/invite', { room_id: roomId, email, role })),
  councilPeerMode: (roomId: string, mode: string) =>
    json<any>(post('/api/council/peer/mode', { room_id: roomId, mode })),
  hbiWatch: (fingerprint?: string | null) =>
    json<{
      ok: boolean
      changed: boolean
      count: number
      newCount: number
      titles: string[]
      fingerprint: string
      path: string | null
    }>(fetch(`/api/hbi/watch${fingerprint ? `?fingerprint=${fingerprint}` : ''}`)),

  odysseusIngest: (data: {
    project?: string
    summary?: string
    turns: { name?: string; seatKey?: string; content: string }[]
  }) => json<any>(post('/api/odysseus/ingest', { ...data, source: 'camelot' })),
}
