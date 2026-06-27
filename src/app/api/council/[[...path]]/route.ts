import { NextResponse } from 'next/server'
import { councilBridgeFetch } from '@/lib/councilBridge'

export const runtime = 'nodejs'

type Ctx = { params: { path?: string[] } }

async function proxy(req: Request, segments: string[] | undefined) {
  const sub = (segments ?? []).join('/')
  const path = sub ? `/api/council/${sub}` : '/api/council'
  const url = new URL(req.url)
  const qs = url.search
  const target = `${path}${qs}`

  let body: string | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.text()
  }

  try {
    const res = await councilBridgeFetch(target, {
      method: req.method,
      body,
      headers: body ? { 'content-type': 'application/json' } : undefined,
    })
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Council bridge unreachable' },
      { status: 503 },
    )
  }
}

export async function GET(req: Request, ctx: Ctx) {
  return proxy(req, ctx.params.path)
}

export async function POST(req: Request, ctx: Ctx) {
  return proxy(req, ctx.params.path)
}