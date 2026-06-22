'use client'

import { useCallback, useEffect, useState } from 'react'

export default function OdysseusInstructionsLink() {
  const [path, setPath] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/odysseus/instructions')
      .then((r) => r.json())
      .then((d) => setPath(d.path ?? null))
      .catch(() => {})
  }, [])

  const open = useCallback(async () => {
    const cam = (window as any).camelot
    if (cam?.openOdysseusInstructions) {
      const r = await cam.openOdysseusInstructions()
      if (!r?.ok && r?.path) {
        window.prompt('Edit this file in your editor:', r.path)
      }
      return
    }
    if (path) window.prompt('Edit Odysseus instructions in your editor:', path)
  }, [path])

  return (
    <button
      type="button"
      onClick={open}
      className="text-[10px] text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline"
      title={path ?? 'Odysseus standing instructions'}
    >
      Odysseus instructions
    </button>
  )
}