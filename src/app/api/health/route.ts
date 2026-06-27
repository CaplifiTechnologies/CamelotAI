// Which seats are actually reachable right now.
// GET /api/health → { claude, grok, ollama, odysseus }

import { NextResponse } from 'next/server'
import { councilBridgeHealthy } from '@/lib/councilBridge'
import { anthropicConfigured } from '@/lib/providers/anthropic'
import { fuguConfigured } from '@/lib/providers/fugu'
import { grokConfigured } from '@/lib/providers/grok'
import { ollamaReachable } from '@/lib/providers/ollama'
import { odysseusReachable } from '@/lib/providers/odysseus'

export const runtime = 'nodejs'

export async function GET() {
  const [ollama, odysseus, council] = await Promise.all([
    ollamaReachable(),
    odysseusReachable(),
    councilBridgeHealthy(),
  ])
  return NextResponse.json({
    claude: anthropicConfigured(),
    grok: grokConfigured(),
    fugu: fuguConfigured(),
    ollama,
    odysseus,
    council,
  })
}
