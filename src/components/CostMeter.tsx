'use client'

import { useState } from 'react'
import { useBoardroomStore } from '@/store/useBoardroomStore'
import { formatSessionTotal } from '@/lib/usage'

export default function CostMeter() {
  const sessionCost = useBoardroomStore((s) => s.sessionCost)
  const resetSessionCost = useBoardroomStore((s) => s.resetSessionCost)
  const localOnly = useBoardroomStore((s) => s.localOnly)
  const [open, setOpen] = useState(false)

  const { paidRequests, inputTokens, outputTokens, estUsd } = sessionCost
  const hasActivity = paidRequests > 0 || inputTokens + outputTokens > 0

  if (localOnly && !hasActivity) {
    return (
      <div className="mx-3 mb-2 px-2 py-1.5 rounded bg-emerald-950/40 border border-emerald-900/50 text-[10px] text-emerald-300/90">
        Local Only — paid API seats skipped
      </div>
    )
  }

  if (!hasActivity) {
    return (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mx-3 mb-2 px-2 py-1.5 rounded bg-zinc-900 text-[10px] text-zinc-500 text-left w-[calc(100%-1.5rem)] hover:text-zinc-400"
      >
        {open ? 'Session spend appears here after paid replies.' : '▸ session spend'}
      </button>
    )
  }

  return (
    <div className="mx-3 mb-2 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2 py-1.5 text-left hover:text-zinc-300"
      >
        {open ? '▾' : '▸'} session spend
        {!open && (
          <span className="text-zinc-500 ml-1">
            ({formatSessionTotal(paidRequests, inputTokens, outputTokens, estUsd)})
          </span>
        )}
      </button>
      {open && (
        <div className="px-2 pb-1.5 flex items-start gap-2 border-t border-zinc-800/80">
          <span className="flex-1 leading-relaxed pt-1">
            {formatSessionTotal(paidRequests, inputTokens, outputTokens, estUsd)}
          </span>
          <button
            type="button"
            onClick={resetSessionCost}
            className="text-zinc-500 hover:text-zinc-300 shrink-0 pt-1"
          >
            reset
          </button>
        </div>
      )}
    </div>
  )
}