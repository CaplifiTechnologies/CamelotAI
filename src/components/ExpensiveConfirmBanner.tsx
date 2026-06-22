'use client'

import type { SeatUsage } from '@/lib/usage'
import { formatExpensiveWarning, formatUsageLine } from '@/lib/usage'

export default function ExpensiveConfirmBanner({
  seatName,
  preview,
  onConfirm,
  onCancel,
}: {
  seatName: string
  preview: SeatUsage
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm bg-amber-950 text-amber-100 border-b border-amber-900/50">
      <span>💰</span>
      <div className="flex-1 min-w-0">
        <p>{formatExpensiveWarning(preview, seatName)}</p>
        <p className="text-xs text-amber-200/70 mt-0.5">{formatUsageLine(preview)} — estimate before sending</p>
      </div>
      <button
        onClick={onConfirm}
        className="px-3 py-1 rounded bg-amber-700 hover:bg-amber-600 text-xs font-medium shrink-0"
      >
        Send anyway
      </button>
      <button onClick={onCancel} className="text-xs underline opacity-80 hover:opacity-100 shrink-0">
        Cancel
      </button>
    </div>
  )
}