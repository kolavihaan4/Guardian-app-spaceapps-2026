import type {
  ApodResponse,
  RadiationResponse,
  BaselineDatasetResponse,
  DeviceTokenResponse,
  EarthEventsResponse,
  EnvironmentResponse,
  ImportResult,
  MeResponse,
  ProviderId,
  ProviderStatusDto,
  SpaceWeatherResponse,
  SyncResult,
  TriageEnvelope,
  TriageRequest,
  VitalsResponse,
} from '@astrovitals/shared'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Same-origin calls only; the session lives in an httpOnly cookie the page cannot read. */
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { accept: 'application/json', ...(init.body && typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}), ...init.headers },
  })
  const text = await res.text()
  const body = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    const e = (body ?? {}) as { error?: string; message?: string }
    throw new ApiError(res.status, e.error ?? 'error', e.message ?? `Request failed (${res.status})`)
  }
  return body as T
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })

export const api = {
  register: (email: string, password: string) => call<{ ok: true }>('/api/auth/register', json('POST', { email, password })),
  login: (email: string, password: string) => call<{ ok: true }>('/api/auth/login', json('POST', { email, password })),
  logout: () => call<{ ok: true }>('/api/auth/logout', json('POST')),
  me: () => call<MeResponse>('/api/me'),
  setDemoMode: (demoMode: boolean) => call<{ ok: true }>('/api/me/settings', json('PATCH', { demoMode })),
  deleteHealthData: () => call<{ ok: true }>('/api/me/data', json('DELETE')),
  deleteAccount: () => call<{ ok: true }>('/api/me', json('DELETE', { confirm: 'DELETE' })),

  vitals: (from: string, to: string) => call<VitalsResponse>(`/api/vitals?${new URLSearchParams({ from, to })}`),

  providers: () => call<ProviderStatusDto[]>('/api/providers'),
  connect: (id: ProviderId) => call<{ url: string }>(`/api/providers/${id}/connect`, json('POST')),
  sync: (id: ProviderId, days = 7) => call<SyncResult>(`/api/providers/${id}/sync`, json('POST', { days })),
  disconnect: (id: ProviderId) => call<{ ok: true }>(`/api/providers/${id}`, json('DELETE')),
  importAppleHealth: (file: File, days: number) =>
    call<ImportResult>(`/api/providers/apple-health-export/import?days=${days}`, { method: 'POST', body: file, headers: { 'content-type': 'application/xml' } }),
  deviceTokens: () => call<{ id: string; label: string; created_at: string; last_used_at: string | null }[]>('/api/providers/healthkit-companion/tokens'),
  createDeviceToken: (label: string) => call<DeviceTokenResponse>('/api/providers/healthkit-companion/tokens', json('POST', { label })),
  revokeDeviceToken: (id: string) => call<{ ok: true }>(`/api/providers/healthkit-companion/tokens/${id}`, json('DELETE')),

  spaceWeather: (from: string, to: string) => call<SpaceWeatherResponse>(`/api/nasa/space-weather?${new URLSearchParams({ from, to })}`),
  earthEvents: (days: number) => call<EarthEventsResponse>(`/api/nasa/earth-events?days=${days}&limit=60&status=all`),
  apod: () => call<ApodResponse>('/api/nasa/apod'),
  radiation: () => call<RadiationResponse>('/api/nasa/radiation'),
  osd575: () => call<BaselineDatasetResponse>('/api/datasets/osd-575'),
  environment: (lat: number, lon: number, from: string, to: string) =>
    call<EnvironmentResponse>(`/api/nasa/environment?${new URLSearchParams({ lat: String(lat), lon: String(lon), from, to })}`),

  aiTriage: (payload: TriageRequest) => call<TriageEnvelope>('/api/ai/triage', json('POST', payload)),
  aiBenchmark: () =>
    call<{
      evaluatedOn: string
      testSuite: string
      primarySelected: string
      models: {
        model: string
        params: string
        validJsonPct: number | null
        nonDiagnosisCompliancePct: number | null
        sensorArtifactDetectionPct: number | null
        toolRestrictionAdherencePct: number | null
        escalationAccuracyPct: number | null
        avgLatencySec: number | null
        verdict: string
      }[]
    }>('/api/ai/benchmark'),
}
