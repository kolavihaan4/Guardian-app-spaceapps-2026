import { UpstreamError } from './errors.ts'

export type FetchLike = typeof fetch

export interface GetJsonOptions {
  fetchImpl?: FetchLike
  timeoutMs?: number
  headers?: Record<string, string>
  method?: 'GET' | 'POST'
  body?: string
  /** Hard cap on response size; NASA polygons can be large. */
  maxBytes?: number
}

/**
 * Fetch JSON from a fixed, allow-listed upstream. Callers build URLs from
 * configuration plus validated parameters only (no user-supplied hosts → no SSRF).
 * Parses text as JSON regardless of Content-Type (EONET mislabels JSON as RSS).
 */
export async function getJson<T = unknown>(upstream: string, url: string, opts: GetJsonOptions = {}): Promise<{ data: T; headers: Headers }> {
  const f = opts.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000)
  let res: Response
  try {
    res = await f(url, {
      method: opts.method ?? 'GET',
      headers: { accept: 'application/json', 'user-agent': 'AstroVitals/0.1 (NASA Space Apps prototype)', ...opts.headers },
      body: opts.body,
      signal: controller.signal,
      redirect: 'follow',
    })
  } catch (err) {
    throw new UpstreamError(upstream, null, `${upstream} unreachable: ${(err as Error).name}`)
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  if ((opts.maxBytes ?? 5_000_000) < text.length) {
    throw new UpstreamError(upstream, res.status, `${upstream} response too large`)
  }
  if (!res.ok) {
    throw new UpstreamError(upstream, res.status, `${upstream} returned HTTP ${res.status}`)
  }
  if (text.trim() === '') return { data: null as T, headers: res.headers } // e.g. OAuth revoke → 200 with empty body
  try {
    return { data: JSON.parse(text) as T, headers: res.headers }
  } catch {
    // e.g. the retired DONKI URLs now 301 to an HTML news page
    throw new UpstreamError(upstream, res.status, `${upstream} returned non-JSON content (endpoint moved or down?)`)
  }
}
