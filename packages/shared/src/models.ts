/**
 * Normalized internal data model shared by the backend and the dashboard.
 *
 * Rules this model encodes:
 *  - Raw measurements are never altered. When a value is converted to a canonical
 *    unit (e.g. Apple's SpO2 fraction 0.97 -> 97 %), the untouched original is kept
 *    in `raw` so the conversion is auditable.
 *  - Every record carries its source, its original timestamp, and a `simulated` flag.
 *    Simulated (DEMO) records are generated on request and never persisted, so they
 *    cannot be mixed into real data by accident.
 */

/** ISO-8601 timestamp with offset, e.g. "2026-10-05T23:42:09Z". */
export type ISO8601 = string
/** Calendar date in the wearer's local time, "YYYY-MM-DD". */
export type LocalDate = string

export const METRIC_TYPES = [
  'heart_rate',
  'resting_heart_rate',
  'hrv_rmssd',
  'hrv_sdnn',
  'spo2',
  'respiratory_rate',
  'skin_temperature',
  'skin_temperature_deviation',
  'steps',
  'active_energy',
] as const
export type MetricType = (typeof METRIC_TYPES)[number]

export const PROVIDER_IDS = [
  'demo',
  'google-health',
  'apple-health-export',
  'healthkit-companion',
  'garmin',
] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

/** How a value was produced by the upstream platform. */
export type Aggregation = 'sample' | 'interval' | 'daily'

export type QualityStatus = 'ok' | 'out_of_range' | 'implausible'

export interface QualityFlag {
  status: QualityStatus
  /** Plain-language data-quality note. Never a diagnosis. */
  note?: string
}

export interface Metric {
  timestamp: ISO8601
  /** For interval data (steps in a minute, energy in an hour). */
  endTimestamp?: ISO8601
  metricType: MetricType
  value: number
  unit: string
  source: ProviderId
  /** Upstream platform/app that recorded it, e.g. "FITBIT", "Apple Watch (com.apple.health)". */
  sourceDetail?: string
  device?: string
  /** 0..1 where the upstream API provides one; omitted otherwise (never invented). */
  confidence?: number
  aggregation: Aggregation
  /** Original value/unit when `value`/`unit` were converted to the canonical unit. */
  raw?: { value: number; unit: string }
  simulated: boolean
  quality?: QualityFlag
}

export type SleepStageType = 'awake' | 'light' | 'deep' | 'rem' | 'asleep' | 'in_bed' | 'restless'

export interface SleepStage {
  stage: SleepStageType
  start: ISO8601
  end: ISO8601
}

export interface SleepData {
  start: ISO8601
  end: ISO8601
  minutesAsleep: number
  minutesAwake?: number
  stages: SleepStage[]
  /** Upstream identifier when available (dedup key). */
  externalId?: string
  source: ProviderId
  sourceDetail?: string
  device?: string
  simulated: boolean
}

export interface ActivityData {
  date: LocalDate
  steps?: number
  activeEnergyKcal?: number
  source: ProviderId
  simulated: boolean
}

export interface Workout {
  start: ISO8601
  end: ISO8601
  activityType: string
  displayName: string
  energyKcal?: number
  averageHeartRate?: number
  distanceMeters?: number
  source: ProviderId
  sourceDetail?: string
  simulated: boolean
}

export const NASA_SOURCES = ['DONKI', 'EONET', 'APOD', 'POWER'] as const
export type NasaSource = (typeof NASA_SOURCES)[number]

export interface NASAEvent {
  id: string
  source: NasaSource
  /** e.g. "FLR", "GST", "CME", "SEP", "wildfires", "severeStorms". */
  eventType: string
  timestamp: ISO8601
  endTimestamp?: ISO8601
  latitude?: number
  longitude?: number
  title: string
  link?: string
  /** Display-oriented magnitude, e.g. { label: "X1.2", value: 1.2e-4, scale: "GOES class" }. */
  severity?: { label: string; value?: number; scale?: string }
  metadata: Record<string, unknown>
}

/** One environmental time series from NASA POWER, e.g. daily 2 m air temperature. */
export interface EnvironmentSeries {
  parameter: string
  longName: string
  unit: string
  /** null = POWER fill value (-999): data not yet available or missing. */
  points: { date: LocalDate; value: number | null }[]
}

export interface ApodEntry {
  date: LocalDate
  title: string
  mediaType: string
  imageUrl?: string
  pageUrl: string
  /** Plain text (HTML stripped server-side). */
  explanation: string
  /** Plain text credit line; must be shown next to the image. */
  credit?: string
  altText?: string
}

/**
 * Space radiation environment from NOAA SWPC: GOES integral proton flux and the official NOAA
 * Solar Radiation Storm (S) scale. Describes the environment near Earth, not anyone's exposure.
 */
export interface RadiationStatus {
  /** NOAA S-scale as published by NOAA (0 = none … 5 = extreme); null when NOAA's feed lacks it. Never derived here. */
  sScale: number | null
  sText: string
  /** Latest ≥10 MeV integral proton flux in pfu (particles · cm⁻² · s⁻¹ · sr⁻¹); null if missing. */
  flux10MeV: number | null
  observedAt: ISO8601 | null
  satellite?: number
  /** 5-minute GOES samples; non-positive or missing flux is null (not plottable on a log axis). */
  series: { time: ISO8601; flux10MeV: number | null; flux100MeV: number | null }[]
  /** NOAA probability (%) of an S1-or-greater storm on each forecast day. */
  forecast: { date: LocalDate; s1Probability: number | null }[]
}

/** Wrapper the API uses for every upstream-derived payload. */
export interface Sourced<T> {
  data: T
  source: string
  fetchedAt: ISO8601
  /** True when served from cache after the upstream call failed. */
  stale: boolean
  notes?: string[]
}
