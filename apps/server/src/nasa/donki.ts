import type { NASAEvent } from '@astrovitals/shared'

/**
 * NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information).
 * Endpoint (moved Sept 2026, keyless): https://ccmc.gsfc.nasa.gov/DONKI-API/get/{FLR|GST|CME|SEP}?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Source: CCMC notice https://ccmc.gsfc.nasa.gov/news/major-updates/ ("Input parameters and data
 * response formats have not been modified"). Field names below match live responses of 2026-10-05.
 *
 * Note: DONKI latitude/longitude fields are HELIOGRAPHIC (positions on the Sun), so they go
 * into metadata, never into NASAEvent.latitude/longitude (which mean Earth coordinates).
 */

export interface DonkiInstrument {
  displayName: string
}
export interface DonkiLinked {
  activityID: string
}

export interface DonkiFlare {
  flrID: string
  beginTime: string
  peakTime?: string | null
  endTime?: string | null
  classType?: string | null
  sourceLocation?: string | null
  activeRegionNum?: number | null
  instruments?: DonkiInstrument[] | null
  linkedEvents?: DonkiLinked[] | null
  link?: string
  note?: string | null
}

export interface DonkiStorm {
  gstID: string
  startTime: string
  allKpIndex?: { observedTime: string; kpIndex: number; source: string }[] | null
  linkedEvents?: DonkiLinked[] | null
  link?: string
}

export interface DonkiCme {
  activityID: string
  startTime: string
  sourceLocation?: string | null
  activeRegionNum?: number | null
  note?: string | null
  instruments?: DonkiInstrument[] | null
  cmeAnalyses?:
    | {
        isMostAccurate?: boolean
        time21_5?: string | null
        latitude?: number | null
        longitude?: number | null
        halfAngle?: number | null
        speed?: number | null
        type?: string | null
      }[]
    | null
  linkedEvents?: DonkiLinked[] | null
  link?: string
}

export interface DonkiSep {
  sepID: string
  eventTime: string
  instruments?: DonkiInstrument[] | null
  linkedEvents?: DonkiLinked[] | null
  link?: string
}

const iso = (t: string) => new Date(t).toISOString()
const names = (xs?: DonkiInstrument[] | null) => (xs ?? []).map((i) => i.displayName)
const linked = (xs?: DonkiLinked[] | null) => (xs ?? []).map((l) => l.activityID)

const FLARE_BASE: Record<string, number> = { A: 1e-8, B: 1e-7, C: 1e-6, M: 1e-5, X: 1e-4 }

/** "M2.4" -> 2.4e-5 W/m² (GOES 0.1–0.8 nm peak flux). */
export function flareClassToFlux(cls: string | null | undefined): number | undefined {
  const m = /^([ABCMX])(\d+(?:\.\d+)?)$/.exec((cls ?? '').trim().toUpperCase())
  if (!m) return undefined
  return FLARE_BASE[m[1]!]! * Number(m[2])
}

/** NOAA G-scale from Kp (G1 = Kp 5 ... G5 = Kp 9). */
export function kpToGScale(kp: number): string | undefined {
  if (kp >= 9) return 'G5'
  if (kp >= 8) return 'G4'
  if (kp >= 7) return 'G3'
  if (kp >= 6) return 'G2'
  if (kp >= 5) return 'G1'
  return undefined
}

export function parseFlares(rows: DonkiFlare[]): NASAEvent[] {
  return rows.map((f) => {
    const flux = flareClassToFlux(f.classType)
    return {
      id: f.flrID,
      source: 'DONKI',
      eventType: 'FLR',
      timestamp: iso(f.beginTime),
      ...(f.endTime ? { endTimestamp: iso(f.endTime) } : {}),
      title: `Solar flare ${f.classType ?? '(class unknown)'}`,
      ...(f.link ? { link: f.link } : {}),
      ...(f.classType ? { severity: { label: f.classType, ...(flux ? { value: flux } : {}), scale: 'GOES X-ray class' } } : {}),
      metadata: {
        peakTime: f.peakTime ? iso(f.peakTime) : null,
        sourceLocation: f.sourceLocation ?? null,
        activeRegionNum: f.activeRegionNum ?? null,
        instruments: names(f.instruments),
        linkedEvents: linked(f.linkedEvents),
      },
    }
  })
}

