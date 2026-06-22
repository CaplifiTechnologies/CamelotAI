// Generate one seat's reply and persist it (locked decisions #1, #3, #4).
// POST /api/chat { seat, history } → { message } | { passed: true } | error
//
//   claude → paid Anthropic ·  grok → paid xAI ·  qwen/local → free Ollama
//
// Cost Guard runs server-side too (defense in depth): paid calls over the 50k
// token cap are blocked regardless of what the client routed.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { askClaude, anthropicConfigured, type Turn } from '@/lib/providers/anthropic'
import { askGrok, grokConfigured } from '@/lib/providers/grok'
import { askOllama } from '@/lib/providers/ollama'
import { askOdysseus, odysseusConfigured } from '@/lib/providers/odysseus'
import { askClaudeWithTools, askGrokWithTools, askOllamaWithTools } from '@/lib/agentLoop'
import { seatByKey } from '@/lib/seats'
import { checkCost, estimateTokens } from '@/lib/costGuard'
import { isPass } from '@/lib/orchestrator'

export const runtime = 'nodejs'

function systemFor(seatKey: string, seatName: string): string {
  if (seatKey === 'odysseus') {
    return [
      `You are ${seatName}, a local-first agent seat in the Camelot boardroom.`,
      `You run on this machine with agent tools: bash, read_file, write_file, and optional`,
      `context files when configured. Other seats (Grok, Claude, cloud APIs) do NOT have`,
      `local filesystem access — only you do.`,
      `Camelot runs verified read/write/list via local fs-bridge when the user asks`,
      `for file work — you will see the real path and content in the reply.`,
      `When the user asks about local read/write, roll call, or what is working: answer`,
      `directly in one short paragraph. Never reply PASS to those.`,
      `Never claim a file was written unless the harness confirms the path.`,
      `On roll call: state your name, that you are online with local tools, and one line`,
      `on what you can do right now.`,
      `Be concise. Build on the transcript when useful, but correct wrong claims from`,
      `other seats about your local capabilities.`,
      `Use PASS only when the user's latest message truly needs no reply from the local seat`,
      `(e.g. they said thanks, or another seat already fully answered a non-local topic).`,
      `To flag something urgent, begin with "INTERJECT:" and one sentence.`,
    ].join(' ')
  }
  return [
    `You are ${seatName}, a seat at the Camelot boardroom — a multi-model`,
    `discussion led by Matt (the human chair). Speak in your own voice, be`,
    `concise and substantive, and build on what others have said. Do not`,
    `pretend to be another seat.`,
    `If you genuinely have nothing to add, reply with exactly the word PASS`,
    `(nothing else). To flag something urgent, begin your reply with`,
    `"INTERJECT:" followed by a single sentence.`,
  ].join(' ')
}

export async function POST(req: Request) {
  // `model`/`cost` are optional client hints so dynamically-invited Ollama seats
  // (not in the static registry) are still callable.
  const { seat, history, model, cost, threadId, agentTools } = (await req.json()) as {
    seat: string
    history: Turn[]
    model?: string
    cost?: 'local' | 'paid'
    threadId?: string
    agentTools?: boolean
  }
  const useTools = agentTools !== false
  const def = seatByKey(seat)
  const seatName = def?.name ?? seat
  const turns: Turn[] = Array.isArray(history) ? history : []
  const effectiveCost = cost ?? def?.cost
  const effectiveModel = model ?? def?.model
  const isLocal =
    effectiveCost === 'local' || seat === 'odysseus' || seat === 'qwen' || seat === 'local'

  if (process.env.CAMELOT_DEV_LOG === '1' || process.env.NODE_ENV === 'development') {
    console.log('[chat]', {
      seat,
      threadId: threadId ?? null,
      historyLen: turns.length,
      model: effectiveModel ?? '(default)',
    })
  }

  // Server-side Cost Guard — paid seats only (local is always free).
  if (!isLocal) {
    const tokens = turns.reduce((n, t) => n + estimateTokens(t.content), 0)
    const warning = checkCost(tokens)
    if (warning?.threshold === 'block') {
      return NextResponse.json(
        { error: `Cost Guard: ~${Math.round(tokens / 1000)}k tokens exceeds the 50k cap. Trim the thread or use Local Only.` },
        { status: 413 },
      )
    }
  }

  let reply
  try {
    const sys = systemFor(seat, seatName)
    if (seat === 'odysseus') {
      if (!odysseusConfigured()) {
        return NextResponse.json(
          {
            error: `${seatName} is offline — no ODYSSEUS_API_TOKEN. Create one in Odysseus Settings → Integrations.`,
          },
          { status: 503 },
        )
      }
      // Odysseus runs its own agent loop — never wrap with Camelot fs-bridge.
      reply = await askOdysseus(turns, sys, threadId ?? 'main')
    } else if (isLocal) {
      reply = useTools
        ? await askOllamaWithTools(turns, sys, effectiveModel ?? 'qwen2.5:7b')
        : await askOllama(turns, sys, effectiveModel)
    } else if (seat === 'grok') {
      if (!grokConfigured()) {
        return NextResponse.json(
          { error: `${seatName} is offline — no xAI credential (set XAI_API_KEY or log in with the Grok CLI).` },
          { status: 503 },
        )
      }
      reply = useTools ? await askGrokWithTools(turns, sys) : await askGrok(turns, sys)
    } else if (seat === 'claude') {
      if (!anthropicConfigured()) {
        return NextResponse.json(
          { error: `${seatName} is offline — no ANTHROPIC_API_KEY. Toggle Local Only to use free seats.` },
          { status: 503 },
        )
      }
      reply = useTools ? await askClaudeWithTools(turns, sys) : await askClaude(turns, sys)
    } else {
      return NextResponse.json({ error: `${seatName} is not wired in this build.` }, { status: 501 })
    }
  } catch (err) {
    return NextResponse.json(
      { error: `${seatName} failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  // PASS participation — the seat declined; don't clutter the transcript.
  if (isPass(reply.content)) {
    return NextResponse.json({ passed: true, seat, usage: reply.usage })
  }

  const message = await prisma.message.create({
    data: { seatKey: seat, content: reply.content, threadId: threadId ?? null },
  })
  return NextResponse.json({ message, usage: reply.usage })
}
