// POST /api/ollama-pull — stream Ollama model download progress (NDJSON proxy).

import { OLLAMA_BASE_URL } from '@/lib/seats'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const model = typeof body.model === 'string' ? body.model.trim() : ''
  if (!model) {
    return new Response(JSON.stringify({ error: 'model is required' }), { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Ollama is not reachable. Is it running?' }), {
      status: 503,
    })
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '')
    return new Response(
      JSON.stringify({ error: `Ollama pull failed: HTTP ${upstream.status} ${detail.slice(0, 200)}` }),
      { status: upstream.status || 502 },
    )
  }

  return new Response(upstream.body, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
  })
}