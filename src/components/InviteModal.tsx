'use client'

import { useEffect, useState } from 'react'
import { useBoardroomStore } from '@/store/useBoardroomStore'
import { api } from '@/lib/client'

// Self-contained: renders the "+ Seat" trigger and the modal. Invited Ollama
// models are free, callable seats; custom seats register for later wiring.
export default function InviteModal() {
  const seats = useBoardroomStore((s) => s.seats)
  const addSeat = useBoardroomStore((s) => s.addSeat)
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [custom, setCustom] = useState({ name: '', provider: '', model: '' })

  useEffect(() => {
    if (open) api.ollamaModels().then(setModels).catch(() => setModels([]))
  }, [open])

  const seated = new Set(seats.map((s) => s.model))

  function inviteOllama(model: string) {
    if (!reason.trim()) return
    const key = `ollama:${model}`
    if (seats.some((s) => s.key === key)) return
    addSeat({ key, name: model.split(':')[0], provider: 'Ollama', model, cost: 'local', status: 'online', enabled: true })
    setReason('')
  }

  function inviteCustom() {
    if (!reason.trim() || !custom.name || !custom.model) return
    const key = `custom:${custom.name.toLowerCase().replace(/\s+/g, '-')}`
    if (seats.some((s) => s.key === key)) return
    addSeat({
      key,
      name: custom.name,
      provider: custom.provider || 'Custom',
      model: custom.model,
      cost: 'paid',
      status: 'offline',
      enabled: true,
    })
    setCustom({ name: '', provider: '', model: '' })
    setReason('')
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mx-3 mb-3 px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
      >
        + Seat
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg w-[440px] max-h-[80vh] overflow-y-auto p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Seat a new model</h2>
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>

            <div>
              <label className="text-xs text-zinc-500">Reason (required)</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why seat this model?"
                className="w-full bg-zinc-950 rounded px-2 py-1 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Local (free) — Ollama</h3>
              {models.length === 0 ? (
                <p className="text-xs text-zinc-600">No local models found (is Ollama running?).</p>
              ) : (
                <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto">
                  {models.map((m) => (
                    <button
                      key={m}
                      disabled={!reason.trim() || seated.has(m)}
                      onClick={() => inviteOllama(m)}
                      className="text-left px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 truncate"
                      title={m}
                    >
                      {seated.has(m) ? '✓ ' : '+ '}{m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Custom (paid — registers only)</h3>
              <div className="grid grid-cols-3 gap-1">
                <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="name" className="bg-zinc-950 rounded px-2 py-1 text-xs" />
                <input value={custom.provider} onChange={(e) => setCustom({ ...custom, provider: e.target.value })} placeholder="provider" className="bg-zinc-950 rounded px-2 py-1 text-xs" />
                <input value={custom.model} onChange={(e) => setCustom({ ...custom, model: e.target.value })} placeholder="model id" className="bg-zinc-950 rounded px-2 py-1 text-xs" />
              </div>
              <button
                onClick={inviteCustom}
                disabled={!reason.trim() || !custom.name || !custom.model}
                className="mt-2 px-3 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40"
              >
                Register seat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
