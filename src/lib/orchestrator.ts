// Orchestrator — role-based routing (locked decision #3) + Cost Guard (#4).
// Mechanical work (vote tally / aggregation) is routed to a FREE local Ollama
// model per the cost routing rules. Paid seats are stubs until keys are wired
// (section 14 TODO: .env for the personal build).

import { checkCost, estimateTokens, type CostWarning } from './costGuard'
import { isSummonOnlySeat, LOCAL_TALLY_MODEL, OLLAMA_BASE_URL, SEATS, type SeatStatus } from './seats'

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// --- Local model (free) -----------------------------------------------------

export async function callOllama(
  model: string,
  messages: OllamaMessage[],
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  })
  if (!res.ok) {
    throw new Error(`Ollama ${model} failed: HTTP ${res.status}`)
  }
  const data = await res.json()
  return data?.message?.content ?? ''
}

export async function ollamaHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    return res.ok
  } catch {
    return false
  }
}

// --- Voting tally (FREE local seat per cost rules) --------------------------

export interface Ballot {
  seatKey: string
  option: string
  confidence: 'high' | 'med' | 'low'
}

export interface TallyResult {
  winner: string
  counts: Record<string, number>      // confidence-weighted
  rationale: string
  via: 'local-model' | 'deterministic-fallback'
}

const WEIGHT: Record<Ballot['confidence'], number> = { high: 3, med: 2, low: 1 }

// Deterministic, dependency-free tally. Always correct; used as the source of
// truth and as a fallback when the local model is unreachable.
export function tallyDeterministic(ballots: Ballot[]): Omit<TallyResult, 'via' | 'rationale'> {
  const counts: Record<string, number> = {}
  for (const b of ballots) {
    counts[b.option] = (counts[b.option] ?? 0) + WEIGHT[b.confidence]
  }
  const winner =
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '(no votes)'
  return { winner, counts }
}

// Routes the human-readable summary to the free local model; falls back to a
// plain deterministic statement if Ollama is offline. The numeric result is
// ALWAYS computed deterministically — the model only narrates it.
export async function tallyVotes(topic: string, ballots: Ballot[]): Promise<TallyResult> {
  const det = tallyDeterministic(ballots)
  const summary = `Topic: ${topic}\nWinner: ${det.winner}\nWeighted counts: ${JSON.stringify(det.counts)}`

  try {
    const rationale = await callOllama(LOCAL_TALLY_MODEL, [
      { role: 'system', content: 'You are a neutral vote teller. In one sentence, state the winning option and the margin. Do not change the numbers.' },
      { role: 'user', content: summary },
    ])
    return { ...det, rationale: rationale.trim() || summary, via: 'local-model' }
  } catch {
    return {
      ...det,
      rationale: `${det.winner} wins (confidence-weighted). Ties go to you.`,
      via: 'deterministic-fallback',
    }
  }
}

// --- Message routing --------------------------------------------------------

export interface RouteContext {
  localOnly: boolean
  activeSeatKeys: string[]
  seatStatus?: Record<string, SeatStatus>
}

export interface RouteResult {
  seat: string
  cost: 'local' | 'paid' | 'system'
  warning?: CostWarning
  note?: string
}

const PRIORITY = ['odysseus', 'qwen', 'claude', 'grok', 'gemini', 'gpt']

const LOCAL_PRIORITY = ['odysseus']

const CALLABLE = new Set(['odysseus', 'claude', 'grok', 'fugu', 'fugu-ultra', 'qwen', 'local'])

/** Seats the chat API can actually call in this build. */
export function isCallableSeat(key: string): boolean {
  return CALLABLE.has(key) || key.startsWith('ollama:')
}

/** Ordered seats to try when the primary fails (billing, offline, timeout). */
export function seatFallbackChain(primary: string, ctx: RouteContext): string[] {
  const active = ctx.activeSeatKeys.filter(isCallableSeat)
  if (ctx.localOnly) {
    const locals = active.filter((k) => {
      const def = SEATS.find((s) => s.key === k)
      return def?.cost === 'local' || k.startsWith('ollama:')
    })
    return [primary, ...locals.filter((k) => k !== primary)]
  }
  const ordered = [
    primary,
    ...PRIORITY.filter((k) => k !== primary && active.includes(k)),
    ...active.filter((k) => !PRIORITY.includes(k) && k !== primary),
  ]
  return ordered.filter((k) => active.includes(k))
}

