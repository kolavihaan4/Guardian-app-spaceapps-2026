import { readFileSync } from 'node:fs'
import { LSAH_ASTRONAUT_BP, classifyBloodGlucose, classifyBloodPressure, classifyBodyTemperature, classifyOxygenSaturation, classifyRespiratoryRate, classifyRestingHeartRate, classifySleepDuration, compareWithAstronautAverage } from '@astrovitals/shared'
import { describe, expect, it } from 'vitest'
import { applyRuleDecisions, attachComputedFacts, buildDeterministicFallback, computeVitalFacts, MODEL_BENCHMARK_RESULTS, TriageRequestSchema, TriageResponseSchema } from '../src/routes/ai.ts'

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
    expect(res.data_quality_check).toContain('2% to 4% higher or lower than the true level (MedlinePlus)')
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
    const facts = computeVitalFacts(req)
    expect(facts.blood_pressure).toContain('BP 148/92 mmHg: Stage 2 range')
    expect(facts.standing_check).toContain('systolic fell 28 and diastolic fell 8 mmHg')
    expect(facts.standing_drop_meets_criterion).toBe(true)

    const modelAnswer = { ...buildDeterministicFallback(req), baseline_comparison: 'Blood pressure shows a slight drop on standing.' }
    const fixed = attachComputedFacts(modelAnswer, facts)
    expect(fixed.baseline_comparison).toContain('Blood pressure shows a slight drop on standing. Computed onboard: HR 64 bpm')
    expect(fixed.baseline_comparison).toContain('BP 148/92 mmHg: Stage 2 range')
    expect(fixed.baseline_comparison).toContain('meets the orthostatic drop criterion')
    expect(fixed.baseline_comparison.endsWith('lying down.')).toBe(true)
    expect(facts.minimum_status).toBe('caution')
    expect(attachComputedFacts({ ...modelAnswer, overall_status: 'nominal' }, facts).overall_status).toBe('caution')
    expect(attachComputedFacts({ ...modelAnswer, overall_status: 'alert' }, facts).overall_status).toBe('alert')

    const alreadyCarriesThem = { ...modelAnswer, overall_status: 'caution' as const, baseline_comparison: `${facts.heart_rate} · ${facts.oxygen_saturation} · ${facts.blood_pressure} · ${facts.standing_check}` }
    expect(attachComputedFacts(alreadyCarriesThem, facts)).toBe(alreadyCarriesThem)

    const noBp = computeVitalFacts(
      TriageRequestSchema.parse({ crew_id: 'C1', vitals: { hr_bpm: 60, preflight_hr_median: 60, spo2_pct: 98 }, available_tools: ['Pulse Oximeter'] }),
    )
    expect(noBp).toEqual({
      heart_rate: 'HR 60 bpm (+0 bpm vs personal preflight median 60 bpm, which takes priority): within the range on the resting adult range 60–100 bpm (StatPearls Vital Sign Assessment; Cleveland Clinic), Earth reference',
      oxygen_saturation: 'SpO2 98%: within the 94–98% target range on the BTS 2017 oxygen guideline, Earth reference',
      standing_drop_meets_criterion: false,
      minimum_status: 'nominal',
    })
  })

  it('keeps the embedded LSAH astronaut averages identical to the NASA dataset CSV', () => {
    const csv = readFileSync(new URL('../../../information(DATASETS)/JMLSAHNEWSV722_152_Blood_Pressure_By_Age.csv', import.meta.url), 'utf8')
    const rows = csv.trim().split('\n').slice(1).map((line) => line.split(','))
    const groups = ['under 35', '35–39', '40–44', '45–49', '50–54', '55–59', '60 and over']
    for (const sex of ['male', 'female'] as const) {
      const cohort = sex === 'male' ? 'Male Astronauts' : 'Female Astronauts'
      const systolic = rows.find((r) => r[0] === 'systolic_bp_mmhg' && r[1] === cohort)!
      const diastolic = rows.find((r) => r[0] === 'diastolic_bp_mmhg' && r[1] === cohort)!
      const fromCsv = Object.fromEntries(
        groups.flatMap((group, i) => (systolic[3 + i] ? [[group, [Number(systolic[3 + i]), Number(diastolic[3 + i])]]] : [])),
      )
      expect(LSAH_ASTRONAUT_BP[sex]).toEqual(fromCsv)
    }
  })

  it('compares a reading with the astronaut average for the crew member, and says so only when the dataset has a group', () => {
    const male38 = compareWithAstronautAverage(132, 84, 38, 'Male')
    expect(male38?.summary).toContain('Astronaut average for men aged 35–39 is 115/74 mmHg')
    expect(male38?.summary).toContain('systolic 17 above and diastolic 10 above that average')
    expect(compareWithAstronautAverage(102, 65, 30, ' female ')?.summary).toContain('systolic level with and diastolic level with')
    expect(compareWithAstronautAverage(120, 80, 52, 'Female')).toBeUndefined()
    expect(compareWithAstronautAverage(120, 80, 40, 'Prefer not to say')).toBeUndefined()

    const triage = buildDeterministicFallback(
      TriageRequestSchema.parse({
        crew_id: 'C001',
        profile: { crew_id: 'C001', age: 38, height_cm: 178, weight_kg: 76, gender: 'Male', previous_conditions: 'None' },
        vitals: { hr_bpm: 60, preflight_hr_median: 60, spo2_pct: 98, bp_systolic: 132, bp_diastolic: 84, sensor_verified: true },
        available_tools: ['Blood Pressure Cuff'],
      }),
    )
    expect(triage.baseline_comparison).toContain('Stage 1 range')
    expect(triage.baseline_comparison).toContain('Astronaut average for men aged 35–39 is 115/74 mmHg')
    expect(triage.overall_status).toBe('nominal')
  })

  it('places heart rate against the resting range only when the reading is at rest', () => {
    expect(classifyRestingHeartRate(52, 50, true).band).toBe('below_range')
    expect(classifyRestingHeartRate(52, 50, true).summary).toContain('common in fit adults and in sleep')
    expect(classifyRestingHeartRate(60, 60, true).band).toBe('within_range')
    expect(classifyRestingHeartRate(100, 60, true).band).toBe('within_range')
    expect(classifyRestingHeartRate(101, 60, true).band).toBe('above_range')
    const eva = classifyRestingHeartRate(128, 60, false)
    expect(eva.band).toBeUndefined()
    expect(eva.summary).toContain('not compared')

    const onEva = buildDeterministicFallback(
      TriageRequestSchema.parse({ crew_id: 'C1', environment: 'eva_spacewalk', vitals: { hr_bpm: 128, preflight_hr_median: 60, spo2_pct: 97, sensor_verified: true }, available_tools: ['Pulse Oximeter'] }),
    )
    expect(onEva.baseline_comparison).toContain('applies only awake and at rest, not during exercise or EVA')
  })

  it('lets the rules decide status, escalation and tools when the model answers', () => {
    const req = TriageRequestSchema.parse({
      crew_id: 'C002',
      space_weather: { kp_index: 7, sep_event: 'S2' },
      vitals: { hr_bpm: 120, preflight_hr_median: 64, spo2_pct: 85, sensor_verified: false },
      available_tools: ['Pulse Oximeter', 'Hydration Pack'],
    })
    const rules = buildDeterministicFallback(req)
    const modelAnswer = {
      ...rules,
      overall_status: 'alert' as const,
      contact_ground_support: true,
      ground_support_reason: 'Storm plus low SpO2',
      available_tool_action_plan: ['Re-check SpO2 with the Pulse Oximeter', 'Take temperature with the Thermometer'],
      simple_instructions: ['Use the Blood Pressure Cuff'],
      workout_modification: 'Model wording',
    }
    const out = applyRuleDecisions(modelAnswer, rules, req.available_tools)
    expect(out.overall_status).toBe('caution')
    expect(out.contact_ground_support).toBe(false)
    expect(out.ground_support_reason).toBeNull()
    expect(out.available_tool_action_plan).toEqual(['Re-check SpO2 with the Pulse Oximeter'])
    expect(out.simple_instructions).toEqual(rules.simple_instructions)
    // Anything flagged: workout guidance comes from the rules, so it cannot contradict the status.
    expect(out.workout_modification).toBe(rules.workout_modification)
    // Nothing flagged: the model's wording is kept.
    const calm = buildDeterministicFallback(TriageRequestSchema.parse({ crew_id: 'C002', vitals: { hr_bpm: 64, preflight_hr_median: 64, spo2_pct: 98, sensor_verified: true }, available_tools: ['Pulse Oximeter'] }))
    expect(calm.overall_status).toBe('nominal')
    expect(applyRuleDecisions({ ...calm, workout_modification: 'Model wording' }, calm, ['Pulse Oximeter']).workout_modification).toBe('Model wording')
  })

  it('places a glucose reading against the fasting ranges and flags only what matters at any meal timing', () => {
    expect(classifyBloodGlucose(69)).toMatchObject({ band: 'low', flag: true })
    expect(classifyBloodGlucose(70)).toMatchObject({ band: 'fasting_normal', flag: false })
    expect(classifyBloodGlucose(99)).toMatchObject({ band: 'fasting_normal', flag: false })
    expect(classifyBloodGlucose(100)).toMatchObject({ band: 'above_fasting_normal', flag: false })
    expect(classifyBloodGlucose(125)).toMatchObject({ band: 'above_fasting_normal', flag: false })
    expect(classifyBloodGlucose(126)).toMatchObject({ band: 'fasting_line', flag: false })
    expect(classifyBloodGlucose(140)).toMatchObject({ band: 'fasting_line', flag: true })
    expect(classifyBloodGlucose(200)).toMatchObject({ band: 'random_line', flag: true })
    expect(classifyBloodGlucose(110).summary).toContain('only means something after 8 hours without food')
    expect(classifyBloodGlucose(110).summary).toContain('the ADA requires two abnormal results')
    expect(classifyBloodGlucose(110, 'Type 2 diabetes, diet controlled').summary).toContain('these screening ranges do not describe this person')
    expect(classifyBloodGlucose(150, 'On prednisone for 5 days').summary).toContain('glucocorticoid')
    expect(classifyBloodGlucose(90, 'Type 2 diabetes').summary).toContain('these screening ranges do not describe this person')
  })

  it('places SpO2 against the BTS target range, the lower range for listed conditions, and the personal baseline', () => {
    expect(classifyOxygenSaturation(94)).toMatchObject({ band: 'within_target', flag: false })
    expect(classifyOxygenSaturation(93)).toMatchObject({ band: 'below_target', flag: true })
    expect(classifyOxygenSaturation(88)).toMatchObject({ band: 'severe_line', flag: true })
    expect(classifyOxygenSaturation(84)).toMatchObject({ band: 'below_85', flag: true })
    // COPD: 88–92% is the suggested target, so 90 is not flagged, but 88 still is.
    expect(classifyOxygenSaturation(90, 'COPD')).toMatchObject({ band: 'within_lower_target', flag: false })
    expect(classifyOxygenSaturation(88, 'COPD').flag).toBe(true)
    expect(classifyOxygenSaturation(97, 'COPD').summary).toContain('88–92% target')
    // A fall of 3 points from the personal baseline flags even inside the range; 2 points does not.
    expect(classifyOxygenSaturation(95, '', 98)).toMatchObject({ band: 'within_target', flag: true })
    expect(classifyOxygenSaturation(96, '', 98).flag).toBe(false)
  })

  it('carries the computed SpO2 fact into the rule engine answer and raises caution on a baseline fall', () => {
    const base = { crew_id: 'C1', environment: 'iss_leo' as const, available_tools: ['Pulse Oximeter'] }
    const fallen = buildDeterministicFallback({ ...base, vitals: { hr_bpm: 62, preflight_hr_median: 60, spo2_pct: 95, preflight_spo2_median: 99, sensor_verified: true } } as never)
    expect(fallen.overall_status).toBe('caution')
    expect(fallen.baseline_comparison).toContain('4 points below')
    const steady = buildDeterministicFallback({ ...base, vitals: { hr_bpm: 62, preflight_hr_median: 60, spo2_pct: 94, sensor_verified: true } } as never)
    expect(steady.overall_status).toBe('nominal')
  })

  it('places temperature against the usual oral range, the fever line and the hypothermia line', () => {
    expect(classifyBodyTemperature(35)).toMatchObject({ band: 'hypothermia_line', flag: true })
    expect(classifyBodyTemperature(35.6)).toMatchObject({ band: 'below_range', flag: true })
    expect(classifyBodyTemperature(35.7)).toMatchObject({ band: 'usual_range', flag: false })
    expect(classifyBodyTemperature(37.3)).toMatchObject({ band: 'usual_range', flag: false })
    expect(classifyBodyTemperature(37.4)).toMatchObject({ band: 'above_range', flag: true })
    expect(classifyBodyTemperature(37.8)).toMatchObject({ band: 'fever_line', flag: true })
    expect(classifyBodyTemperature(40.1)).toMatchObject({ band: 'red_flag', flag: true })
    // The ISS adaptation note is context only: it appears in weightlessness and never clears the flag.
    expect(classifyBodyTemperature(37.6, 'iss_leo')).toMatchObject({ flag: true })
    expect(classifyBodyTemperature(37.6, 'iss_leo').summary).toContain('Stahn 2017')
    expect(classifyBodyTemperature(37.6, 'earth_preflight').summary).not.toContain('Stahn')
    expect(classifyBodyTemperature(37.9, 'earth_preflight', 'takes ibuprofen').summary).toContain('lowers fever')
    expect(classifyBodyTemperature(36.6, 'earth_preflight', 'Hypothyroidism').summary).toContain('hypothyroidism')
  })

  it('labels the severe blood pressure range and escalates the two combined low-oxygen patterns', () => {
    expect(classifyBloodPressure(180, 120).category).toBe('stage_2')
    expect(classifyBloodPressure(181, 80).category).toBe('severe')
    expect(classifyBloodPressure(150, 121).category).toBe('severe')
    const base = { crew_id: 'C1', environment: 'iss_leo' as const, available_tools: ['Pulse Oximeter'] }
    const run = (vitals: object) => buildDeterministicFallback({ ...base, vitals: { preflight_hr_median: 70, sensor_verified: true, ...vitals } } as never)
    // SpO2 89 with HR 102 alone does not escalate; adding fast breathing does.
    expect(run({ hr_bpm: 102, spo2_pct: 89 }).contact_ground_support).toBe(false)
    expect(run({ hr_bpm: 102, spo2_pct: 89, respiratory_rate: 24 }).contact_ground_support).toBe(true)
    expect(run({ hr_bpm: 72, spo2_pct: 89, respiratory_rate: 8 }).contact_ground_support).toBe(true)
    expect(run({ hr_bpm: 72, spo2_pct: 89, respiratory_rate: 8 }).ground_support_reason).toContain('slow breathing')
    // Unverified sensor contact never escalates on these patterns.
    expect(run({ hr_bpm: 102, spo2_pct: 89, respiratory_rate: 24, sensor_verified: false }).contact_ground_support).toBe(false)
  })

  it('escalates verified red-flag readings on their own, and flags a heart rate well below the personal median', () => {
    const base = { crew_id: 'C1', environment: 'iss_leo' as const, available_tools: ['Pulse Oximeter', 'Thermometer'] }
    const run = (vitals: Record<string, unknown>) =>
      buildDeterministicFallback(TriageRequestSchema.parse({ ...base, vitals: { hr_bpm: 64, preflight_hr_median: 60, spo2_pct: 98, sensor_verified: true, ...vitals } }))
    // Below 85% is where the BTS guideline starts high-flow oxygen.
    expect(run({ spo2_pct: 84 }).contact_ground_support).toBe(true)
    expect(run({ spo2_pct: 84 }).ground_support_reason).toContain('SpO2 84%')
    expect(run({ spo2_pct: 85 }).contact_ground_support).toBe(false)
    expect(run({ spo2_pct: 84, sensor_verified: false }).contact_ground_support).toBe(false)
    // 35 °C or below is the hypothermia line.
    expect(run({ temp_c: 35 }).contact_ground_support).toBe(true)
    expect(run({ temp_c: 34.9 }).ground_support_reason).toContain('hypothermia line')
    expect(run({ temp_c: 35.1 }).contact_ground_support).toBe(false)
    expect(run({ temp_c: 34.9, sensor_verified: false }).contact_ground_support).toBe(false)
    // 15 bpm or more below the personal median raises a caution and asks for a recheck; 14 does not.
    expect(run({ hr_bpm: 45 }).overall_status).toBe('caution')
    expect(run({ hr_bpm: 45 }).available_tool_action_plan[0]).toContain('Pulse Oximeter')
    expect(run({ hr_bpm: 45 }).contact_ground_support).toBe(false)
    expect(run({ hr_bpm: 46 }).overall_status).toBe('nominal')
  })

  it('describes the readings from the rules even when the model answers, and stays consistent at caution', () => {
    const req = TriageRequestSchema.parse({ crew_id: 'C1', environment: 'mars_surface', vitals: { hr_bpm: 62, preflight_hr_median: 60, spo2_pct: 86, sensor_verified: false }, available_tools: ['Pulse Oximeter'] })
    const rules = buildDeterministicFallback(req)
    const model = { ...rules, baseline_comparison: 'SpO2 is 86%, which is within the normal range.', data_quality_check: 'All good.' }
    const out = applyRuleDecisions(model, rules, req.available_tools)
    expect(out.baseline_comparison).not.toContain('within the normal range')
    expect(out.baseline_comparison).toContain('BP not measured')
    expect(out.baseline_comparison).toContain('SpO2 86%: 88% or below')
    expect(out.data_quality_check).toBe(rules.data_quality_check)

    const caution = buildDeterministicFallback(TriageRequestSchema.parse({ crew_id: 'C1', environment: 'mars_surface', vitals: { hr_bpm: 62, preflight_hr_median: 60, spo2_pct: 98, bp_systolic: 148, bp_diastolic: 92, sensor_verified: true }, available_tools: ['Blood Pressure Cuff'] }))
    expect(caution.overall_status).toBe('caution')
    expect(caution.workout_modification).toContain('HOLD FOR RECHECK')
    expect(caution.confirmation_prompt).not.toContain('routine')
    expect(caution.simple_instructions[0]).toContain('Sit quietly')
    expect(buildDeterministicFallback({ ...req, environment: 'iss_leo' }).simple_instructions[0]).toContain('Float or tether quietly')
  })

  it('adds mood context without discounting a raised reading', () => {
    const base = { crew_id: 'C1', environment: 'iss_leo' as const, available_tools: ['Blood Pressure Cuff'] }
    const vitals = { hr_bpm: 62, preflight_hr_median: 60, spo2_pct: 98, bp_systolic: 150, bp_diastolic: 95, sensor_verified: true }
    const stressed = buildDeterministicFallback({ ...base, vitals: { ...vitals, mood: 'stressed' } } as never)
    expect(stressed.overall_status).toBe('caution')
    expect(stressed.baseline_comparison).toContain('Stage 2 range')
    expect(stressed.baseline_comparison).toContain('does not explain a raised reading')
    const calm = buildDeterministicFallback({ ...base, vitals: { ...vitals, mood: 'optimal' } } as never)
    expect(calm.overall_status).toBe('caution')
    expect(calm.baseline_comparison).not.toContain('Mood reported')
  })

  it('places sleep against the 7-hour recommendation and adds study context only below 5.5 hours', () => {
    expect(classifySleepDuration(7).band).toBe('recommended')
    expect(classifySleepDuration(6.5)).toMatchObject({ band: 'short' })
    expect(classifySleepDuration(6.5).summary).not.toContain('Reichenberger')
    expect(classifySleepDuration(5).band).toBe('very_short')
    expect(classifySleepDuration(5).summary).toContain('Reichenberger 2023')
    expect(classifySleepDuration(5).summary).not.toContain('Schmid')
    expect(classifySleepDuration(5, true).summary).toContain('does not explain it')
  })

  it('does not loosen blood pressure or glucose flags after short sleep', () => {
    const base = { crew_id: 'C1', environment: 'iss_leo' as const, available_tools: ['Pulse Oximeter'] }
    const res = buildDeterministicFallback({ ...base, vitals: { hr_bpm: 62, preflight_hr_median: 60, spo2_pct: 98, bp_systolic: 142, bp_diastolic: 80, blood_sugar_mg_dl: 150, sleep_hours: 4, sensor_verified: true } } as never)
    expect(res.overall_status).toBe('caution')
    expect(res.baseline_comparison).toContain('Stage 2 range')
    expect(res.baseline_comparison).toContain('at or above the 126 fasting line')
    expect(res.baseline_comparison).toContain('Sleep 4 h: below the recommendation')
  })

  it('places respiratory rate against the 12–20 resting range and notes linked conditions', () => {
    expect(classifyRespiratoryRate(11, true).band).toBe('below_range')
    expect(classifyRespiratoryRate(12, true).band).toBe('within_range')
    expect(classifyRespiratoryRate(20, true).band).toBe('within_range')
    expect(classifyRespiratoryRate(21, true).band).toBe('above_range')
    expect(classifyRespiratoryRate(30, false).band).toBeUndefined()
    expect(classifyRespiratoryRate(19, true, 'COPD, ex-smoker').summary).toContain('mentions COPD')
    expect(classifyRespiratoryRate(19, true, 'Pre-diabetes').summary).toContain('mentions pre-diabetes')
    expect(classifyRespiratoryRate(19, true, 'Type 2 diabetes').summary).toContain('odds ratio 1.78')
    expect(classifyRespiratoryRate(19, true, 'None').summary).not.toContain('Recorded history')

    const triage = (vitals: Record<string, number>) =>
      buildDeterministicFallback(
        TriageRequestSchema.parse({ crew_id: 'C1', vitals: { hr_bpm: 60, preflight_hr_median: 60, spo2_pct: 98, sensor_verified: true, ...vitals }, available_tools: ['Pulse Oximeter'] }),
      )
    expect(triage({ respiratory_rate: 14, blood_sugar_mg_dl: 91 }).overall_status).toBe('nominal')
    expect(triage({ respiratory_rate: 24 }).overall_status).toBe('caution')
    expect(triage({ blood_sugar_mg_dl: 118 }).overall_status).toBe('nominal')
    expect(triage({ blood_sugar_mg_dl: 66 }).overall_status).toBe('caution')
    expect(triage({ blood_sugar_mg_dl: 150 }).baseline_comparison).toContain('at or above the 126 fasting line')
    expect(triage({ respiratory_rate: 24 }).baseline_comparison).toContain('above the range for a reading at rest')
  })

  it('exposes the measured benchmark table, with unmeasured columns left empty', () => {
    expect(MODEL_BENCHMARK_RESULTS.primarySelected).toContain('Qwen3-8B')
    expect(MODEL_BENCHMARK_RESULTS.models).toHaveLength(3)
    expect(MODEL_BENCHMARK_RESULTS.models[0]).toMatchObject({ escalationAccuracyPct: 76.3, nonDiagnosisCompliancePct: null })
  })
})

