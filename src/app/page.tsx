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
import CouncilPanel, { type CouncilRoom } from '@/components/CouncilPanel'
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
import { isHiddenSeat, isSummonOnlySeat } from '@/lib/seats'
import { displayName } from '@/lib/display'
import { api } from '@/lib/client'
import { SEATS } from '@/lib/seats'
import { estimatePreRequest, isExpensivePreview, type SeatUsage } from '@/lib/usage'
import { parseProposalBlock, type CounselRole } from '@/lib/counsel'
import { roleForSeatKey, submitProposalFromReply } from '@/lib/counselDispatch'
import { runTableRound } from '@/lib/openTable'
import type { TableMode } from '@/lib/tableFlow'

const HBI_FP_KEY = 'camelot.hbi.fingerprint'

export default function Home() {
  const {
    messages, hydrateMessages, addMessage, editMessage, seats, localOnly,
    setLocalOnly, setCostWarning, updateSeatStatus, recordUsage, agentTools, toggleSeatEnabled,
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
  const [handoffOpening, setHandoffOpening] = useState(false)
  const [rooms, setRooms] = useState<CouncilRoom[]>([])
  const [activeRoom, setActiveRoom] = useState<CouncilRoom | null>(null)
  const [counselRoles, setCounselRoles] = useState<CounselRole[]>([])
  const [councilOk, setCouncilOk] = useState(false)
  const [tableMode, setTableMode] = useState<TableMode>('open')
  const [hbiNotice, setHbiNotice] = useState<string | null>(null)

  const isCounsel = Boolean(activeRoom?.counsel)

  const reloadMain = useCallback(
    (room?: CouncilRoom | null) => {
      const r = room ?? activeRoom
      const roomId = r?.counsel ? r.id : undefined
      return api.loadMessages({ roomId }).then((d) =>
        hydrateMessages(
          d.messages.map((m: any) => ({
            id: m.id,
            seatKey: m.seatKey,
            content: m.content,
            createdAt: m.createdAt,
            editedAt: m.editedAt ?? undefined,
          })),
        ),
      )
    },
    [activeRoom, hydrateMessages],
  )

  const loadRooms = useCallback(async () => {
    const list = await api.listRooms()
    setRooms(list)
    if (!activeRoom && list.length) {
      const main = list.find((r: CouncilRoom) => !r.counsel) ?? list[0]
      setActiveRoom(main)
    }
    return list
  }, [activeRoom])

  const switchRoom = useCallback(
    async (room: CouncilRoom) => {
      setActiveRoom(room)
      await reloadMain(room)
    },
    [reloadMain],
  )

  const enableCounselPeers = useCallback(() => {
    for (const key of ['odysseus', 'claude', 'grok'] as const) {
      const seat = useBoardroomStore.getState().seats.find((s) => s.key === key)
      if (seat && !seat.enabled) toggleSeatEnabled(key)
    }
  }, [toggleSeatEnabled])

  const openCounselSession = useCallback(
    async (boot: Record<string, unknown>) => {
      if (!boot.ok) {
        setError(String(boot.error ?? 'Could not open Council'))
        return
      }
      const roles = (boot.roles as CounselRole[]) ?? []
      setCounselRoles(roles)
      enableCounselPeers()

      let room: CouncilRoom | undefined = rooms.find(
        (r) => r.counsel && r.counselInboxId === boot.inboxId,
      )
      if (!room) {
        const created = await api.createRoom({
          name: String(boot.roomName ?? 'Council'),
          counsel: true,
          counselProject: boot.project as string,
          counselInboxId: boot.inboxId as number,
          counselPlaybook: boot.playbook as string,
        })
        room = created
        setRooms((prev) => [created, ...prev])
      } else if (boot.playbook) {
        const patched = await api.patchRoom(room.id, {
          counselPlaybook: boot.playbook,
          name: boot.roomName,
        })
        room = patched
        setRooms((prev) => prev.map((r) => (r.id === patched.id ? patched : r)))
      }

      if (!room) return
      await api.councilRegisterRoom(room.id, boot.project as string, boot.inboxId as number)
      await switchRoom(room)

      const existing = await api.loadMessages({ roomId: room.id })
      if (!existing.messages.length && boot.seed) {
        const seed = await api.saveMessage({
          seatKey: 'inbox',
          content: String(boot.seed),
          roomId: room.id,
        })
        addMessage({
          id: seed.id,
          seatKey: 'inbox',
          content: seed.content,
          createdAt: seed.createdAt,
        })
      }

      try {
        await api.councilOdinPull(room.id, boot.project as string)
      } catch {
        /* bridge may still be starting */
      }
      setNotice(`Council · ${boot.channel ?? boot.project ?? 'inbox'}`)
    },
    [addMessage, enableCounselPeers, rooms, switchRoom],
  )

  const handleCounselDeepLink = useCallback(async () => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('mode') !== 'counsel') return
    const inbox = p.get('inbox')
    const roomId = p.get('room')
    const token = p.get('token')
    try {
      if (token) {
        const d = await fetch('/api/council/invite/redeem', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        }).then((r) => r.json())
        if (d.ok && d.room_id) {
          const rolesData = await api.counselRoles()
          setCounselRoles(rolesData.roles ?? [])
          let joined: CouncilRoom | undefined = rooms.find((r) => r.id === d.room_id)
          if (!joined) {
            joined = await api.createRoom({ id: d.room_id, name: 'Council', counsel: true })
            setRooms((prev) => [joined!, ...prev])
          }
          if (joined) {
            await switchRoom(joined)
            setNotice(`Joined as ${d.role}`)
          }
        }
      } else if (inbox) {
        const boot = await api.counselBootstrap(Number(inbox))
        await openCounselSession(boot)
      } else if (roomId) {
        const rolesData = await api.counselRoles()
        setCounselRoles(rolesData.roles ?? [])
        let linked: CouncilRoom | undefined = rooms.find((r) => r.id === roomId)
        if (!linked) {
          linked = await api.createRoom({ id: roomId, name: 'Council', counsel: true })
          setRooms((prev) => [linked!, ...prev])
        }
        if (linked) await switchRoom(linked)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Council bootstrap failed')
    }
    window.history.replaceState({}, '', window.location.pathname)
  }, [openCounselSession, rooms, switchRoom])

  useEffect(() => {
    setShowOnboarding(shouldShowOnboarding())
  }, [])

  const tryOpenHandoff = useCallback(async () => {
    if (handoffOpening || busy) return
    try {
      const pending = await api.handoffPending()
      if (!pending.pending) return
      setHandoffOpening(true)
      setNotice('Handoff received — Odysseus is summarizing…')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 120_000)
      let result: Awaited<ReturnType<typeof api.openHandoff>>
      try {
        result = await fetch('/api/handoff/open', {
          method: 'POST',
          signal: controller.signal,
        }).then(async (r) => {
          const body = await r.json()
          if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
          return body
        })
      } finally {
        clearTimeout(timer)
      }
      if (!result.opened) {
        if (result.reason === 'already_opening') return
        return
      }
      await reloadMain()
      if (result.usage) recordUsage(result.usage)
      setNotice('Handoff summary ready.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('abort')) {
        setError('Handoff timed out after 2 minutes — Odysseus may be stuck. Refresh or retry.')
      } else {
        setError(msg)
      }
    } finally {
      setHandoffOpening(false)
    }
  }, [busy, handoffOpening, recordUsage, reloadMain])

  useEffect(() => {
    loadRooms()
      .then(() => reloadMain())
      .then(() => tryOpenHandoff())
      .then(() => handleCounselDeepLink())
      .catch(() => {})
    api.health().then((h) => {
      updateSeatStatus('claude', h.claude ? 'online' : 'offline')
      updateSeatStatus('grok', h.grok ? 'online' : 'offline')
      const fuguUp = h.fugu ? 'online' : 'offline'
      updateSeatStatus('fugu', fuguUp)
      updateSeatStatus('fugu-ultra', fuguUp)
      updateSeatStatus('odysseus', h.odysseus ? 'online' : 'offline')
      setCouncilOk(!!h.council)
      for (const k of ['qwen', 'local']) updateSeatStatus(k, h.ollama ? 'online' : 'offline')
    }).catch(() => {})
    api.counselRoles().then((d) => setCounselRoles(d.roles ?? [])).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      tryOpenHandoff().catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [tryOpenHandoff])

  // HBI watch — fingerprint queue; notify Matt, never auto-execute.
  useEffect(() => {
    let fp = ''
    try {
      fp = localStorage.getItem(HBI_FP_KEY) ?? ''
    } catch {
      fp = ''
    }
    const poll = () => {
      api.hbiWatch(fp || null).then((snap) => {
        if (!snap.ok) return
        if (snap.fingerprint) {
          try {
            localStorage.setItem(HBI_FP_KEY, snap.fingerprint)
          } catch {
            /* ignore */
          }
        }
        if (snap.changed && snap.count > 0) {
          const titles = snap.titles?.length ? ` — ${snap.titles.join('; ')}` : ''
          setHbiNotice(`HBI queue updated (${snap.newCount} pending / ${snap.count} total)${titles}`)
        }
      }).catch(() => {})
    }
    poll()
    const t = setInterval(poll, 120_000)
    return () => clearInterval(t)
  }, [])

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
      const blob = new Blob([md], { type: 'text/markdown' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'Camelot-transcript.md'
      a.click()
      setNotice('Transcript downloaded')
    }
  }

  async function onEdit(id: string, content: string) {
    editMessage(id, content)
    await api.editMessage(id, content).catch(() => {})
  }

  async function onBranch(messageId: string) {
    const parent = messages.find((m: Message) => m.id === messageId)
    if (!parent) return
    const t = await api.createThread(messageId)
    setThread({ threadId: t.id, parent })
  }

  async function afterSeatReply(
    rawContent: string,
    seatKey: string,
    msgMeta: { id: string; createdAt: string },
    usage?: SeatUsage,
  ) {
    const { text, plan } = parseProposalBlock(rawContent)
    const content = text || rawContent
    if (content !== rawContent) {
      await api.editMessage(msgMeta.id, content).catch(() => {})
    }
    addMessage({
      id: msgMeta.id,
      seatKey,
      content,
      createdAt: msgMeta.createdAt,
      usage,
    })
    if (isCounsel && activeRoom && plan) {
      const role = roleForSeatKey(counselRoles, seatKey)
      const label = role?.name ?? displayName(seatKey)
      const allMsgs = [...useBoardroomStore.getState().messages]
      const prop = await submitProposalFromReply(activeRoom.id, label, rawContent, allMsgs)
      if (prop.submitted) {
        setNotice(prop.duplicate ? 'Duplicate proposal skipped' : `${label} proposed · gate pending`)
      } else if (prop.skipped) {
        setNotice(`Proposal skipped (${prop.skipped.replace(/_/g, ' ')})`)
      }
    }
  }

  async function runTable(mode: TableMode) {
    if (busy) return
    setBusy(true)
    setError(null)
    setTableMode(mode)
    try {
      let msgs = [...useBoardroomStore.getState().messages]
      await runTableRound({
        mode,
        counsel: isCounsel,
        activeRoom,
        counselRoles,
        seats,
        messages: msgs,
        agentTools,
        onSeatStatus: updateSeatStatus,
        onMessage: async (msg, usage) => {
          if (usage) recordUsage(usage)
          addMessage(msg)
          msgs = [...msgs, msg]
        },
        onNotice: setNotice,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
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
        if (target && target.visible !== false && !target.enabled && !isSummonOnlySeat(mention)) {
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

      const roomId = isCounsel && activeRoom ? activeRoom.id : undefined
      const matt = await api.saveMessage({ seatKey: 'matt', content: text, roomId })
      addMessage({ id: matt.id, seatKey: 'matt', content: matt.content, createdAt: matt.createdAt })
      setDraft('')
      setExpensivePending(null)

      // @mention → single seat. Otherwise open table (default).
      if (mention) {
        const exchanges = countExchangesSinceMatt(messages)
        if (!directives.interject && !withinExchangeLimit(exchanges)) {
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
          setExpensivePending({ text, seatName: seatDef?.name ?? route.seat, preview })
          return
        }
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
        await afterSeatReply(result.message.content, result.message.seatKey, result.message, result.usage)
        return
      }

      // Open table: each seat may PASS silently → Odysseus synthesis → back to Matt.
      setTableMode('open')
      let msgs = [...useBoardroomStore.getState().messages]
      await runTableRound({
        mode: 'open',
        counsel: isCounsel,
        activeRoom,
        counselRoles,
        seats,
        messages: msgs,
        agentTools,
        onSeatStatus: updateSeatStatus,
        onMessage: async (msg, usage) => {
          if (usage) recordUsage(usage)
          addMessage(msg)
          msgs = [...msgs, msg]
        },
        onNotice: setNotice,
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

  async function newCounselRoom() {
    const name = prompt('Council session name', `Council ${rooms.filter((r) => r.counsel).length + 1}`)
    if (!name?.trim()) return
    const room = await api.createRoom({ name: name.trim(), counsel: true })
    setRooms((prev) => [room, ...prev])
    enableCounselPeers()
    const rolesData = await api.counselRoles()
    setCounselRoles(rolesData.roles ?? [])
    await api.councilRegisterRoom(room.id)
    await switchRoom(room)
    setNotice('Council convened')
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
            setCouncilOk(!!h.council)
            for (const k of ['qwen', 'local']) updateSeatStatus(k, h.ollama ? 'online' : 'offline')
          }).catch(() => {})
        }}
      />
    )}
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 border-r border-zinc-800 flex flex-col min-h-0">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-2">
          <span className="font-bold text-lg">{isCounsel ? '⚖️ Council' : '⚔️ Camelot'}</span>
          <div className="flex flex-col items-end gap-1">
            <LocalModeToggle />
            <AgentToolsToggle />
            <OdysseusInstructionsLink />
          </div>
        </div>
        <div className="px-3 py-2 border-b border-zinc-800 space-y-1">
          <select
            className="w-full bg-zinc-900 text-xs rounded px-2 py-1"
            value={activeRoom?.id ?? ''}
            onChange={(e) => {
              const room = rooms.find((r) => r.id === e.target.value)
              if (room) switchRoom(room)
            }}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.counsel ? '⚖ ' : ''}{r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={newCounselRoom}
            className="w-full text-xs py-1 rounded bg-zinc-800 hover:bg-zinc-700"
          >
            + Council session
          </button>
        </div>
        <SeatRail />
        <CostMeter />
        <InviteModal />
        <CouncilPanel room={activeRoom} councilOk={councilOk} onNotice={setNotice} />
        <TaskPanel />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-zinc-800 px-4 py-2 flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
          <span className="text-zinc-500">Mode:</span>
          <span className={tableMode === 'open' ? 'text-emerald-400' : ''}>Open table</span>
          <span className="text-zinc-700">·</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => runTable('roundtable')}
            className={tableMode === 'roundtable' ? 'text-amber-400' : 'hover:text-zinc-200'}
          >
            Roundtable
          </button>
          <span className="text-zinc-700">·</span>
          <span>Vote ↓</span>
          <span className="text-zinc-600 ml-auto hidden sm:inline">
            Send = open table · each seat may PASS · Odysseus synthesizes · your turn
          </span>
        </div>
        {hbiNotice && (
          <div className="px-4 py-2 text-xs bg-indigo-950/40 text-indigo-200 border-b border-zinc-800">
            {hbiNotice}
            <button type="button" className="ml-2 underline" onClick={() => setHbiNotice(null)}>
              dismiss
            </button>
          </div>
        )}
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
              {isCounsel
                ? 'Convene the Council — summon seats or run Roundtable.'
                : 'The table is set. Type below and hit Send to open the floor.'}
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
          {(busy || handoffOpening) && (
            <p className="text-xs text-zinc-500 animate-pulse">
              {handoffOpening ? 'Odysseus summarizing handoff…' : 'seat is thinking…'}
            </p>
          )}
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
            placeholder={
              isCounsel
                ? 'Speak to the Council… @mention a seat or run Roundtable'
                : 'Type a message… @mention a seat, prefix INTERJECT:, or just hit Send'
            }
          />
          <div className="flex gap-2 mt-2 flex-wrap">
            <button onClick={send} disabled={busy} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm disabled:opacity-50">
              {busy ? 'Sending…' : 'Send'}
            </button>
            <button
              onClick={() => runTable('roundtable')}
              disabled={busy}
              className="px-4 py-2 bg-amber-900/50 hover:bg-amber-800/50 rounded-lg text-sm disabled:opacity-50"
            >
              Roundtable
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