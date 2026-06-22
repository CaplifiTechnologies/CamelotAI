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

  loadMessages: (threadId?: string) =>
    json<{ messages: any[] }>(fetch(`/api/messages${threadId ? `?threadId=${threadId}` : ''}`)),
  saveMessage: (m: { seatKey: string; content: string; threadId?: string }) =>
    json<{ message: any }>(post('/api/messages', m)).then((d) => d.message),
  editMessage: (id: string, content: string) =>
    json<{ message: any }>(patch('/api/messages', { id, content })).then((d) => d.message),

  // Ask a seat; returns the persisted assistant message, or null if it PASSed.
  askSeat: async (
    seat: string,
    history: Turn[],
    opts?: { model?: string; cost?: 'local' | 'paid'; threadId?: string; agentTools?: boolean },
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
  saveSecret: (service: 'ANTHROPIC_API_KEY' | 'XAI_API_KEY' | 'ODYSSEUS_API_TOKEN', value: string) =>
    json<{ ok: boolean }>(post('/api/onboarding/secrets', { service, value })),
  onboardingAssist: (question: string, model?: string) =>
    json<{ answer: string }>(post('/api/onboarding/assist', { question, model })),
}
