// Fugu agentic feature flags — ARMED but off by default.
// Mirror of ~/ALMI/fugu_config.yaml; env overrides for local dev.

export interface FuguAgenticConfig {
  enabled: boolean
  responsesApi: boolean
  streaming: boolean
  webSearch: boolean
  fuguUltra: boolean
  longRunning: boolean
  defaultModel: string
  ultraModel: string
  ultraTimeoutMs: number
  defaultTimeoutMs: number
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]
  if (v === undefined || v === '') return fallback
  return v === '1' || v.toLowerCase() === 'true'
}

export function fuguAgenticConfig(): FuguAgenticConfig {
  const enabled = envBool('FUGU_AGENTIC_ENABLED', false)
  return {
    enabled,
    responsesApi: envBool('FUGU_RESPONSES_API', true),
    streaming: envBool('FUGU_STREAMING', true),
    webSearch: envBool('FUGU_WEB_SEARCH', true),
    fuguUltra: envBool('FUGU_ULTRA', true),
    longRunning: envBool('FUGU_LONG_RUNNING', true),
    defaultModel: process.env.FUGU_MODEL ?? 'fugu',
    ultraModel: process.env.FUGU_ULTRA_MODEL ?? 'fugu-ultra',
    defaultTimeoutMs: Number(process.env.FUGU_TIMEOUT_MS ?? 120_000),
    ultraTimeoutMs: Number(process.env.FUGU_ULTRA_TIMEOUT_MS ?? 300_000),
  }
}

export function requireAgenticEnabled(): { ok: true } | { ok: false; error: string } {
  const cfg = fuguAgenticConfig()
  if (!cfg.enabled) {
    return {
      ok: false,
      error:
        'Fugu agentic mode is disabled. Set FUGU_AGENTIC_ENABLED=true (and enabled: true in ~/ALMI/fugu_config.yaml for ALMI missions).',
    }
  }
  return { ok: true }
}