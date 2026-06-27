'use client'

import { useEffect, useState } from 'react'
import { useBoardroomStore } from '@/store/useBoardroomStore'
import { api } from '@/lib/client'
import { routeMessage } from '@/lib/orchestrator'
import { buildRouteContext, dispatchWithFallback, visibleEnabledSeats } from '@/lib/seatDispatch'
import { isHiddenSeat, isSummonOnlySeat } from '@/lib/seats'
import { displayName } from '@/lib/display'

interface Msg { id: string; seatKey: string; content: string; createdAt: string }

export default function SideThread({
  threadId,
  parent,
  onClose,
  onMerged,
}: {
  threadId: string
  parent: Msg
  onClose: () => void
  onMerged: () => void
}) {
  const seats = useBoardroomStore((s) => s.seats)
  const localOnly = useBoardroomStore((s) => s.localOnly)
  const updateSeatStatus = useBoardroomStore((s) => s.updateSeatStatus)
  const agentTools = useBoardroomStore((s) => s.agentTools)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = () => api.loadMessages({ threadId }).then((d) => setMsgs(d.messages)).catch(() => {})
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    setErr(null)
    setBusy(true)
    try {
      await api.saveMessage({ seatKey: 'matt', content: text, threadId })
      setDraft('')
      await refresh()

      const mention = text.match(/^@(\w+)/)?.[1]
      const atTable = visibleEnabledSeats(seats)
      if (atTable.length === 0) {
        setErr('No seats enabled — turn on at least one seat in the sidebar.')
        return
      }
      if (mention) {
        const target = seats.find((s) => s.key === mention)
        if (target && target.visible !== false && !target.enabled && !isSummonOnlySeat(mention)) {
          setErr(`${target.name} is disabled — flip the toggle in the sidebar.`)
          return
        }
        if (mention && isHiddenSeat(mention)) {
          setErr(`@${mention} is automatic fallback only — not a visible seat.`)
          return
        }
      }

      const route = routeMessage(text, buildRouteContext(seats, localOnly), mention)
      if (route.seat === 'system') {
        setErr(route.note ?? 'Blocked by Cost Guard.')
        return
      }
      const history = [
        { role: 'user' as const, content: `Context from the main boardroom: "${parent.content}"` },
        ...[...msgs, { seatKey: 'matt', content: text }].map((m) => ({
          role: m.seatKey === 'matt' ? ('user' as const) : ('assistant' as const),
          content: m.content,
        })),
      ]
      const result = await dispatchWithFallback({
        text,
        mention,
        localOnly,
        seats,
        history,
        threadId,
        agentTools,
        onSeatStatus: updateSeatStatus,
      })
      if (result.error) {
        setErr(result.error)
        return
      }
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function merge() {
    setBusy(true)
    try {
      await api.mergeThread(threadId)
      onMerged()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="w-96 border-l border-zinc-800 flex flex-col bg-zinc-950">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-zinc-500">⑂ Side thread</span>
        <div className="flex gap-2">
          <button onClick={merge} disabled={busy || msgs.length === 0} className="text-xs text-emerald-400 hover:underline disabled:opacity-40">
            merge back
          </button>
          <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-zinc-800/60 text-xs text-zinc-500">
        branched from {displayName(parent.seatKey)}:
        <div className="text-zinc-400 mt-1 line-clamp-3">{parent.content}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {msgs.map((m) => (
          <div key={m.id} className="text-sm">
            <div className="text-[10px] text-zinc-500">
              {displayName(m.seatKey)}
            </div>
            <div className="bg-zinc-900 rounded px-3 py-1.5 whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {busy && <p className="text-xs text-zinc-500 animate-pulse">working…</p>}
        {err && <p className="text-xs text-red-300">⚠️ {err}</p>}
      </div>

      <div className="border-t border-zinc-800 p-3">
        <textarea
          rows={2}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Branch the discussion…"
          className="w-full bg-zinc-900 rounded p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-zinc-600"
        />
        <button onClick={send} disabled={busy} className="mt-1 px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs disabled:opacity-50">
          Send
        </button>
      </div>
    </aside>
  )
}
