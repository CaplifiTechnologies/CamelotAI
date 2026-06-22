// Seat registry — who sits at the boardroom table.
// `cost: 'local'` seats run free via Ollama; `cost: 'paid'` seats need API keys.

export type SeatCost = 'local' | 'paid'
export type SeatStatus = 'online' | 'busy' | 'error' | 'offline'

export interface SeatDef {
  key: string
  name: string
  provider: string
  model: string
  cost: SeatCost
  bestFor: string
}

// Free local tally model — served from bunker hot/ollama when 4TSSD is mounted.
// See bunker/MANIFEST.yaml hot_defaults and `npm run ollama:check`.
export const LOCAL_TALLY_MODEL = 'qwen2.5:7b'
export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'

export const SEATS: SeatDef[] = [
  { key: 'odysseus', name: 'Odysseus', provider: 'Odysseus', model: 'agent', cost: 'local', bestFor: 'local agent loop, tools, memory' },
  { key: 'qwen',     name: 'Qwen',     provider: 'Ollama',   model: 'qwen2.5:7b', cost: 'local', bestFor: 'hidden Ollama fallback when Odysseus is down' },
  { key: 'local',    name: 'Local Tally', provider: 'Ollama', model: LOCAL_TALLY_MODEL, cost: 'local', bestFor: 'vote tally, formatting (FREE)' },
  { key: 'claude',   name: 'Claude',   provider: 'Anthropic', model: 'claude-sonnet-4-6', cost: 'paid', bestFor: 'reasoning, writing, orchestration' },
  { key: 'grok',     name: 'Grok',     provider: 'xAI',       model: 'grok-4.3',        cost: 'paid', bestFor: 'web retrieval, code, planning' },
  { key: 'gpt',      name: 'GPT',      provider: 'OpenAI',    model: 'gpt-4o',          cost: 'paid', bestFor: 'structured output, tool use' },
  { key: 'gemini',   name: 'Gemini',   provider: 'Google',    model: 'gemini-1.5-pro',  cost: 'paid', bestFor: 'long docs, summarization' },
]

export const seatByKey = (key: string): SeatDef | undefined =>
  SEATS.find((s) => s.key === key)

/** Not shown in the seat rail — used for automatic fallback (Qwen) or internal jobs (tally). */
export const HIDDEN_SEAT_KEYS = new Set(['qwen', 'local'])

export function isHiddenSeat(key: string): boolean {
  return HIDDEN_SEAT_KEYS.has(key)
}
