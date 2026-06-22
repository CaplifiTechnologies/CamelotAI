// Token usage + estimated API cost (server + client safe types/formatters).

export interface SeatUsage {
  inputTokens: number
  outputTokens: number
  model: string
  estUsd: number
  free: boolean
}

export interface ProviderReply {
  content: string
  usage: SeatUsage
}

/** $ per 1M tokens — approximate public list prices; actual invoice may differ. */
const PRICE_PER_M: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-4-20250514': { in: 3, out: 15 },
  'grok-4.3': { in: 2, out: 10 },
  'grok-4': { in: 2, out: 10 },
}

const DEFAULT_PAID = { in: 3, out: 15 }

export function estimateUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rates =
    PRICE_PER_M[model] ??
    (model.includes('grok') ? PRICE_PER_M['grok-4.3'] : undefined) ??
    (model.includes('claude') || model.includes('sonnet') ? PRICE_PER_M['claude-sonnet-4-6'] : undefined) ??
    DEFAULT_PAID
  return (inputTokens * rates.in + outputTokens * rates.out) / 1_000_000
}

export function buildUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
  free = false,
): SeatUsage {
  const input = Math.max(0, Math.round(inputTokens))
  const output = Math.max(0, Math.round(outputTokens))
  return {
    inputTokens: input,
    outputTokens: output,
    model,
    estUsd: free ? 0 : estimateUsd(model, input, output),
    free,
  }
}

export function formatUsd(usd: number): string {
  if (usd <= 0) return 'FREE'
  if (usd < 0.0001) return '<$0.0001'
  if (usd < 0.01) return `~$${usd.toFixed(4)}`
  if (usd < 1) return `~$${usd.toFixed(3)}`
  return `~$${usd.toFixed(2)}`
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** One-line label under a reply or in the notice bar. */
export function formatUsageLine(u: SeatUsage): string {
  const total = u.inputTokens + u.outputTokens
  if (u.free) return `${formatTokenCount(total)} tokens · FREE (local)`
  return `${formatTokenCount(total)} tokens (${u.inputTokens} in · ${u.outputTokens} out) · ${formatUsd(u.estUsd)} est.`
}

/** Warn before sending if a paid request may be costly. */
export const EXPENSIVE_USD = 0.05
export const EXPENSIVE_TOKENS = 8_000
const EST_OUTPUT_TOKENS = 1_500
const SYSTEM_OVERHEAD = 600

export function estimatePreRequest(
  history: { content: string }[],
  model: string,
  free: boolean,
): SeatUsage {
  const inputTokens =
    history.reduce((n, t) => n + Math.ceil(t.content.length / 4), 0) + SYSTEM_OVERHEAD
  return buildUsage(model, inputTokens, EST_OUTPUT_TOKENS, free)
}

export function isExpensivePreview(usage: SeatUsage): boolean {
  if (usage.free) return false
  const total = usage.inputTokens + usage.outputTokens
  return usage.estUsd >= EXPENSIVE_USD || total >= EXPENSIVE_TOKENS
}

export function formatExpensiveWarning(usage: SeatUsage, seatName: string): string {
  return `${seatName} may be expensive (~${formatTokenCount(usage.inputTokens + usage.outputTokens)} tokens · ${formatUsd(usage.estUsd)} est.). Long threads cost more.`
}

export function formatSessionTotal(requests: number, inputTokens: number, outputTokens: number, estUsd: number): string {
  const total = inputTokens + outputTokens
  if (estUsd <= 0 && requests > 0) {
    return `Session: ${requests} request${requests === 1 ? '' : 's'} · ${formatTokenCount(total)} tokens · FREE`
  }
  return `Session: ${requests} paid · ${formatTokenCount(total)} tokens · ${formatUsd(estUsd)} est.`
}