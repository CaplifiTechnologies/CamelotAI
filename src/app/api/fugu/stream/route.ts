// POST /api/fugu/stream — SSE stream from Fugu Responses API (disabled by default).

import { requireAgenticEnabled } from '@/lib/fuguConfig'
import { fuguConfigured } from '@/lib/providers/fugu'
import { fuguResponsesStream } from '@/lib/providers/fuguAgentic'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: Request) {
  const gate = requireAgenticEnabled()
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error }), { status: 403 })
  }
  if (!fuguConfigured()) {
    return new Response(JSON.stringify({ error: 'SAKANA_API_KEY not configured' }), { status: 503 })
  }

  const body = (await req.json()) as {
    prompt?: string
    instructions?: string
    model?: string
    reasoningEffort?: 'high' | 'xhigh' | 'max'
    webSearch?: boolean
  }
  if (!body.prompt?.trim()) {
    return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = fuguResponsesStream({
          prompt: body.prompt!,
          instructions: body.instructions,
          model: body.model,
          reasoningEffort: body.reasoningEffort,
          webSearch: body.webSearch ?? true,
        })
        let result = await gen.next()
        while (!result.done) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(result.value)}\n\n`))
          result = await gen.next()
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', ...result.value })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}