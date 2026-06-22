'use client'

import { useState } from 'react'
import type { SeatUsage } from '@/lib/usage'
import UsageChip from '@/components/UsageChip'

interface MessageBubbleProps {
  id: string
  seatKey: string
  content: string
  createdAt: string
  editedAt?: string
  usage?: SeatUsage
  isOwn?: boolean
  onEdit?: (id: string, newContent: string) => void
  onBranch?: (id: string) => void
}

export default function MessageBubble({
  id, seatKey, content, createdAt, editedAt, usage, isOwn, onEdit, onBranch,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)

  const interject = /^INTERJECT:/i.test(content.trim())

  const handleSave = () => {
    onEdit?.(id, draft)
    setEditing(false)
  }

  return (
    <div className={`group flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <div className="w-8 h-8 rounded-full bg-zinc-700 flex-shrink-0" />
      <div className="max-w-[70%]">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
          <span className="font-medium text-zinc-400">{seatKey}</span>
          <span>{new Date(createdAt).toLocaleTimeString()}</span>
          {editedAt && <span className="italic">(edited)</span>}
          {interject && <span className="text-amber-400">⚡ interjection</span>}
          {usage && <UsageChip usage={usage} />}
        </div>
        {editing ? (
          <div className="space-y-1">
            <textarea
              className="w-full bg-zinc-900 rounded p-2 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex gap-2 text-xs">
              <button onClick={handleSave} className="text-emerald-400">Save</button>
              <button onClick={() => setEditing(false)} className="text-zinc-400">Cancel</button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
              interject ? 'bg-amber-950/60 border border-amber-800/60' : 'bg-zinc-900'
            }`}
          >
            {content}
            <span className="ml-2 opacity-0 group-hover:opacity-100 text-xs text-zinc-500 inline-flex gap-2">
              {isOwn && onEdit && (
                <button onClick={() => setEditing(true)} className="hover:text-zinc-300">edit</button>
              )}
              {onBranch && (
                <button onClick={() => onBranch(id)} className="hover:text-zinc-300">branch</button>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
