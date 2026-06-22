'use client'

import { useBoardroomStore } from '@/store/useBoardroomStore'

export default function LocalModeToggle() {
  const localOnly = useBoardroomStore((s) => s.localOnly)
  const setLocalOnly = useBoardroomStore((s) => s.setLocalOnly)

  return (
    <button
      onClick={() => setLocalOnly(!localOnly)}
      title="Local Only mode — Odysseus primary (Qwen auto-fallback, no paid APIs)"
      className={`text-[10px] px-2 py-1 rounded transition-colors ${
        localOnly
          ? 'bg-emerald-700 text-emerald-50'
          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
      }`}
    >
      {localOnly ? '● Local Only' : '○ Local Only'}
    </button>
  )
}