export function parseStorms(rows: DonkiStorm[]): NASAEvent[] {
  return rows.map((g) => {
    const kps = (g.allKpIndex ?? []).map((k) => ({ observedTime: iso(k.observedTime), kpIndex: k.kpIndex, source: k.source }))
    const maxKp = kps.length ? Math.max(...kps.map((k) => k.kpIndex)) : undefined
    const g_ = maxKp !== undefined ? kpToGScale(maxKp) : undefined
    return {
      id: g.gstID,
      source: 'DONKI',
      eventType: 'GST',
      timestamp: iso(g.startTime),
      title: `Geomagnetic storm${maxKp !== undefined ? ` (max Kp ${maxKp}${g_ ? `, ${g_}` : ''})` : ''}`,
      ...(g.link ? { link: g.link } : {}),
      ...(maxKp !== undefined ? { severity: { label: `Kp ${maxKp}`, value: maxKp, scale: 'Kp index (0–9)' } } : {}),
      metadata: { kpIndex: kps, maxKp: maxKp ?? null, noaaGScale: g_ ?? null, linkedEvents: linked(g.linkedEvents) },
    }
  })
}

export function parseCmes(rows: DonkiCme[]): NASAEvent[] {
  return rows.map((c) => {
    const analyses = c.cmeAnalyses ?? []
    const best = analyses.find((a) => a.isMostAccurate) ?? analyses[0]
    const speed = best?.speed ?? undefined
    return {
      id: c.activityID,
      source: 'DONKI',
      eventType: 'CME',
      timestamp: iso(c.startTime),
      title: `Coronal mass ejection${speed ? ` (${speed} km/s)` : ''}`,
      ...(c.link ? { link: c.link } : {}),
      ...(speed ? { severity: { label: `${speed} km/s`, value: speed, scale: 'CME speed (km/s)' } } : {}),
      metadata: {
        sourceLocation: c.sourceLocation || null,
        activeRegionNum: c.activeRegionNum ?? null,
        instruments: names(c.instruments),
        analysis: best
          ? {
              time21_5: best.time21_5 ? iso(best.time21_5) : null,
              heliographicLatitude: best.latitude ?? null,
              heliographicLongitude: best.longitude ?? null,
              halfAngleDeg: best.halfAngle ?? null,
              speedKmS: best.speed ?? null,
              type: best.type ?? null,
            }
          : null,
        linkedEvents: linked(c.linkedEvents),
      },
    }
  })
}

export function parseSeps(rows: DonkiSep[]): NASAEvent[] {
  return rows.map((s) => ({
    id: s.sepID,
    source: 'DONKI',
    eventType: 'SEP',
    timestamp: iso(s.eventTime),
    title: 'Solar energetic particle event',
    ...(s.link ? { link: s.link } : {}),
    metadata: { instruments: names(s.instruments), linkedEvents: linked(s.linkedEvents) },
  }))
}

export const DONKI_TYPES = ['FLR', 'GST', 'CME', 'SEP'] as const
export type DonkiType = (typeof DONKI_TYPES)[number]

export function parseDonki(type: DonkiType, rows: unknown): NASAEvent[] {
  if (!Array.isArray(rows)) return [] // DONKI returns an empty body / non-array when nothing matches
  switch (type) {
    case 'FLR':
      return parseFlares(rows as DonkiFlare[])
    case 'GST':
      return parseStorms(rows as DonkiStorm[])
    case 'CME':
      return parseCmes(rows as DonkiCme[])
    case 'SEP':
      return parseSeps(rows as DonkiSep[])
  }
}
