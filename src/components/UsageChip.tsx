'use client'

import { useState } from 'react'
import type { SeatUsage } from '@/lib/usage'
import { formatUsageLine } from '@/lib/usage'

export default function UsageChip({ usage }: { usage: SeatUsage }) {
  const [open, setOpen] = useState(false)

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={`text-[10px] hover:underline ${usage.free ? 'text-emerald-600' : 'text-zinc-600'}`}
      title="Click for token / cost details"
    >
      {open ? formatUsageLine(usage) : usage.free ? 'cost · FREE' : `cost · ${usage.estUsd > 0 ? `~$${usage.estUsd < 0.01 ? usage.estUsd.toFixed(4) : usage.estUsd.toFixed(3)}` : 'paid'}`}
    </button>
  )
}