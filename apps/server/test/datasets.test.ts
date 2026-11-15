import request from 'supertest'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { BaselineDatasetResponse } from '@astrovitals/shared'
import { buildOsd575, OSD575_CSV, parseCsv, parseSampleName } from '../src/datasets/osd575.ts'
import { makeTestContext, ORIGIN } from './helpers.ts'

async function signedIn(app: ReturnType<typeof makeTestContext>['app']) {
  const agent = request.agent(app)
  await agent.post('/api/auth/register').set('Origin', ORIGIN).send({ email: 'labs@example.com', password: 'correct-horse-battery' }).expect(201)
  return agent
}

const real = () => buildOsd575(readFileSync(OSD575_CSV, 'utf8'))

describe('OSD-575 Inspiration4 metabolic panel (vendored NASA file)', () => {
  it('reads 4 crew × 7 draws with three pre-launch baseline points each', () => {
    const d = real()
    expect(d.crew).toEqual(['C001', 'C002', 'C003', 'C004'])
    expect(d.timepoints.map((t) => t.label)).toEqual(['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194'])
    expect(d.dataset).toMatchObject({ doi: '10.26030/mc5d-p710', license: 'CC0-1.0', missionDays: 3 })
  })

  it('shows 17 measurements and explains the two race-based eGFR columns it leaves out', () => {
    const d = real()
    expect(d.analytes).toHaveLength(17)
    expect(d.analytes.some((a) => a.id.startsWith('egfr'))).toBe(false)
    expect(d.excluded.map((e) => e.id)).toEqual(['egfr_african_american', 'egfr_non_african_american'])
    expect(d.analytes.find((a) => a.id === 'sodium')).toMatchObject({ name: 'Sodium', unit: 'mmol/L' })
    expect(d.analytes.find((a) => a.id === 'albumin_to_globulin_ratio')?.unit).toBe('ratio')
  })

  it('matches the file for C001 sodium and keeps each draw’s own reference range', () => {
    const sodium = real().analytes.find((a) => a.id === 'sodium')!.byCrew.C001!
    expect(sodium.baseline.readings.map((r) => r.timepoint)).toEqual(['L-92', 'L-44', 'L-3'])
    expect(sodium.baseline.n).toBe(3)
    expect(sodium.followUp.map((f) => f.timepoint)).toEqual(['R+1', 'R+45', 'R+82', 'R+194'])
    expect(sodium.followUp.every((f) => f.refMin === 135 && f.refMax === 146)).toBe(true)
    // L-3 value from the file's first row (C001_serum_L-3, sodium 142).
    expect(sodium.baseline.readings.find((r) => r.timepoint === 'L-3')?.value).toBe(142)
  })

  it('turns NA / N/A / blank into missing values and raises the matching notices', () => {
    // C001 BUN/creatinine in the file: L-3 = 15, R+194 = 22, every other draw "NA".
    const bunCr = real().analytes.find((a) => a.id === 'bun_to_creatinine_ratio')!.byCrew.C001!
    expect(bunCr.baseline.readings.map((r) => r.value)).toEqual([null, null, 15])
    expect(bunCr.baseline).toMatchObject({ n: 1, median: 15 })
    expect(bunCr.followUp.find((f) => f.timepoint === 'R+1')).toMatchObject({ value: null, change: null, sourceRange: 'no_reading' })
    expect(bunCr.followUp.find((f) => f.timepoint === 'R+194')).toMatchObject({ value: 22, change: 7 })
    expect(bunCr.notices.map((n) => n.kind)).toEqual(['limited_baseline', 'missing_reading'])
  })

  it('features sodium, potassium, glucose, creatinine and albumin, and flags ranges that change between draws', () => {
    const d = real()
    expect(d.featured).toEqual(['sodium', 'potassium', 'glucose', 'creatinine', 'albumin'])
    const calciumNotices = d.crew.flatMap((c) => d.analytes.find((a) => a.id === 'calcium')!.byCrew[c]!.notices.map((n) => n.kind))
    expect(calciumNotices).toContain('range_changed') // the file has 8.6–10.2, 8.6–10.3 and 8.6–10.4
  })

  it('parses sample names and quoted CSV fields', () => {
    expect(parseSampleName('C003_serum_R+194')).toEqual({ crew: 'C003', timepoint: 'R+194', day: 194 })
    expect(parseSampleName('C003_plasma_R+1')).toBeNull()
    expect(parseCsv('﻿a,"b,c","d ""e"""\r\n1,2,3\n')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']])
  })

  it('is served at /api/datasets/osd-575 to signed-in users only', async () => {
    const { app } = makeTestContext()
    await request(app).get('/api/datasets/osd-575').expect(401)
    const agent = await signedIn(app)
    const body = (await agent.get('/api/datasets/osd-575').expect(200)).body as BaselineDatasetResponse
    expect(body.analytes).toHaveLength(17)
    expect(body.caveats.join(' ')).toMatch(/median/)
    expect(body.caveats.join(' ')).toMatch(/not a statistical test, a diagnosis/)
  })
})
