// Which seats are actually reachable right now.
// GET /api/health → { claude, grok, ollama, odysseus }

import { NextResponse } from 'next/server'
import { anthropicConfigured } from '@/lib/providers/anthropic'
import { grokConfigured } from '@/lib/providers/grok'
import { ollamaReachable } from '@/lib/providers/ollama'
import { odysseusReachable } from '@/lib/providers/odysseus'

export const runtime = 'nodejs'

export async function GET() {
  const [ollama, odysseus] = await Promise.all([ollamaReachable(), odysseusReachable()])
  return NextResponse.json({
    claude: anthropicConfigured(),
    grok: grokConfigured(),
    ollama,
    odysseus,
  })
}
