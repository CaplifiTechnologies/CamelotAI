'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ONBOARDING_STORAGE_KEY,
  RECOMMENDED_MODELS,
  type RecommendedModel,
} from '@/lib/onboarding'
import { api } from '@/lib/client'

type Step = 'welcome' | 'local' | 'keys' | 'done'

interface OnboardingStatus {
  ollama: { reachable: boolean; models: string[]; tallyModel: string; tallyInstalled: boolean }
  bunker?: { mounted: boolean; hotDefaults: string[] }
  odysseus?: { reachable: boolean; configured: boolean }
  secrets: {
    claude: { configured: boolean; source: string | null }
    grok: { configured: boolean; source: string | null }
    fugu?: { configured: boolean; source: string | null }
    odysseus?: { configured: boolean; source: string | null }
  }
  keychainSupported: boolean
}

interface OnboardingProps {
  onComplete: () => void
}

function modelInstalled(models: string[], id: string): boolean {
  const base = id.split(':')[0]
  return models.some((n) => n === id || n.startsWith(`${base}:`))
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [recommended, setRecommended] = useState<RecommendedModel[]>(RECOMMENDED_MODELS)
  const [selected, setSelected] = useState<RecommendedModel>(
    RECOMMENDED_MODELS.find((m) => m.default) ?? RECOMMENDED_MODELS[0],
  )
  const [pulling, setPulling] = useState(false)
  const [pullPct, setPullPct] = useState<number | null>(null)
  const [pullNote, setPullNote] = useState<string | null>(null)
  const [claudeKey, setClaudeKey] = useState('')
  const [grokKey, setGrokKey] = useState('')
  const [fuguKey, setFuguKey] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [assistQ, setAssistQ] = useState('')
  const [assistA, setAssistA] = useState<string | null>(null)
  const [assistBusy, setAssistBusy] = useState(false)
  const [assistErr, setAssistErr] = useState<string | null>(null)

  const refresh = useCallback(() => {
    api.onboardingStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, step])

  useEffect(() => {
    api.onboardingModels().then(({ models }) => {
      if (!models?.length) return
      setRecommended(models)
      const pick = models.find((m: RecommendedModel) => m.default) ?? models[0]
      setSelected(pick)
    }).catch(() => {})
  }, [])

  async function pullModel() {
    setPulling(true)
    setPullPct(0)
    setPullNote('Starting download…')
    try {
      const res = await fetch('/api/ollama-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selected.id }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const ev = JSON.parse(line) as { status?: string; completed?: number; total?: number }
            if (ev.status) setPullNote(ev.status)
            if (ev.total && ev.completed != null) {
              setPullPct(Math.min(100, Math.round((ev.completed / ev.total) * 100)))
            }
          } catch {
            /* partial line */
          }
        }
      }
      setPullPct(100)
      setPullNote('Download complete.')
      refresh()
    } catch (e) {
      setPullNote(e instanceof Error ? e.message : String(e))
      setPullPct(null)
    } finally {
      setPulling(false)
    }
  }

  async function saveKey(
    service: 'ANTHROPIC_API_KEY' | 'XAI_API_KEY' | 'SAKANA_API_KEY',
    value: string,
  ) {
    if (!value.trim()) return
    setSaving(service)
    setSaveMsg(null)
    try {
      await api.saveSecret(service, value)
      const msg =
        service === 'ANTHROPIC_API_KEY'
          ? 'Claude key saved to Keychain.'
          : service === 'XAI_API_KEY'
            ? 'Grok key saved to Keychain.'
            : 'Fugu key saved to Keychain — summon with @fugu in Council.'
      setSaveMsg(msg)
      if (service === 'ANTHROPIC_API_KEY') setClaudeKey('')
      else if (service === 'XAI_API_KEY') setGrokKey('')
      else setFuguKey('')
      refresh()
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  async function askAssistant() {
    const q = assistQ.trim()
    if (!q || assistBusy) return
    setAssistBusy(true)
    setAssistErr(null)
    setAssistA(null)
    try {
      const model = status?.ollama.tallyInstalled
        ? status.ollama.tallyModel
        : selected.id
      const { answer } = await api.onboardingAssist(q, model)
      setAssistA(answer)
    } catch (e) {
      setAssistErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAssistBusy(false)
    }
  }

  function finish() {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'done')
    onComplete()
  }

  const installed = status ? modelInstalled(status.ollama.models, selected.id) : false
  const steps: Step[] = ['welcome', 'local', 'keys', 'done']
  const stepIdx = steps.indexOf(step)

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">⚔️ Welcome to Camelot</h1>
            <span className="text-xs text-zinc-500">
              Step {stepIdx + 1} of {steps.length}
            </span>
          </div>

          <div className="flex gap-1">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${i <= stepIdx ? 'bg-emerald-600' : 'bg-zinc-800'}`}
              />
            ))}
          </div>

          {step === 'welcome' && (
            <div className="space-y-4 text-sm text-zinc-300">
              <p>
                Camelot is a <strong className="text-zinc-100">boardroom for your AIs</strong> — Claude,
                Grok, and a free local model at one table.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                <li>Local model = free, runs on your Mac (no API bill)</li>
                <li>Paid seats = optional — add keys only if you want them</li>
                <li>Keys stay in <strong className="text-zinc-200">macOS Keychain</strong>, not in chat or files</li>
              </ul>
              <div className="rounded-lg bg-zinc-950 border border-zinc-700 p-3 text-xs text-zinc-400 space-y-1.5">
                <p className="text-zinc-200 font-medium">API billing ≠ monthly chat subscriptions</p>
                <p>
                  <strong className="text-zinc-300">Claude Pro / Grok on X</strong> (monthly apps) are separate from{' '}
                  <strong className="text-zinc-300">API credits</strong> Camelot uses. A subscription does not
                  automatically pay for API calls here.
                </p>
                <p>
                  Each paid reply shows an <strong className="text-zinc-300">estimated cost</strong> under the
                  message. Use seat toggles or <strong className="text-zinc-300">Local Only</strong> (⌘L) to avoid API spend.
                </p>
              </div>
              <p className="text-zinc-500 text-xs">
                This wizard takes about 2 minutes. You can skip API keys and use Local Only mode anytime (⌘L).
              </p>
            </div>
          )}

          {step === 'local' && (
            <div className="space-y-4 text-sm">
              {!status?.ollama.reachable ? (
                <div className="rounded-lg bg-amber-950/50 border border-amber-800/50 p-3 text-amber-100">
                  <p className="font-medium">Ollama isn&apos;t running yet</p>
                  <p className="text-xs mt-1 text-amber-200/80">
                    Install from{' '}
                    <a href="https://ollama.com" target="_blank" rel="noreferrer" className="underline">
                      ollama.com
                    </a>
                    , open the app once, then click Refresh below.
                  </p>
                </div>
              ) : (
                <p className="text-zinc-400">
                  Pick a free local model. Camelot uses it for vote tallies, summaries, and Local Only mode.
                </p>
              )}

              <div className="space-y-2">
                {status?.bunker?.mounted && (
                  <p className="text-xs text-emerald-400/90">
                    AI bunker mounted — showing hot defaults from MANIFEST.yaml
                  </p>
                )}
                {recommended.map((m) => (
                  <label
                    key={m.id}
                    className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected.id === m.id
                        ? 'border-emerald-600 bg-emerald-950/30'
                        : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      checked={selected.id === m.id}
                      onChange={() => setSelected(m)}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-100">
                        {m.label}
                        {m.default && (
                          <span className="ml-2 text-[10px] uppercase text-emerald-400">recommended</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">{m.description}</div>
                      <div className="text-xs text-zinc-600 mt-0.5">{m.size}</div>
                    </div>
                  </label>
                ))}
              </div>

              {status?.ollama.reachable && (
                <div className="space-y-2">
                  {installed ? (
                    <p className="text-xs text-emerald-400">✓ {selected.id} is already on this Mac.</p>
                  ) : (
                    <button
                      onClick={pullModel}
                      disabled={pulling}
                      className="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm font-medium disabled:opacity-50"
                    >
                      {pulling ? 'Downloading…' : `Download ${selected.id}`}
                    </button>
                  )}
                  {pullPct != null && (
                    <div className="space-y-1">
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 transition-all"
                          style={{ width: `${pullPct}%` }}
                        />
                      </div>
                      {pullNote && <p className="text-xs text-zinc-500 truncate">{pullNote}</p>}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={refresh}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline"
              >
                Refresh status
              </button>
            </div>
          )}

          {step === 'keys' && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg bg-zinc-950 border border-zinc-700 p-3 text-xs text-zinc-400 space-y-1">
                <p className="text-zinc-200 font-medium">Safe key import</p>
                <p>Never paste keys into the boardroom chat or a .env file if you can avoid it.</p>
                <p>Camelot saves keys straight to <strong className="text-zinc-300">macOS Keychain</strong> — they never appear in transcripts.</p>
              </div>

              <div className="rounded-lg bg-amber-950/30 border border-amber-900/40 p-3 text-xs text-amber-100/90 space-y-1">
                <p className="font-medium text-amber-100">You pay per API token, not per app subscription</p>
                <p>
                  Keys from <strong>console.anthropic.com</strong> and <strong>x.ai</strong> draw from API credit
                  balances. Camelot shows token counts and ~$ estimates on each reply so you can see what a message cost.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Claude (Anthropic)</span>
                    <span className={`text-xs ${status?.secrets.claude.configured ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {status?.secrets.claude.configured
                        ? `✓ connected (${status.secrets.claude.source})`
                        : 'optional — offline'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Get a key at{' '}
                    <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="underline">
                      console.anthropic.com
                    </a>
                  </p>
                  {status?.keychainSupported && !status.secrets.claude.configured && (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={claudeKey}
                        onChange={(e) => setClaudeKey(e.target.value)}
                        placeholder="sk-ant-…"
                        className="flex-1 bg-zinc-950 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        autoComplete="off"
                      />
                      <button
                        onClick={() => saveKey('ANTHROPIC_API_KEY', claudeKey)}
                        disabled={!claudeKey.trim() || saving === 'ANTHROPIC_API_KEY'}
                        className="px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-xs disabled:opacity-40"
                      >
                        Save to Keychain
                      </button>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Grok (xAI)</span>
                    <span className={`text-xs ${status?.secrets.grok.configured ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {status?.secrets.grok.configured
                        ? `✓ connected (${status.secrets.grok.source})`
                        : 'optional — offline'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    API key at{' '}
                    <a href="https://x.ai" target="_blank" rel="noreferrer" className="underline">
                      x.ai
                    </a>
                    {' '}or log in with the Grok CLI (<code className="text-zinc-400">grok login</code>).
                  </p>
                  {status?.keychainSupported && !status.secrets.grok.configured && (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={grokKey}
                        onChange={(e) => setGrokKey(e.target.value)}
                        placeholder="xai-…"
                        className="flex-1 bg-zinc-950 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        autoComplete="off"
                      />
                      <button
                        onClick={() => saveKey('XAI_API_KEY', grokKey)}
                        disabled={!grokKey.trim() || saving === 'XAI_API_KEY'}
                        className="px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-xs disabled:opacity-40"
                      >
                        Save to Keychain
                      </button>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Fugu (Sakana)</span>
                    <span className={`text-xs ${status?.secrets.fugu?.configured ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {status?.secrets.fugu?.configured
                        ? `✓ connected (${status.secrets.fugu.source})`
                        : 'optional guest — @fugu only'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Council guest for hard calls — not auto-routed. Key at{' '}
                    <a href="https://console.sakana.ai/api-keys" target="_blank" rel="noreferrer" className="underline">
                      console.sakana.ai
                    </a>
                    . Summon with <code className="text-zinc-400">@fugu</code> (toggle can stay off).
                  </p>
                  {status?.keychainSupported && !status.secrets.fugu?.configured && (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={fuguKey}
                        onChange={(e) => setFuguKey(e.target.value)}
                        placeholder="sk-sakana-…"
                        className="flex-1 bg-zinc-950 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        autoComplete="off"
                      />
                      <button
                        onClick={() => saveKey('SAKANA_API_KEY', fuguKey)}
                        disabled={!fuguKey.trim() || saving === 'SAKANA_API_KEY'}
                        className="px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-xs disabled:opacity-40"
                      >
                        Save to Keychain
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {saveMsg && <p className="text-xs text-zinc-400">{saveMsg}</p>}

              <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
                <p className="text-xs font-medium text-zinc-300">Ask the local setup guide</p>
                <p className="text-xs text-zinc-500">
                  Once your local model is downloaded, it can answer questions about safe setup (no keys in chat).
                </p>
                <div className="flex gap-2">
                  <input
                    value={assistQ}
                    onChange={(e) => setAssistQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && askAssistant()}
                    placeholder="e.g. Where should I put my Claude key?"
                    className="flex-1 bg-zinc-950 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
                  />
                  <button
                    onClick={askAssistant}
                    disabled={assistBusy || !assistQ.trim()}
                    className="px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-xs disabled:opacity-40"
                  >
                    {assistBusy ? '…' : 'Ask'}
                  </button>
                </div>
                {assistErr && <p className="text-xs text-amber-400">{assistErr}</p>}
                {assistA && <p className="text-xs text-zinc-300 bg-zinc-950 rounded p-2">{assistA}</p>}
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-3 text-sm text-zinc-300">
              <p className="text-zinc-100 font-medium">You&apos;re ready for the round table.</p>
              <ul className="space-y-2 text-xs">
                <li>
                  Local model:{' '}
                  <span className={status?.ollama.reachable ? 'text-emerald-400' : 'text-amber-400'}>
                    {status?.ollama.reachable
                      ? installed || status.ollama.tallyInstalled
                        ? '✓ ready'
                        : 'running — pick a model later'
                      : 'not connected — use Local Only after installing Ollama'}
                  </span>
                </li>
                <li>
                  Claude:{' '}
                  <span className={status?.secrets.claude.configured ? 'text-emerald-400' : 'text-zinc-500'}>
                    {status?.secrets.claude.configured ? '✓ online' : 'skipped (optional)'}
                  </span>
                </li>
                <li>
                  Grok:{' '}
                  <span className={status?.secrets.grok.configured ? 'text-emerald-400' : 'text-zinc-500'}>
                    {status?.secrets.grok.configured ? '✓ online' : 'skipped (optional)'}
                  </span>
                </li>
              </ul>
              <p className="text-xs text-zinc-500">
                Re-open this wizard anytime from <strong>Settings → Setup Wizard</strong> in the menu bar.
              </p>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-zinc-800">
            {step !== 'welcome' ? (
              <button
                onClick={() => setStep(steps[stepIdx - 1])}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
              >
                Back
              </button>
            ) : (
              <button
                onClick={finish}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300"
              >
                Skip setup
              </button>
            )}

            {step === 'done' ? (
              <button
                onClick={finish}
                className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm font-medium"
              >
                Enter boardroom
              </button>
            ) : (
              <button
                onClick={() => setStep(steps[stepIdx + 1])}
                className="px-5 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm font-medium"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function shouldShowOnboarding(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'done'
}

export function reopenOnboarding(): void {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY)
}