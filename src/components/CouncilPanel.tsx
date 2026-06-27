'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/client'
import type { CounselRole } from '@/lib/counsel'

export interface CouncilRoom {
  id: string
  name: string
  counsel: boolean
  counselProject?: string | null
  counselInboxId?: number | null
  counselPlaybook?: string | null
}

interface Proposal {
  id: number
  seat: string
  proposal_type: string
  summary: string
}

interface LedgerEntry {
  seq: number
  event_type: string
  payload?: { summary?: string }
}

interface Props {
  room: CouncilRoom | null
  councilOk: boolean
  onNotice: (msg: string) => void
}

export default function CouncilPanel({ room, councilOk, onNotice }: Props) {
  const [signals, setSignals] = useState<string[]>([])
  const [odinHint, setOdinHint] = useState('Pull un-fudgeable state (git, HBI, projects).')
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [peerEmail, setPeerEmail] = useState('')
  const [peerRole, setPeerRole] = useState('peer')
  const [peerMode, setPeerMode] = useState('log_wait')
  const [inviteUrl, setInviteUrl] = useState('')

  const loadProposals = useCallback(async () => {
    if (!room?.counsel || !room.id) return
    try {
      const d = await api.councilProposals(room.id)
      setProposals(d.items ?? [])
    } catch {
      setProposals([])
    }
  }, [room])

  const loadLedger = useCallback(async () => {
    if (!room?.counsel || !room.id) return
    try {
      const d = await api.councilLedger(room.id)
      setLedger((d.entries ?? []).slice(0, 12))
    } catch {
      setLedger([])
    }
  }, [room])

  useEffect(() => {
    if (room?.counsel) {
      loadProposals()
      loadLedger()
    }
  }, [room?.id, room?.counsel, loadProposals, loadLedger])

  if (!room?.counsel) return null

  async function pullOdin() {
    if (!room?.id) return
    setOdinHint('Pulling…')
    try {
      const d = await api.councilOdinPull(room.id, room.counselProject ?? undefined)
      const lines = (d.signals ?? []).slice(0, 8).map((s: { kind: string; detail: string }) => `${s.kind}: ${s.detail}`)
      setSignals(lines)
      setOdinHint(`${d.active_projects ?? 0} active projects · ${(d.hbi_queue ?? []).length} HBI`)
      loadLedger()
      onNotice('ODIN state pulled')
    } catch {
      setOdinHint('ODIN pull failed — is council bridge running?')
    }
  }

  async function resolveProposal(id: number, approve: boolean) {
    try {
      await api.councilResolve(id, approve)
      loadProposals()
      loadLedger()
      onNotice(approve ? 'Approved · ledger updated' : 'Denied')
    } catch (e) {
      onNotice(e instanceof Error ? e.message : 'Gate action failed')
    }
  }

  async function sendInvite() {
    if (!room?.id || !peerEmail.trim()) return
    try {
      const d = await api.councilInvite(room.id, peerEmail.trim(), peerRole)
      if (d.join_url) setInviteUrl(d.join_url)
      loadLedger()
      onNotice('Handoff logged · copy join link')
    } catch (e) {
      onNotice(e instanceof Error ? e.message : 'Invite failed')
    }
  }

  async function savePeerMode() {
    if (!room?.id) return
    try {
      await api.councilPeerMode(room.id, peerMode)
      loadLedger()
      onNotice(`Peer authority → ${peerMode}`)
    } catch (e) {
      onNotice(e instanceof Error ? e.message : 'Peer mode failed')
    }
  }

  return (
    <div className="border-t border-zinc-800 p-3 space-y-3 text-xs overflow-y-auto max-h-[45vh]">
      <div className="text-[10px] uppercase tracking-wider text-amber-600/90 font-semibold">
        Council · ODIN
      </div>
      {!councilOk && (
        <p className="text-red-300/90">Council bridge offline — run `npm run desktop` or start council_bridge.py</p>
      )}
      <p className="text-zinc-500">{odinHint}</p>
      <button
        type="button"
        onClick={pullOdin}
        disabled={!councilOk}
        className="w-full py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40"
      >
        Pull ODIN state
      </button>
      {signals.length > 0 && (
        <ul className="text-zinc-400 space-y-0.5 list-disc pl-4">
          {signals.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}

      <div className="text-[10px] uppercase tracking-wider text-amber-600/90 font-semibold pt-1">
        Gate · pending
      </div>
      {proposals.length === 0 ? (
        <p className="text-zinc-500">No pending proposals.</p>
      ) : (
        <div className="space-y-2">
          {proposals.map((p) => (
            <div key={p.id} className="border border-zinc-700 rounded p-2">
              <div className="text-zinc-200">
                {p.seat} · {p.proposal_type}
              </div>
              <div className="text-zinc-400 mt-1">{p.summary}</div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="px-2 py-0.5 rounded bg-emerald-900/60 hover:bg-emerald-800/60"
                  onClick={() => resolveProposal(p.id, true)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600"
                  onClick={() => resolveProposal(p.id, false)}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-[10px] uppercase tracking-wider text-amber-600/90 font-semibold pt-1">
        Ledger
      </div>
      <div className="text-zinc-500 max-h-24 overflow-y-auto space-y-0.5">
        {ledger.length === 0 ? (
          <p>Ledger empty.</p>
        ) : (
          ledger.map((e) => (
            <div key={e.seq}>
              #{e.seq} {e.event_type} — {e.payload?.summary ?? ''}
            </div>
          ))
        )}
      </div>

      <div className="text-[10px] uppercase tracking-wider text-amber-600/90 font-semibold pt-1">
        Peer handoff
      </div>
      <input
        className="w-full bg-zinc-900 rounded px-2 py-1 text-xs"
        placeholder="peer@example.com"
        value={peerEmail}
        onChange={(e) => setPeerEmail(e.target.value)}
      />
      <select
        className="w-full bg-zinc-900 rounded px-2 py-1 text-xs"
        value={peerRole}
        onChange={(e) => setPeerRole(e.target.value)}
      >
        <option value="peer">Peer</option>
        <option value="observer">Observer</option>
      </select>
      <button
        type="button"
        onClick={sendInvite}
        className="w-full py-1.5 rounded bg-zinc-800 hover:bg-zinc-700"
      >
        Invite → handoff link
      </button>
      {inviteUrl && (
        <a href={inviteUrl} className="text-sky-400 break-all" target="_blank" rel="noopener noreferrer">
          {inviteUrl}
        </a>
      )}
      <select
        className="w-full bg-zinc-900 rounded px-2 py-1 text-xs"
        value={peerMode}
        onChange={(e) => setPeerMode(e.target.value)}
        onBlur={savePeerMode}
      >
        <option value="log_wait">Log &amp; wait (default)</option>
        <option value="orchestrate">Orchestrate (propose-only)</option>
      </select>
    </div>
  )
}

export type { CounselRole }