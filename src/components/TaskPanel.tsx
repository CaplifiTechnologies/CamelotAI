'use client'

import { useEffect, useState } from 'react'
import { useBoardroomStore } from '@/store/useBoardroomStore'
import { api } from '@/lib/client'

interface Task {
  id: string
  description: string
  status: string
  assignedTo?: string | null
  result?: string | null
}

const STATUS: Record<string, string> = {
  open: 'bg-zinc-700 text-zinc-300',
  in_progress: 'bg-amber-900 text-amber-300',
  done: 'bg-emerald-900 text-emerald-300',
}

export default function TaskPanel() {
  const seats = useBoardroomStore((s) => s.seats)
  const [tasks, setTasks] = useState<Task[]>([])
  const [desc, setDesc] = useState('')
  const [assignee, setAssignee] = useState('')

  const refresh = () => api.listTasks().then(setTasks).catch(() => {})
  useEffect(() => {
    refresh()
  }, [])

  async function add() {
    const d = desc.trim()
    if (!d) return
    await api.createTask(d, assignee || undefined)
    setDesc('')
    refresh()
  }

  async function update(id: string, patch: { status?: string; assignedTo?: string | null }) {
    await api.updateTask(id, patch)
    refresh()
  }

  return (
    <div className="border-t border-zinc-800 p-3 max-h-72 overflow-y-auto">
      <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Tasks</h2>

      <div className="flex gap-1 mb-2">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New task…"
          className="flex-1 bg-zinc-900 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-600"
        />
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="bg-zinc-900 rounded px-1 text-xs text-zinc-400"
          title="Assign to seat"
        >
          <option value="">—</option>
          {seats.filter((s) => s.enabled && s.visible !== false).map((s) => (
            <option key={s.key} value={s.key}>{s.name}</option>
          ))}
        </select>
        <button onClick={add} className="px-2 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">+</button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs text-zinc-600">No tasks yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="text-sm">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS[t.status] ?? STATUS.open}`}>
                  {t.status}
                </span>
                <span className="flex-1 text-zinc-300 truncate" title={t.description}>{t.description}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 pl-1 text-[10px] text-zinc-500">
                {t.assignedTo && <span>@{t.assignedTo}</span>}
                {t.status === 'open' && (
                  <button onClick={() => update(t.id, { status: 'in_progress' })} className="text-amber-400 hover:underline">claim</button>
                )}
                {t.status !== 'done' && (
                  <button onClick={() => update(t.id, { status: 'done' })} className="text-emerald-400 hover:underline">complete</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
