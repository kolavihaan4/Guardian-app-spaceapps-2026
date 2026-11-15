import type { EnvironmentSeries } from '@astrovitals/shared'

/**
 * NASA POWER daily point API (keyless).
 * GET https://power.larc.nasa.gov/api/temporal/daily/point?parameters=..&community=RE&latitude=..&longitude=..
 *     &start=YYYYMMDD&end=YYYYMMDD&format=JSON&time-standard=UTC
 * Docs: https://power.larc.nasa.gov/docs/services/api/ . No published numeric rate limit; guidance:
 * "Please do not go more than five concurrent requests". Latency: meteorology 2–3 days, solar 5–7 days;
 * missing values are the fill value -999 (mapped to null here, never plotted as a number).
 */

export const POWER_PARAMETERS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'RH2M', 'PS', 'WS10M', 'ALLSKY_SFC_SW_DWN', 'ALLSKY_SFC_UV_INDEX'] as const

interface PowerBody {
  properties?: { parameter?: Record<string, Record<string, number>> }
  parameters?: Record<string, { units: string; longname: string }>
  header?: { fill_value?: number }
}

const ymd = (k: string) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`

export function parsePowerDaily(body: unknown): EnvironmentSeries[] {
  const b = body as PowerBody
  const params = b?.properties?.parameter
  if (!params) throw new Error('POWER: unexpected body (no properties.parameter)')
  const fill = b.header?.fill_value ?? -999
  return Object.entries(params).map(([name, byDate]) => ({
    parameter: name,
    longName: b.parameters?.[name]?.longname ?? name,
    unit: b.parameters?.[name]?.units ?? '',
    points: Object.entries(byDate)
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([k, v]) => ({ date: ymd(k), value: v === fill || v === -999 ? null : v })),
  }))
}

export const compactDate = (d: string) => d.replace(/-/g, '')
