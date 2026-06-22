// Cost Guard — locked decision #4: warn at 10k tokens, hard block at 50k.
// Local (Ollama) calls are always free and bypass this guard entirely.

export interface CostWarning {
  tokens: number
  seats: number
  estCost: number
  threshold: 'warn' | 'block'
}

const WARN_AT = 10_000
const BLOCK_AT = 50_000

// Rough heuristic: ~4 chars per token.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function checkCost(tokens: number): CostWarning | null {
  if (tokens > BLOCK_AT) return { tokens, seats: 0, estCost: 0, threshold: 'block' }
  if (tokens > WARN_AT) return { tokens, seats: 0, estCost: 0, threshold: 'warn' }
  return null
}

// Re-export usage helpers for server routes.
export { buildUsage, estimateUsd, formatUsageLine, type SeatUsage, type ProviderReply } from '@/lib/usage'
