'use client'

import { useEffect, useState } from 'react'
import { useBoardroomStore } from '@/store/useBoardroomStore'
import { api } from '@/lib/client'

interface Ballot { seatKey: string; option: string; confidence: string }
interface Vote { id: string; topic: string; options: string[]; status: string; ballots: Ballot[] }

const WEIGHT: Record<string, number> = { high: 3, med: 2, low: 1 }

export default function VotePanel() {
  const seats = useBoardroomStore((s) => s.seats)
  const [vote, setVote] = useState<Vote | null>(null)
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState('')
  const [optionsText, setOptionsText] = useState('')
  const [tally, setTally] = useState<{ winner: string; rationale: string; via: string } | null>(null)
  const [conf, setConf] = useState<Record<string, string>>({})

  const refresh = () => api.openVote().then(setVote).catch(() => {})
  useEffect(() => {
    refresh()
  }, [])

  async function start() {
    const opts = optionsText.split(',').map((o) => o.trim()).filter(Boolean)
    if (!topic.trim() || opts.length < 2) return
    const v = await api.startVote(topic.trim(), opts)
    setVote(v)
    setTally(null)
    setTopic('')
    setOptionsText('')
  }

  async function cast(seatKey: string, option: string) {
    if (!vote) return
    const c = conf[seatKey] ?? 'med'
    const ballots = await api.castBallot(vote.id, seatKey, option, c)
    setVote({ ...vote, ballots })
  }

  async function doTally() {
    if (!vote) return
    const t = await api.tally(vote.id)
    setTally(t)
    setVote({ ...vote, status: 'closed' })
  }

  // Deterministic live preview (the server tally matches this).
  const counts: Record<string, number> = {}
  for (const b of vote?.ballots ?? []) counts[b.option] = (counts[b.option] ?? 0) + (WEIGHT[b.confidence] ?? 1)
  const leader = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]

  return (
    <div className="border-b border-zinc-800 text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-zinc-400 hover:bg-zinc-900"
      >
        <span className="text-xs uppercase tracking-wide">🗳 Vote{vote ? `: ${vote.topic}` : ''}</span>
        <span className="text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-3">
          {!vote || vote.status === 'closed' ? (
            <div className="space-y-2">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Vote topic…"
                className="w-full bg-zinc-900 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <input
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Options, comma-separated (e.g. A, B, C)"
                className="w-full bg-zinc-900 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <button onClick={start} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
                Open vote
              </button>
              {tally && (
                <div className="mt-2 p-2 rounded bg-emerald-950 text-emerald-200 text-xs">
                  <div className="font-medium">Winner: {tally.winner}</div>
                  <div className="opacity-90">{tally.rationale}</div>
                  <div className="opacity-60 mt-1">tally via {tally.via} (free/local)</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-zinc-500">
                Record each seat&apos;s ballot (chair). Tally is computed by a free local model.
              </div>
              <div className="space-y-1">
                {seats.filter((s) => s.enabled && s.visible !== false).map((s) => {
                  const ballot = vote.ballots.find((b) => b.seatKey === s.key)
                  return (
                    <div key={s.key} className="flex items-center gap-1.5 text-xs">
                      <span className="w-16 text-zinc-400 truncate">{s.name}</span>
                      <select
                        value={conf[s.key] ?? 'med'}
                        onChange={(e) => setConf((c) => ({ ...c, [s.key]: e.target.value }))}
                        className="bg-zinc-900 rounded px-1 text-[10px] text-zinc-400"
                        title="confidence"
                      >
                        <option value="high">high</option>
                        <option value="med">med</option>
                        <option value="low">low</option>
                      </select>
                      <div className="flex gap-1 flex-wrap">
                        {vote.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => cast(s.key, opt)}
                            className={`px-1.5 py-0.5 rounded ${
                              ballot?.option === opt
                                ? 'bg-indigo-700 text-white'
                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-zinc-500">
                  {vote.ballots.length} ballot(s){leader ? ` · leading: ${leader}` : ''}
                </span>
                <button onClick={doTally} className="px-3 py-1 bg-emerald-800 hover:bg-emerald-700 rounded text-xs">
                  Tally &amp; close (local)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
