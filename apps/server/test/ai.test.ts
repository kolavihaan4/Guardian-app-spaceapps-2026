import { classifyBloodPressure } from '@astrovitals/shared'
import { describe, expect, it } from 'vitest'
import { attachComputedFacts, buildDeterministicFallback, computeBloodPressureFacts, MODEL_BENCHMARK_RESULTS, TriageRequestSchema, TriageResponseSchema } from '../src/routes/ai.ts'

describe('Overarching AI triage engine & Qwen3-8B schema', () => {
  it('flags unverified SpO2 drops during EVA as sensor artifact rather than escalating', () => {
    const req = TriageRequestSchema.parse({
      crew_id: 'C001',
      environment: 'eva_spacewalk',
      vitals: {
        hr_bpm: 112,
        preflight_hr_median: 60,
        spo2_pct: 86,
        temp_c: 36.9,
        preflight_temp_median: 36.7,
        sensor_verified: false,
      },
      available_tools: ['Pulse Oximeter', 'Hydration & Electrolyte Pack'],
    })
    const res = buildDeterministicFallback(req)
    expect(() => TriageResponseSchema.parse(res)).not.toThrow()
    expect(res.overall_status).toBe('caution')
    expect(res.contact_ground_support).toBe(false)
    expect(res.data_quality_check).toContain('±2–4% measurement error')
    expect(res.available_tool_action_plan.some((s) => s.includes('Pulse Oximeter'))).toBe(true)
  })

  it('escalates to Ground Support on verified multi-vital deviation + S2 radiation event', () => {
    const req = TriageRequestSchema.parse({
      crew_id: 'C004',
      environment: 'deep_space_transit',
      vitals: {
        hr_bpm: 118,
        preflight_hr_median: 62,
        spo2_pct: 90,
        temp_c: 38.4,
        preflight_temp_median: 36.8,
        ultrasound_finding: 'renal_debris_suspected',
        eye_exam_finding: 'amsler_grid_distortion',
        sensor_verified: true,
      },
      pain_points: [{ region: 'abdomen_nutrition', severity: 8 }],
      space_weather: { kp_index: 7, solar_flare: 'X2.1', sep_event: 'S2' },
      available_tools: ['Pulse Oximeter', 'Portable Ultrasound', 'Hydration & Electrolyte Pack'],
    })
    const res = buildDeterministicFallback(req)
    expect(() => TriageResponseSchema.parse(res)).not.toThrow()
    expect(res.overall_status).toBe('alert')
    expect(res.contact_ground_support).toBe(true)
    expect(res.ground_support_reason).toContain('Temp 38.4°C')
    expect(res.workout_modification).toContain('PAUSE WORKOUT')
  })

  it('does not escalate on a solar particle event alone, and reports radiation as separate context', () => {
    const base = {
      crew_id: 'C002',
      environment: 'deep_space_transit',
      space_weather: { kp_index: 7, solar_flare: 'X1.2', sep_event: 'S2' },
      available_tools: ['Pulse Oximeter', 'Hydration Pack'],
    }
    const unverifiedSpike = buildDeterministicFallback(
      TriageRequestSchema.parse({ ...base, vitals: { hr_bpm: 120, preflight_hr_median: 64, spo2_pct: 85, sensor_verified: false } }),
    )
    const verifiedMildDrift = buildDeterministicFallback(
      TriageRequestSchema.parse({ ...base, vitals: { hr_bpm: 86, preflight_hr_median: 64, spo2_pct: 94, temp_c: 37.3, preflight_temp_median: 36.8, sensor_verified: true } }),
    )
    for (const res of [unverifiedSpike, verifiedMildDrift]) {
      expect(res.contact_ground_support).toBe(false)
      expect(res.overall_status).toBe('caution')
      expect(res.environment_insight).toContain('Active S2 solar particle event')
      expect(res.environment_insight).toContain('not inferred from these vital signs')
    }
  })

  it('reports vitals that were not sent as not measured instead of inventing normal values', () => {
    const res = buildDeterministicFallback(
      TriageRequestSchema.parse({
        crew_id: 'C003',
        environment: 'mars_surface',
        vitals: { hr_bpm: 60, preflight_hr_median: 58, spo2_pct: 98, sensor_verified: true },
        available_tools: ['Pulse Oximeter'],
      }),
    )
    expect(res.overall_status).toBe('nominal')
    for (const text of ['Temp not measured', 'BP not measured', 'Glucose not measured', 'RR not measured', 'Sleep not reported']) {
      expect(res.baseline_comparison).toContain(text)
    }
    expect(res.baseline_comparison).not.toContain('118/76')
    expect(res.baseline_comparison).toContain('No human has been to Mars')
  })

  it('labels a blood pressure reading with its 2025 AHA/ACC category and flags from stage 2', () => {
    expect(classifyBloodPressure(118, 76).category).toBe('normal')
    expect(classifyBloodPressure(124, 78).category).toBe('elevated')
    expect(classifyBloodPressure(124, 82).category).toBe('stage_1')
    expect(classifyBloodPressure(139, 79).category).toBe('stage_1')
    expect(classifyBloodPressure(140, 70).category).toBe('stage_2')
    expect(classifyBloodPressure(118, 90).category).toBe('stage_2')

    const triage = (bp_systolic: number, bp_diastolic: number) =>
      buildDeterministicFallback(
        TriageRequestSchema.parse({
          crew_id: 'C001',
          vitals: { hr_bpm: 60, preflight_hr_median: 60, spo2_pct: 98, bp_systolic, bp_diastolic, sensor_verified: true },
          available_tools: ['Blood Pressure Cuff'],
        }),
      )
    const stage1 = triage(132, 84)
    expect(stage1.overall_status).toBe('nominal')
    expect(stage1.baseline_comparison).toContain('BP 132/84 mmHg: Stage 1 range')
    const stage2 = triage(142, 84)
    expect(stage2.overall_status).toBe('caution')
    expect(stage2.contact_ground_support).toBe(false)
    expect(stage2.baseline_comparison).toContain('Stage 2 range')
    expect(stage2.baseline_comparison).toContain('one reading does not set a category')
  })

  it('assesses a standing blood pressure fall against the AHA criterion, only where there is gravity', () => {
    const triage = (environment: string, standing: Record<string, number>) =>
      buildDeterministicFallback(
        TriageRequestSchema.parse({
          crew_id: 'C002',
          environment,
          vitals: { hr_bpm: 64, preflight_hr_median: 64, spo2_pct: 98, bp_systolic: 118, bp_diastolic: 76, sensor_verified: true, ...standing },
          available_tools: ['Blood Pressure Cuff', 'Hydration Pack'],
        }),
      )

    const drop = triage('mars_surface', { standing_bp_systolic: 96, standing_bp_diastolic: 70, standing_hr_bpm: 82 })
    expect(drop.overall_status).toBe('caution')
    expect(drop.contact_ground_support).toBe(false)
    expect(drop.baseline_comparison).toContain('systolic fell 22 and diastolic fell 6 mmHg')
    expect(drop.baseline_comparison).toContain('meets the orthostatic drop criterion')
    expect(drop.baseline_comparison).toContain('ratio 0.82')
    expect(drop.available_tool_action_plan.some((step) => step.includes('repeat the resting and standing readings with Blood Pressure Cuff'))).toBe(true)

    const small = triage('mars_surface', { standing_bp_systolic: 108, standing_bp_diastolic: 72 })
    expect(small.overall_status).toBe('nominal')
    expect(small.baseline_comparison).toContain('below the orthostatic drop criterion')

    const diastolicOnly = triage('lunar_base', { standing_bp_systolic: 112, standing_bp_diastolic: 66 })
    expect(diastolicOnly.overall_status).toBe('caution')

    const zeroG = triage('iss_leo', { standing_bp_systolic: 96, standing_bp_diastolic: 70 })
    expect(zeroG.overall_status).toBe('nominal')
    expect(zeroG.baseline_comparison).toContain('a standing test needs gravity')
  })

  it('computes blood pressure facts in code and re-attaches any the model leaves out', () => {
    const req = TriageRequestSchema.parse({
      crew_id: 'C002',
      environment: 'mars_surface',
      vitals: { hr_bpm: 64, preflight_hr_median: 64, spo2_pct: 98, bp_systolic: 148, bp_diastolic: 92, standing_bp_systolic: 120, standing_bp_diastolic: 84, sensor_verified: true },
      available_tools: ['Blood Pressure Cuff'],
    })
    const facts = computeBloodPressureFacts(req)
    expect(facts.blood_pressure).toContain('BP 148/92 mmHg: Stage 2 range')
    expect(facts.standing_check).toContain('systolic fell 28 and diastolic fell 8 mmHg')
    expect(facts.standing_drop_meets_criterion).toBe(true)

    const modelAnswer = { ...buildDeterministicFallback(req), baseline_comparison: 'Blood pressure shows a slight drop on standing.' }
    const fixed = attachComputedFacts(modelAnswer, facts)
    expect(fixed.baseline_comparison).toContain('Blood pressure shows a slight drop on standing. Computed onboard: BP 148/92 mmHg: Stage 2 range')
    expect(fixed.baseline_comparison).toContain('meets the orthostatic drop criterion')
    expect(fixed.baseline_comparison.endsWith('lying down.')).toBe(true)
    expect(facts.minimum_status).toBe('caution')
    expect(attachComputedFacts({ ...modelAnswer, overall_status: 'nominal' }, facts).overall_status).toBe('caution')
    expect(attachComputedFacts({ ...modelAnswer, overall_status: 'alert' }, facts).overall_status).toBe('alert')

    const alreadyCarriesThem = { ...modelAnswer, overall_status: 'caution' as const, baseline_comparison: `${facts.blood_pressure} · ${facts.standing_check}` }
    expect(attachComputedFacts(alreadyCarriesThem, facts)).toBe(alreadyCarriesThem)

    const noBp = computeBloodPressureFacts(
      TriageRequestSchema.parse({ crew_id: 'C1', vitals: { hr_bpm: 60, preflight_hr_median: 60, spo2_pct: 98 }, available_tools: ['Pulse Oximeter'] }),
    )
    expect(noBp).toEqual({ standing_drop_meets_criterion: false, minimum_status: 'nominal' })
  })

  it('exposes the Qwen3-8B vs Qwen3-4B vs Gemma 3 4B benchmark table', () => {
    expect(MODEL_BENCHMARK_RESULTS.primarySelected).toContain('Qwen3-8B')
    expect(MODEL_BENCHMARK_RESULTS.models).toHaveLength(3)
  })
})