function pickPrimarySeat(ctx: RouteContext): string {
  const candidates = PRIORITY.filter((k) => ctx.activeSeatKeys.includes(k) && isCallableSeat(k))
  const online = candidates.filter((k) => {
    const st = ctx.seatStatus?.[k]
    return st !== 'offline' && st !== 'error'
  })
  return online[0] ?? candidates[0] ?? ctx.activeSeatKeys.find(isCallableSeat) ?? 'qwen'
}

// --- Boardroom protocol (build log §3/§5) -----------------------------------

// Max model-to-model exchanges on one topic before the chair must step in.
export const MAX_EXCHANGES = 3

// The token a seat returns when it has nothing to add (PASS participation).
export const PASS_TOKEN = 'PASS'

export interface Directives {
  mention?: string // @seat → force that seat to speak
  interject: boolean // INTERJECT: … → urgent one-liner, jumps the queue
  body: string // message with the directive prefix stripped
}

// Parse the chair's input for @mention and INTERJECT directives.
export function parseDirectives(text: string): Directives {
  const interject = /^INTERJECT:/i.test(text.trim())
  const stripped = interject ? text.trim().replace(/^INTERJECT:\s*/i, '') : text
  const mention = stripped.match(/^@(\w+)/)?.[1]
  return { mention, interject, body: stripped }
}

// Did a seat decline to speak? Small local models rarely return exact PASS.
export function isPass(reply: string): boolean {
  const stripped = reply
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/[.!?,;:]+$/g, '')
    .trim()
  const upper = stripped.toUpperCase()
  if (upper === PASS_TOKEN) return true
  const first = upper.split(/\s+/)[0]
  if (first === PASS_TOKEN) return true
  if (upper.startsWith(`${PASS_TOKEN} `)) return true
  if (upper.startsWith(`${PASS_TOKEN}.`)) return true
  return false
}

/** Seat-to-seat replies since Matt's last message on the main feed. */
export function countExchangesSinceMatt(
  messages: { seatKey: string }[],
): number {
  let n = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].seatKey === 'matt') break
    if (messages[i].seatKey !== 'side-thread') n++
  }
  return n
}

// Enforce the 3-exchange cap. `exchangeCount` is how many seat-to-seat replies
// have already happened on the current topic.
export function withinExchangeLimit(exchangeCount: number): boolean {
  return exchangeCount < MAX_EXCHANGES
}

export function routeMessage(
  content: string,
  ctx: RouteContext,
  mentionedSeat?: string,
): RouteResult {
  // @mention override (locked feature): forces a named seat regardless of routing.
  // Summon-only guests (e.g. Fugu) work even when their toggle is off.
  if (mentionedSeat && isCallableSeat(mentionedSeat)) {
    const summon = isSummonOnlySeat(mentionedSeat)
    if (summon || ctx.activeSeatKeys.includes(mentionedSeat)) {
      const def = SEATS.find((s) => s.key === mentionedSeat)
      return {
        seat: mentionedSeat,
        cost: def?.cost ?? 'paid',
        note: summon ? '@summon (guest seat)' : '@mention override',
      }
    }
  }

  // Local Only mode: Odysseus primary; Qwen steps in via fallback chain only.
  if (ctx.localOnly) {
    const active = ctx.activeSeatKeys.filter(isCallableSeat)
    const seat =
      LOCAL_PRIORITY.find((k) => active.includes(k)) ??
      active.find((k) => SEATS.find((s) => s.key === k)?.cost === 'local') ??
      'qwen'
    return { seat, cost: 'local', note: 'Local Only mode' }
  }

  // Cost Guard — block oversized paid requests pending Matt's approval.
  const warning = checkCost(estimateTokens(content))
  if (warning?.threshold === 'block') {
    return { seat: 'system', cost: 'system', warning, note: 'BLOCKED — exceeds 50k token cap' }
  }

  // Role-based priority — prefer online, callable seats.
  const seat = pickPrimarySeat(ctx)
  const def = SEATS.find((s) => s.key === seat)
  return { seat, cost: def?.cost ?? 'paid', warning: warning ?? undefined }
}
