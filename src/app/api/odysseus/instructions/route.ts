// GET /api/odysseus/instructions — path to Matt's editable Odysseus instruction file

import { NextResponse } from 'next/server'
import { ensureInstructionsFile, ODYSSEUS_INSTRUCTIONS_PATH } from '@/lib/contextBundle'
import fs from 'node:fs'

export async function GET() {
  ensureInstructionsFile()
  return NextResponse.json({
    path: ODYSSEUS_INSTRUCTIONS_PATH,
    exists: fs.existsSync(ODYSSEUS_INSTRUCTIONS_PATH),
  })
}