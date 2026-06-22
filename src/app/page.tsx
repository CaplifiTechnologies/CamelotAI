'use client'

import { useCallback, useEffect, useState } from 'react'
import SeatRail from '@/components/SeatRail'
import TaskPanel from '@/components/TaskPanel'
import VotePanel from '@/components/VotePanel'
import InviteModal from '@/components/InviteModal'
import SideThread from '@/components/SideThread'
import CostWarningBanner from '@/components/CostWarningBanner'
import CostMeter from '@/components/CostMeter'
import ExpensiveConfirmBanner from '@/components/ExpensiveConfirmBanner'
import AgentToolsToggle from '@/components/AgentToolsToggle'
import LocalModeToggle from '@/components/LocalModeToggle'
import OdysseusInstructionsLink from '@/components/OdysseusInstructionsLink'
import MessageBubble from '@/components/MessageBubble'
import Onboarding, { reopenOnboarding, shouldShowOnboarding } from '@/components/Onboarding'
import { useBoardroomStore, type Message, type Seat } from '@/store/useBoardroomStore'
import {
  withinExchangeLimit,
  countExchangesSinceMatt,
  MAX_EXCHANGES,
  parseDirectives,
  routeMessage,
} from '@/lib/orchestrator'
import { buildRouteContext, dispatchWithFallback, visibleEnabledSeats } from '@/lib/seatDispatch'
import { isHiddenSeat } from '@/lib/seats'
import { displayName } from '@/lib/display'
import { api } from '@/lib/client'
import { SEATS } from '@/lib/seats'
import { estimatePreRequest, isExpensivePreview, type SeatUsage } from '@/lib/usage'

