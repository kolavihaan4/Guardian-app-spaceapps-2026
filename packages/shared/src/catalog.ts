import type { MetricType, ProviderId } from './models.ts'

export interface MetricInfo {
  label: string
  shortLabel: string
  /** Canonical unit every provider is normalized to. */
  unit: string
  /** Number of decimals to show. */
  decimals: number
  /**
   * Data-quality bounds, NOT clinical reference ranges.
   * - outside `hard`: physically impossible for the sensor/format -> 'implausible'
   * - outside `typical`: unusual for consumer wearables -> 'out_of_range'
   * `typicalDailyOnly` restricts the typical check to daily aggregates (e.g. steps/day).
   */
  hard: [number, number]
  typical: [number, number]
  typicalDailyOnly?: boolean
  description: string
}

export const METRIC_INFO: Record<MetricType, MetricInfo> = {
  heart_rate: {
    label: 'Heart rate',
    shortLabel: 'HR',
    unit: 'bpm',
    decimals: 0,
    hard: [1, 300],
    typical: [30, 220],
    description: 'Instantaneous heart rate samples from the wearable.',
  },
  resting_heart_rate: {
    label: 'Resting heart rate',
    shortLabel: 'RHR',
    unit: 'bpm',
    decimals: 0,
    hard: [1, 250],
    typical: [30, 120],
    description: 'Daily resting heart rate computed by the wearable platform.',
  },
  hrv_rmssd: {
    label: 'Heart-rate variability (RMSSD)',
    shortLabel: 'HRV',
    unit: 'ms',
    decimals: 0,
    hard: [0, 1000],
    typical: [5, 250],
    description: 'RMSSD of beat-to-beat intervals (Fitbit / Google Health / Health Connect).',
  },
  hrv_sdnn: {
    label: 'Heart-rate variability (SDNN)',
    shortLabel: 'HRV-SDNN',
    unit: 'ms',
    decimals: 0,
    hard: [0, 1000],
    typical: [5, 300],
    description: 'SDNN of beat-to-beat intervals (Apple HealthKit). Not comparable with RMSSD.',
  },
  spo2: {
    label: 'Blood oxygen (SpO₂)',
    shortLabel: 'SpO₂',
    unit: '%',
    decimals: 1,
    hard: [0, 100],
    typical: [80, 100],
    description: 'Peripheral oxygen saturation estimated optically by the wearable.',
  },
  respiratory_rate: {
    label: 'Respiratory rate',
    shortLabel: 'RR',
    unit: 'br/min',
    decimals: 1,
    hard: [1, 100],
    typical: [6, 40],
    description: 'Breaths per minute, usually computed during sleep.',
  },
  skin_temperature: {
    label: 'Skin temperature',
    shortLabel: 'Skin T',
    unit: '°C',
    decimals: 2,
    hard: [0, 50],
    typical: [25, 40],
    description: 'Wrist/skin temperature during sleep (absolute).',
  },
  skin_temperature_deviation: {
    label: 'Skin temperature vs baseline',
    shortLabel: 'ΔSkin T',
    unit: '°C',
    decimals: 2,
    hard: [-10, 10],
    typical: [-3, 3],
    description: 'Nightly skin temperature relative to the personal baseline.',
  },
  steps: {
    label: 'Steps',
    shortLabel: 'Steps',
    unit: 'steps',
    decimals: 0,
    hard: [0, 1_000_000],
    typical: [0, 100_000],
    typicalDailyOnly: true,
    description: 'Step count (per interval or per day).',
  },
  active_energy: {
    label: 'Active energy',
    shortLabel: 'Active kcal',
    unit: 'kcal',
    decimals: 0,
    hard: [0, 1_000_000],
    typical: [0, 8_000],
    typicalDailyOnly: true,
    description: 'Energy burned through activity, excluding basal metabolism.',
  },
}

export interface ProviderInfo {
  id: ProviderId
  name: string
  kind: 'oauth' | 'companion-push' | 'file-import' | 'simulated' | 'approval-required'
  /** One-line, honest description of how data reaches this app. */
  path: string
}

export const PROVIDER_INFO: Record<ProviderId, ProviderInfo> = {
  demo: {
    id: 'demo',
    name: 'Demo (simulated)',
    kind: 'simulated',
    path: 'Synthetic data generated on the server for development. Never stored, always labelled SIMULATED.',
  },
  'google-health': {
    id: 'google-health',
    name: 'Google Health API (Fitbit, Pixel Watch)',
    kind: 'oauth',
    path: 'Watch → Fitbit/Pixel app → Google Health cloud → OAuth 2.0 (server-side) → this backend.',
  },
  'apple-health-export': {
    id: 'apple-health-export',
    name: 'Apple Health export (Apple Watch)',
    kind: 'file-import',
    path: 'Apple Watch → HealthKit on iPhone → Health app "Export All Health Data" → upload export.xml → this backend.',
  },
  'healthkit-companion': {
    id: 'healthkit-companion',
    name: 'HealthKit companion app (Apple Watch)',
    kind: 'companion-push',
    path: 'Apple Watch → HealthKit on iPhone → companion iOS app (user permission) → HTTPS POST with device token → this backend.',
  },
  garmin: {
    id: 'garmin',
    name: 'Garmin Health API',
    kind: 'approval-required',
    path: 'Watch → Garmin Connect → Garmin Health API push (approved partners only) → this backend. Not enabled.',
  },
}
