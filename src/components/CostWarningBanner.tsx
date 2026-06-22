'use client'

import { useBoardroomStore } from '@/store/useBoardroomStore'

export default function CostWarningBanner() {
  const warning = useBoardroomStore((s) => s.tokenWarningPending)
  const setCostWarning = useBoardroomStore((s) => s.setCostWarning)

  if (!warning) return null

  const isBlock = warning.threshold === 'block'

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 text-sm ${
        isBlock ? 'bg-red-950 text-red-200' : 'bg-amber-950 text-amber-200'
      }`}
    >
      <span>{isBlock ? '⛔' : '⚠️'}</span>
      <span className="flex-1">
        This request is ~{(warning.tokens / 1000).toFixed(1)}k tokens across paid seats.
        {isBlock ? ' Blocked — over the 50k cap. Explicit approval required.' : ' Heads up — over the 10k warn line.'}
      </span>
      <button
        onClick={() => setCostWarning(null)}
        className="text-xs underline opacity-80 hover:opacity-100"
      >
        Dismiss
      </button>
    </div>
  )
}
