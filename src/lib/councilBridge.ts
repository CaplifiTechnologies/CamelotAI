// Server-side proxy to the Python council sidecar (:20022).

const BRIDGE =
  process.env.CAMELOT_COUNCIL_BRIDGE_URL ?? 'http://127.0.0.1:20022'

export async function councilBridgeFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${BRIDGE}${path.startsWith('/') ? path : `/${path}`}`
  return fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
}

export async function councilBridgeJson<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await councilBridgeFetch(path, init)
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Council bridge HTTP ${res.status}`)
  }
  return body
}

export async function councilBridgeHealthy(): Promise<boolean> {
  try {
    const res = await councilBridgeFetch('/api/health', { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}