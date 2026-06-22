// Full transcript export — main feed + all side-thread branches.

import { NextResponse } from 'next/server'
import { buildExportMarkdown } from '@/lib/exportMarkdown'

export const runtime = 'nodejs'

export async function GET() {
  const markdown = await buildExportMarkdown()
  return NextResponse.json({ markdown })
}