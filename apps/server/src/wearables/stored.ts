import type { ActivityData, Metric, MetricType, ProviderId, SleepData, Workout } from '@astrovitals/shared'
import { deriveActivity, type Repo } from '../repo.ts'
import type { Availability, WearableProvider } from './types.ts'

/**
 * Read side for providers whose data arrives asynchronously (OAuth sync, companion-app push,
 * file import) and is kept in our database. Reads never call the upstream platform.
 */
export abstract class StoredDataProvider implements WearableProvider {
  abstract readonly id: ProviderId
  abstract availability(): Availability

  constructor(protected readonly repo: Repo) {}

  async getMetrics(userId: string, start: Date, end: Date, types?: MetricType[]): Promise<Metric[]> {
    return this.repo.metrics(userId, start.toISOString(), end.toISOString(), types).filter((m) => m.source === this.id)
  }

  getHeartRate(userId: string, start: Date, end: Date): Promise<Metric[]> {
    return this.getMetrics(userId, start, end, ['heart_rate'])
  }

  async getSleep(userId: string, start: Date, end: Date): Promise<SleepData[]> {
    return this.repo.sleep(userId, start.toISOString(), end.toISOString()).filter((s) => s.source === this.id)
  }

  async getActivity(userId: string, start: Date, end: Date): Promise<ActivityData[]> {
    return deriveActivity(await this.getMetrics(userId, start, end, ['steps', 'active_energy']))
  }

  async getWorkouts(userId: string, start: Date, end: Date): Promise<Workout[]> {
    return this.repo.workouts(userId, start.toISOString(), end.toISOString()).filter((w) => w.source === this.id)
  }
}