export default function Home() {
  const {
    messages, hydrateMessages, addMessage, editMessage, seats, localOnly,
    setLocalOnly, setCostWarning, updateSeatStatus, recordUsage, agentTools,
  } = useBoardroomStore()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expensivePending, setExpensivePending] = useState<{
    text: string
    seatName: string
    preview: SeatUsage
  } | null>(null)
  const [thread, setThread] = useState<{ threadId: string; parent: Message } | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const reloadMain = useCallback(
    () =>
      api.loadMessages().then((d) =>
        hydrateMessages(
          d.messages.map((m: any) => ({
            id: m.id, seatKey: m.seatKey, content: m.content,
            createdAt: m.createdAt, editedAt: m.editedAt ?? undefined,
          })),
        ),
      ),
    [hydrateMessages],
  )

  useEffect(() => {
    setShowOnboarding(shouldShowOnboarding())
  }, [])

  // Hydrate from SQLite + light up reachable seats.
  useEffect(() => {
    reloadMain().catch(() => {})
    api.health().then((h) => {
      updateSeatStatus('claude', h.claude ? 'online' : 'offline')
      updateSeatStatus('grok', h.grok ? 'online' : 'offline')
      updateSeatStatus('odysseus', h.odysseus ? 'online' : 'offline')
      for (const k of ['qwen', 'local']) updateSeatStatus(k, h.ollama ? 'online' : 'offline')
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Electron menu bindings: File ▸ Export Log (⌘E), Settings ▸ Local Only (⌘L).
  useEffect(() => {
    const cam = (window as any).camelot
    if (!cam) return
    cam.onExportLog(() => exportLog())
    cam.onToggleLocalOnly(() => setLocalOnly(!useBoardroomStore.getState().localOnly))
    cam.onOpenSetup(() => {
      reopenOnboarding()
      setShowOnboarding(true)
    })
    cam.onOpenOdysseusInstructions?.(() => {
      cam.openOdysseusInstructions?.().then((r: { ok?: boolean; path?: string }) => {
        if (r?.ok && r.path) setNotice(`Opened ${r.path}`)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function exportLog() {
    const md = await api.exportTranscript().catch(() => {
      const lines = ['# Camelot Transcript', '', `*exported ${new Date().toLocaleString()}*`, '']
      for (const m of useBoardroomStore.getState().messages) {
        lines.push(
          `**${displayName(m.seatKey)}** — ${new Date(m.createdAt).toLocaleTimeString()}`,
          '',
          m.content,
          '',
        )
      }
      return lines.join('\n')
    })
    const cam = (window as any).camelot
    if (cam?.exportLog) {
      const r = await cam.exportLog(md)
      setNotice(r?.ok ? `Exported to ${r.filePath}` : 'Export canceled')
    } else {
      // Browser fallback — download the markdown.
      const blob = new Blob([md], { type: 'text/markdown' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'Camelot-transcript.md'
      a.click()
      setNotice('Transcript downloaded')
    }
  }

  async function onEdit(id: string, content: string) {
    editMessage(id, content) // optimistic
    await api.editMessage(id, content).catch(() => {})
  }

  async function onBranch(messageId: string) {
    const parent = messages.find((m: Message) => m.id === messageId)
    if (!parent) return
    const t = await api.createThread(messageId)
    setThread({ threadId: t.id, parent })
  }

  async function executeSend(text: string, opts?: { skipExpensiveCheck?: boolean }) {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const directives = parseDirectives(text)
      const mention = directives.mention
      const atTable = visibleEnabledSeats(seats)
      if (atTable.length === 0) {
        setError('No seats enabled — turn on at least one seat in the sidebar.')
        return
      }
      if (mention) {
        const target = seats.find((s: Seat) => s.key === mention)
        if (target && target.visible !== false && !target.enabled) {
          setError(`${target.name} is disabled — flip the toggle in the sidebar to use @${mention}.`)
          return
        }
        if (mention && isHiddenSeat(mention)) {
          setError(`@${mention} is automatic fallback only — not a visible seat.`)
          return
        }
      }

      const route = routeMessage(text, buildRouteContext(seats, localOnly), mention)
      if (route.warning) setCostWarning(route.warning)
      if (route.seat === 'system') {
        setError(route.note ?? 'Blocked by Cost Guard.')
        return
      }

      const exchanges = countExchangesSinceMatt(messages)
      if (
        !directives.interject &&
        !mention &&
        !withinExchangeLimit(exchanges)
      ) {
        setError(
          `Exchange limit reached (${MAX_EXCHANGES} seat replies since your last message). Send another message or use INTERJECT: to continue.`,
        )
        return
      }

      const historyForEstimate = [...messages, { seatKey: 'matt', content: text }].map((m) => ({
        content: m.content,
      }))
      const seatDef = seats.find((s: Seat) => s.key === route.seat) ?? SEATS.find((s) => s.key === route.seat)
      const model = seatDef?.model ?? 'claude-sonnet-4-6'
      const isFree = route.cost === 'local' || seatDef?.cost === 'local'
      const preview = estimatePreRequest(historyForEstimate, model, isFree)

      if (!opts?.skipExpensiveCheck && isExpensivePreview(preview)) {
        setExpensivePending({
          text,
          seatName: seatDef?.name ?? route.seat,
          preview,
        })
        return
      }

      const matt = await api.saveMessage({ seatKey: 'matt', content: text })
      addMessage({ id: matt.id, seatKey: 'matt', content: matt.content, createdAt: matt.createdAt })
      setDraft('')
      setExpensivePending(null)

      const history = [...messages, { seatKey: 'matt', content: text }].map((m) => ({
        role: m.seatKey === 'matt' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }))

      const result = await dispatchWithFallback({
        text,
        mention,
        localOnly,
        seats,
        history,
        agentTools,
        onSeatStatus: updateSeatStatus,
      })

      if (result.error) {
        setError(result.error)
        return
      }
      if (result.usage) recordUsage(result.usage)
      if (result.notice) setNotice(result.notice)

      if (result.message === null) {
        setNotice(result.notice ?? `${route.seat} passed.`)
        return
      }
      addMessage({
        id: result.message.id,
        seatKey: result.message.seatKey,
        content: result.message.content,
        createdAt: result.message.createdAt,
        usage: result.usage,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    await executeSend(text)
  }

  return (
    <>
    {showOnboarding && (
      <Onboarding
        onComplete={() => {
          setShowOnboarding(false)
          api.health().then((h) => {
            updateSeatStatus('claude', h.claude ? 'online' : 'offline')
            updateSeatStatus('grok', h.grok ? 'online' : 'offline')
            updateSeatStatus('odysseus', h.odysseus ? 'online' : 'offline')
            for (const k of ['qwen', 'local']) updateSeatStatus(k, h.ollama ? 'online' : 'offline')
          }).catch(() => {})
        }}
      />
    )}
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-2">
          <span className="font-bold text-lg">⚔️ Camelot</span>
          <div className="flex flex-col items-end gap-1">
            <LocalModeToggle />
            <AgentToolsToggle />
            <OdysseusInstructionsLink />
          </div>
        </div>
        <SeatRail />
        <CostMeter />
        <InviteModal />
        <TaskPanel />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <VotePanel />
        <CostWarningBanner />
        {expensivePending && (
          <ExpensiveConfirmBanner
            seatName={expensivePending.seatName}
            preview={expensivePending.preview}
            onConfirm={() => executeSend(expensivePending.text, { skipExpensiveCheck: true })}
            onCancel={() => setExpensivePending(null)}
          />
        )}
        <div id="message-feed" className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-600 mt-8 text-center">
              The table is set. Type below and hit Send to open the floor.
            </p>
          ) : (
            messages.map((m: Message) => (
              <MessageBubble
                key={m.id}
                id={m.id}
                seatKey={displayName(m.seatKey)}
                content={m.content}
                createdAt={m.createdAt}
                editedAt={m.editedAt}
                usage={m.usage}
                isOwn={m.seatKey === 'matt'}
                onEdit={onEdit}
                onBranch={onBranch}
              />
            ))
          )}
          {busy && <p className="text-xs text-zinc-500 animate-pulse">seat is thinking…</p>}
        </div>

        {notice && <div className="px-4 py-2 text-sm bg-zinc-800 text-zinc-300">{notice}</div>}
        {error && <div className="px-4 py-2 text-sm bg-red-950 text-red-200">⚠️ {error}</div>}

        <div className="border-t border-zinc-800 p-4">
          <textarea
            className="w-full bg-zinc-900 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50"
            rows={3}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Type a message… @mention a seat, prefix INTERJECT:, or just hit Send"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={send} disabled={busy} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm disabled:opacity-50">
              {busy ? 'Sending…' : 'Send'}
            </button>
            <button onClick={exportLog} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">
              Export log
            </button>
          </div>
        </div>
      </main>

      {thread && (
        <SideThread
          threadId={thread.threadId}
          parent={thread.parent}
          onClose={() => setThread(null)}
          onMerged={() => reloadMain()}
        />
      )}
    </div>
    </>
  )
}
