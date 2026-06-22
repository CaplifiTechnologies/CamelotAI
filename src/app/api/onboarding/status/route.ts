// GET /api/onboarding/status — setup snapshot (no secret values exposed).

import { NextResponse } from 'next/server'
import { LOCAL_TALLY_MODEL, OLLAMA_BASE_URL } from '@/lib/seats'
import { ollamaReachable } from '@/lib/providers/ollama'
import { anthropicConfigured, anthropicSource } from '@/lib/providers/anthropic'
import { grokConfigured, grokSource } from '@/lib/providers/grok'
import { odysseusConfigured, odysseusHealthy, odysseusSource } from '@/lib/providers/odysseus'
import { bunkerMounted, readHotDefaults } from '@/lib/bunkerManifest'

export const runtime = 'nodejs'

export async function GET() {
  const reachable = await ollamaReachable()
  let models: string[] = []
  let tallyInstalled = false

  if (reachable) {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
      if (res.ok) {
        const data = await res.json()
        models = (data.models ?? []).map((m: { name: string }) => m.name).sort()
        const base = LOCAL_TALLY_MODEL.split(':')[0]
        tallyInstalled = models.some(
          (n) => n === LOCAL_TALLY_MODEL || n.startsWith(`${base}:`),
        )
      }
    } catch {
      /* tags unavailable */
    }
  }

  const odysseusUp = await odysseusHealthy()

  return NextResponse.json({
    ollama: {
      reachable,
      models,
      tallyModel: LOCAL_TALLY_MODEL,
      tallyInstalled,
    },
    odysseus: {
      reachable: odysseusUp,
      configured: odysseusConfigured(),
      source: odysseusSource(),
    },
    bunker: {
      mounted: bunkerMounted(),
      hotDefaults: readHotDefaults(),
    },
    secrets: {
      claude: { configured: anthropicConfigured(), source: anthropicSource() },
      grok: { configured: grokConfigured(), source: grokSource() },
      odysseus: { configured: odysseusConfigured(), source: odysseusSource() },
    },
    platform: process.platform,
    keychainSupported: process.platform === 'darwin',
  })
}