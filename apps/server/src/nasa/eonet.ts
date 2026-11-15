import type { NASAEvent } from '@astrovitals/shared'

/**
 * NASA EONET v3 (Earth Observatory Natural Event Tracker), keyless.
 * Docs: https://eonet.gsfc.nasa.gov/docs/v3 — GET /api/v3/events?status=&days=&limit=&category=
 * Observed 2026-10-05: X-RateLimit-Limit 60 (rolling) on /events; JSON sometimes served with an
 * RSS content-type; Point coordinates are [longitude, latitude]; polygon rings are occasionally
 * written [lat, lon] (e.g. EONET_24511), so polygon centroids are sanity-checked.
 * Terms: "intended to be used for visualization and general information purposes only".
 */

export interface EonetGeometry {
  magnitudeValue?: number | null
  magnitudeUnit?: string | null
  date: string
  type: 'Point' | 'Polygon' | string
  coordinates: unknown
}

export interface EonetEvent {
  id: string
  title: string
  description?: string | null
  link?: string
  closed?: string | null
  categories?: { id: string | number; title: string }[]
  sources?: { id: string; url: string }[]
  geometry?: EonetGeometry[]
}

function polygonCentroid(coords: unknown): { lat: number; lon: number; swapped: boolean } | undefined {
  const ring = Array.isArray(coords) ? (coords[0] as unknown) : undefined
  if (!Array.isArray(ring) || ring.length === 0) return undefined
  let sx = 0
  let sy = 0
  let n = 0
  for (const p of ring) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') {
      sx += p[0]
      sy += p[1]
      n++
    }
  }
  if (!n) return undefined
  const a = sx / n
  const b = sy / n
  // GeoJSON order is [lon, lat]; if the "lat" is impossible but swapping fixes it, swap.
  if (Math.abs(b) > 90 && Math.abs(a) <= 90) return { lat: a, lon: b, swapped: true }
  return { lat: b, lon: a, swapped: false }
}

export function parseEonetEvents(body: unknown): NASAEvent[] {
  const events = (body as { events?: EonetEvent[] })?.events
  if (!Array.isArray(events)) return []
  return events.map((e) => {
    const geoms = [...(e.geometry ?? [])].sort((x, y) => x.date.localeCompare(y.date))
    const latest = geoms[geoms.length - 1]
    let latitude: number | undefined
    let longitude: number | undefined
    let coordinateNote: string | undefined
    if (latest?.type === 'Point' && Array.isArray(latest.coordinates)) {
      const [lon, lat] = latest.coordinates as number[]
      if (typeof lat === 'number' && typeof lon === 'number') {
        latitude = lat
        longitude = lon
      }
    } else if (latest?.type === 'Polygon') {
      const c = polygonCentroid(latest.coordinates)
      if (c) {
        latitude = c.lat
        longitude = c.lon
        coordinateNote = c.swapped ? 'polygon centroid (upstream ring appeared to be [lat, lon]; swapped)' : 'polygon centroid'
      }
    }
    const category = e.categories?.[0]
    return {
      id: e.id,
      source: 'EONET',
      eventType: String(category?.id ?? 'unknown'),
      timestamp: new Date(geoms[0]?.date ?? latest?.date ?? Date.now()).toISOString(),
      ...(e.closed ? { endTimestamp: new Date(e.closed).toISOString() } : {}),
      ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
      title: e.title,
      ...(e.link ? { link: e.link } : {}),
      ...(latest?.magnitudeValue != null
        ? { severity: { label: `${latest.magnitudeValue} ${latest.magnitudeUnit ?? ''}`.trim(), value: latest.magnitudeValue, scale: latest.magnitudeUnit ?? '' } }
        : {}),
      metadata: {
        categoryTitle: category?.title ?? null,
        status: e.closed ? 'closed' : 'open',
        lastObserved: latest ? new Date(latest.date).toISOString() : null,
        geometryType: latest?.type ?? null,
        geometryCount: geoms.length,
        sources: (e.sources ?? []).map((s) => ({ id: s.id, url: s.url })),
        ...(coordinateNote ? { coordinateNote } : {}),
        // Full track for storms (Points only; polygons are dropped to keep payloads small).
        track: geoms
          .filter((g) => g.type === 'Point' && Array.isArray(g.coordinates))
          .map((g) => ({ date: g.date, lon: (g.coordinates as number[])[0], lat: (g.coordinates as number[])[1], magnitude: g.magnitudeValue ?? null })),
      },
    }
  })
}
