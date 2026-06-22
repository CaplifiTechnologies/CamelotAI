// GET /api/onboarding/models — bunker-aware recommended local models.

import { NextResponse } from 'next/server'
import { RECOMMENDED_MODELS } from '@/lib/onboarding'
import { bunkerMounted, recommendedChatModels } from '@/lib/bunkerManifest'

export const runtime = 'nodejs'

export async function GET() {
  const bunker = bunkerMounted()
  const models = bunker ? recommendedChatModels() : []
  return NextResponse.json({
    bunker,
    models: models.length ? models : RECOMMENDED_MODELS,
  })
}