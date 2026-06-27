'use client'

import { isSummonOnlySeat } from '@/lib/seats'
import { useBoardroomStore } from '@/store/useBoardroomStore'

const DOT: Record<string, string> = {
  online: 'bg-emerald-500',
  busy: 'bg-amber-500',
  error: 'bg-red-500',
  offline: 'bg-zinc-600',
}

export default function SeatRail() {
  const seats = useBoardroomStore((s) => s.seats)
  const toggleSeatEnabled = useBoardroomStore((s) => s.toggleSeatEnabled)

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Seats</h2>
      <ul className="space-y-1">
        {seats.filter((s) => s.visible !== false).map((seat) => (
          <li
            key={seat.key}
            className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-900 text-sm ${
              seat.enabled ? '' : 'opacity-50'
            }`}
            title={`${seat.provider} · ${seat.model}${
              isSummonOnlySeat(seat.key) ? ' — summon with @fugu' : seat.enabled ? '' : ' (disabled)'
            }`}
          >
            <button
              type="button"
              role="switch"
              aria-checked={seat.enabled}
              aria-label={`${seat.enabled ? 'Disable' : 'Enable'} ${seat.name}`}
              onClick={() => toggleSeatEnabled(seat.key)}
              className={`relative w-8 h-4 rounded-full shrink-0 transition-colors ${
                seat.enabled ? 'bg-emerald-700' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                  seat.enabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                seat.enabled ? (DOT[seat.status] ?? DOT.offline) : 'bg-zinc-700'
              }`}
            />
            <span className={`flex-1 truncate ${seat.enabled ? 'text-zinc-300' : 'text-zinc-500'}`}>
              {seat.name}
              {isSummonOnlySeat(seat.key) && (
                <span className="ml-1 text-[10px] text-amber-500/90">guest</span>
              )}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                seat.cost === 'local'
                  ? 'bg-emerald-900 text-emerald-300'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {seat.cost === 'local' ? 'FREE' : 'paid'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}