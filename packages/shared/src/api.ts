/** Request/response contracts of the REST API (see docs/API.md). */
import type {
  ActivityData,
  ApodEntry,
  EnvironmentSeries,
  Metric,
  NASAEvent,
  ProviderId,
  RadiationStatus,
  SleepData,
  Sourced,
  Workout,
} from './models.ts'
import type { ProviderInfo } from './catalog.ts'
import type { BaselineComparison } from './baseline.ts'

export interface UserDto {
  id: string
  email: string
  demoMode: boolean
  createdAt: string
}

export interface ProviderStatusDto extends ProviderInfo {
  /** Whether this deployment can use the provider at all (credentials configured, approval granted...). */
  available: boolean
  availabilityNote: string
  connected: boolean
  connectedAt?: string
  lastSyncAt?: string
  scopes?: string[]
}

export interface MeResponse {
  user: UserDto
  providers: ProviderStatusDto[]
  retentionDays: number
}

export interface VitalsResponse {
  from: string
  to: string
  metrics: Metric[]
  sleep: SleepData[]
  activity: ActivityData[]
  workouts: Workout[]
  /** Per-source counts so the UI can label exactly what it is showing. */
  sources: { provider: ProviderId; simulated: boolean; metrics: number; sleep: number; activity: number; workouts: number }[]
}

export type SpaceWeatherResponse = Sourced<NASAEvent[]>
export type EarthEventsResponse = Sourced<NASAEvent[]>
export type ApodResponse = Sourced<ApodEntry>
export type RadiationResponse = Sourced<RadiationStatus>
export type EnvironmentResponse = Sourced<{ latitude: number; longitude: number; series: EnvironmentSeries[] }>

export interface SyncResult {
  provider: ProviderId
  metrics: number
  sleep: number
  activity: number
  workouts: number
  notes: string[]
}

export interface ImportResult extends SyncResult {
  skippedRecords: number
  unsupportedTypes: string[]
}

export interface DeviceTokenResponse {
  /** Shown exactly once. Only an HMAC of it is stored. */
  token: string
  id: string
  label: string
}

export interface ApiError {
  error: string
  message: string
  details?: unknown
}

/** GET /api/datasets/osd-575 — Inspiration4 lab panel compared with each crew member's own baseline. */
export interface BaselineDatasetResponse {
  dataset: { id: string; title: string; doi: string; license: string; url: string; mission: string; missionDays: number }
  crew: string[]
  timepoints: { label: string; day: number; phase: 'pre' | 'post' }[]
  analytes: {
    id: string
    name: string
    unit: string
    byCrew: Record<string, BaselineComparison>
  }[]
  /** The measurements the overview starts with, in display order. */
  featured: string[]
  /** Measurements present in the file but not shown, with the reason. */
  excluded: { id: string; reason: string }[]
  caveats: string[]
}

/** The four heart frames the ejection-fraction model needs: two- and four-chamber views, each at end-diastole (full) and end-systole (emptied). */
export const HEART_FRAMES = ['2CH_ED', '2CH_ES', '4CH_ED', '4CH_ES'] as const
export type HeartFrame = (typeof HEART_FRAMES)[number]

/** Whether a scan can be trusted as measured, and if not, why. A data-quality check, not a health finding. */
export interface ScanQuality {
  accept: boolean
  reasons: string[]
}

export interface ScanLegendEntry {
  label: string
  colour: string
}

/** GET /api/ultrasound/status */
export interface UltrasoundStatus {
  available: boolean
}

/** POST /api/ultrasound/jugular: one cross-section neck frame. Sizes are null when the vein was not found. */
export interface JugularScanResult {
  measurements: {
    veinFound: boolean
    areaMm2: number | null
    longAxisMm: number | null
    shortAxisMm: number | null
    /** Short axis divided by long axis; a low value suggests the probe is pressing the vein flat. */
    flattening: number | null
    veinToArtery: number | null
    arteryAreaMm2: number | null
  }
  quality: ScanQuality
  summary: string
  /** A see-through PNG (base64) the size of the uploaded image, to draw over it. */
  overlayPng: string
  legend: ScanLegendEntry[]
}

/** POST /api/ultrasound/heart: four frames. Numbers are null when the left ventricle could not be measured. */
export interface HeartScanResult {
  /** Percent of the left ventricle's blood pumped out per beat, from the fitted model. */
  ejectionFraction: number | null
  /** The same, from the disk-summation geometry alone. */
  geometryEjectionFraction: number | null
  endDiastolicVolumeMl: number | null
  endSystolicVolumeMl: number | null
  quality: ScanQuality
  overlays: Record<HeartFrame, string>
  legend: ScanLegendEntry[]
}
