'use client'

import { useBoardroomStore } from '@/store/useBoardroomStore'

export default function AgentToolsToggle() {
  const agentTools = useBoardroomStore((s) => s.agentTools)
  const setAgentTools = useBoardroomStore((s) => s.setAgentTools)

  return (
    <button
      onClick={() => setAgentTools(!agentTools)}
      title="Agent tools — list/read/write files under allowed folders on this Mac"
      className={`text-[10px] px-2 py-1 rounded transition-colors ${
        agentTools
          ? 'bg-sky-800 text-sky-100'
          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
      }`}
    >
      {agentTools ? '● Agent tools' : '○ Agent tools'}
    </button>
  )
}