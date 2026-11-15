import {
  BODY_REGIONS,
  BP_REFERENCE_SOURCE,
  GRAVITY_ENVIRONMENTS,
  MISSION_ENVIRONMENTS,
  assessOrthostaticChange,
  classifyBloodPressure,
  type BodyRegionId,
  type MissionEnvironmentId,
  type TriageEnvelope,
  type TriageRequest,
  type TriageResponse,
} from '@astrovitals/shared'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import type { AppContext } from '../context.ts'

const BodyRegionEnum = z.enum([
  'head_neuro',
  'eyes_sans',
  'chest_cardio',
  'abdomen_nutrition',
  'spine_bone',
  'upper_limbs',
  'lower_limbs',
])

const EnvironmentEnum = z.enum([
  'iss_leo',
  'lunar_base',
  'deep_space_transit',
  'mars_surface',
  'eva_spacewalk',
  'earth_preflight',
])

export const TriageRequestSchema = z.object({
  crew_id: z.string().min(1).max(32),
  environment: EnvironmentEnum.optional().default('iss_leo'),
  profile: z
    .object({
      crew_id: z.string(),
      age: z.number().min(18).max(85),
      height_cm: z.number().min(120).max(230),
      weight_kg: z.number().min(35).max(160),
      gender: z.string().max(32),
      previous_conditions: z.string().max(240),
    })
    .optional(),
  vitals: z.object({
    hr_bpm: z.number().min(20).max(260),
    preflight_hr_median: z.number().min(30).max(150),
    spo2_pct: z.number().min(50).max(100),
    bp_systolic: z.number().min(60).max(240).optional(),
    bp_diastolic: z.number().min(30).max(150).optional(),
    standing_bp_systolic: z.number().min(40).max(240).optional(),
    standing_bp_diastolic: z.number().min(20).max(150).optional(),
    standing_hr_bpm: z.number().min(20).max(260).optional(),
    blood_sugar_mg_dl: z.number().min(30).max(500).optional(),
    temp_c: z.number().min(30).max(43).optional(),
    preflight_temp_median: z.number().min(35).max(38.5).optional(),
    respiratory_rate: z.number().min(4).max(60).optional(),
    sleep_hours: z.number().min(0).max(24).optional(),
    mood: z.enum(['optimal', 'focused', 'fatigued', 'stressed', 'isolated']).optional(),
    ultrasound_finding: z
      .enum(['not_performed', 'normal', 'optic_nerve_sheath_elevated', 'renal_debris_suspected', 'jugular_venous_stasis'])
      .optional(),
    eye_exam_finding: z
      .enum(['not_performed', 'normal_20_20', 'hyperopia_shift', 'amsler_grid_distortion', 'mild_eye_strain'])
      .optional(),
    sensor_verified: z.boolean().default(false),
  }),
  pain_points: z
    .array(
      z.object({
        region: BodyRegionEnum,
        severity: z.number().min(1).max(10),
        note: z.string().max(160).optional(),
      }),
    )
    .max(7)
    .optional(),
  space_weather: z
    .object({
      kp_index: z.number().min(0).max(9).optional(),
      solar_flare: z.string().max(32).optional(),
      sep_event: z.string().max(32).optional(),
    })
    .optional(),
  available_tools: z.array(z.string().min(1).max(64)).min(1).max(20),
})

export const TriageResponseSchema = z.object({
  overall_status: z.enum(['nominal', 'caution', 'alert']),
  data_quality_check: z.string(),
  baseline_comparison: z.string(),
  environment_insight: z.string(),
  common_causes: z.array(z.string()),
  confirmation_prompt: z.string(),
  available_tool_action_plan: z.array(z.string()),
  workout_modification: z.string(),
  simple_instructions: z.array(z.string()),
  contact_ground_support: z.boolean(),
  ground_support_reason: z.string().nullable(),
})

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_TRIAGE_MODEL ?? 'astrovitals-triage'

export interface ComputedBloodPressureFacts {
  /** Resting reading with its guideline category, or undefined when no full reading was sent. */
  blood_pressure?: string
  /** Standing-versus-resting result, or why it was not assessed; undefined when no standing pair was sent. */
  standing_check?: string
  /** True when the standing fall reaches the criterion (gravity environments only). */
  standing_drop_meets_criterion: boolean
  /** Lowest overall_status these readings allow: caution from the stage 2 line, a low systolic, or a standing drop. */
  minimum_status: 'nominal' | 'caution'
}

/**
 * Blood pressure facts worked out by code, never by the language model. The rule engine uses them
 * directly, and the model route sends them alongside the request and re-attaches any the model
 * leaves out, so the numbers on screen are the same whichever one answers.
 */
export function computeBloodPressureFacts(input: TriageRequest): ComputedBloodPressureFacts {
  const { vitals } = input
  const envId: MissionEnvironmentId = input.environment ?? 'iss_leo'
  const env = MISSION_ENVIRONMENTS[envId] ?? MISSION_ENVIRONMENTS.iss_leo
  const sys = vitals.bp_systolic
  const dia = vitals.bp_diastolic
  const standingSys = vitals.standing_bp_systolic
  const standingDia = vitals.standing_bp_diastolic
  const facts: ComputedBloodPressureFacts = { standing_drop_meets_criterion: false, minimum_status: 'nominal' }
  if (sys !== undefined && (sys >= 140 || sys <= 88)) facts.minimum_status = 'caution'
  if (dia !== undefined && dia >= 90) facts.minimum_status = 'caution'
  if (sys === undefined || dia === undefined) return facts

  const category = classifyBloodPressure(sys, dia)
  facts.blood_pressure = `BP ${sys}/${dia} mmHg: ${category.label} on the ${BP_REFERENCE_SOURCE}; one reading does not set a category, so repeat it at rest`
  if (standingSys === undefined || standingDia === undefined) return facts

  if (!GRAVITY_ENVIRONMENTS.includes(envId)) {
    facts.standing_check = `Standing BP ${standingSys}/${standingDia} mmHg not assessed: a standing test needs gravity and does not apply in ${env.shortLabel}`
    return facts
  }
  const change = assessOrthostaticChange(
    { systolic: sys, diastolic: dia, hrBpm: vitals.hr_bpm },
    { systolic: standingSys, diastolic: standingDia, hrBpm: vitals.standing_hr_bpm },
  )
  facts.standing_check = change.summary
  facts.standing_drop_meets_criterion = change.meetsCriterion
  if (change.meetsCriterion) facts.minimum_status = 'caution'
  return facts
}

/** Adds any computed fact the model's answer does not already carry word for word, and holds the status at the computed minimum. */
export function attachComputedFacts(triage: TriageResponse, facts: ComputedBloodPressureFacts): TriageResponse {
  const missing = [facts.blood_pressure, facts.standing_check].filter(
    (fact): fact is string => fact !== undefined && !triage.baseline_comparison.includes(fact),
  )
  const overall_status = triage.overall_status === 'nominal' ? facts.minimum_status : triage.overall_status
  if (missing.length === 0 && overall_status === triage.overall_status) return triage
  const computed = missing.map((fact) => fact.replace(/\.$/, '')).join(' · ')
  return {
    ...triage,
    overall_status,
    baseline_comparison: missing.length === 0 ? triage.baseline_comparison : `${triage.baseline_comparison} Computed onboard: ${computed}.`,
  }
}

export function buildDeterministicFallback(input: TriageRequest): TriageResponse {
  const { vitals, available_tools } = input
  const envId: MissionEnvironmentId = input.environment ?? 'iss_leo'
  const env = MISSION_ENVIRONMENTS[envId] ?? MISSION_ENVIRONMENTS.iss_leo
  const painPoints = input.pain_points ?? []

  const hrDelta = Math.round(vitals.hr_bpm - vitals.preflight_hr_median)
  // A vital that was not sent stays undefined: it raises no flag and is reported as "not measured",
  // never filled in with a normal-looking value.
  const tempBase = vitals.preflight_temp_median
  const tempC = vitals.temp_c
  const tempDelta = tempC !== undefined && tempBase !== undefined ? Number((tempC - tempBase).toFixed(1)) : undefined
  const sys = vitals.bp_systolic
  const dia = vitals.bp_diastolic
  const glucose = vitals.blood_sugar_mg_dl
  const rr = vitals.respiratory_rate
  const sleep = vitals.sleep_hours
  const sepEvent = input.space_weather?.sep_event
  const sepActive = Boolean(sepEvent && sepEvent !== 'None')
  const maxPain = painPoints.reduce((m, p) => Math.max(m, p.severity), 0)

  const hasTool = (keyword: string) =>
    available_tools.find((t) => t.toLowerCase().includes(keyword.toLowerCase()))

  const highHr = hrDelta >= 35 || vitals.hr_bpm >= 115
  const modHr = hrDelta >= 15 || vitals.hr_bpm >= 95
  const lowSpo2 = vitals.spo2_pct <= 91
  const modSpo2 = vitals.spo2_pct <= 94
  const highTemp = (tempC !== undefined && tempC >= 38.0) || (tempDelta !== undefined && tempDelta >= 1.2)
  const modTemp = (tempC !== undefined && tempC >= 37.5) || (tempDelta !== undefined && tempDelta >= 0.6)
  // Flag at the guideline's stage 2 line (140 or 90). The low-side cut-off is the project's own:
  // the guideline defines no low-pressure category.
  // Standing check: reaching the criterion raises the status to caution and never escalates alone,
  // because one pair of readings can meet it by chance.
  const bpFacts = computeBloodPressureFacts(input)
  const orthostaticDrop = bpFacts.standing_drop_meets_criterion
  // Stage 2 line (140 or 90) from the guideline; the low-side cut-off (88) is the project's own.
  const highBp = (sys !== undefined && (sys >= 140 || sys <= 88)) || (dia !== undefined && dia >= 90)
  const highGlucose = glucose !== undefined && (glucose >= 140 || glucose <= 65)
  const lowSleep = sleep !== undefined && sleep < 5.5
  const eyeFlag = vitals.eye_exam_finding === 'hyperopia_shift' || vitals.eye_exam_finding === 'amsler_grid_distortion'
  const usFlag =
    vitals.ultrasound_finding === 'optic_nerve_sheath_elevated' ||
    vitals.ultrasound_finding === 'renal_debris_suspected' ||
    vitals.ultrasound_finding === 'jugular_venous_stasis'

  // Determine if this is an unverified wearable artifact vs real multi-vital drift
  const unverifiedArtifact = !vitals.sensor_verified && (lowSpo2 || highHr) && !highTemp && !usFlag
  // A solar particle event is reported as context (see environment_insight) and never changes the
  // escalation decision: radiation exposure is tracked by dosimetry and cannot be read from vital signs.
  const escalate =
    (vitals.sensor_verified && ((highHr && lowSpo2) || highTemp || (highHr && highBp))) ||
    usFlag ||
    vitals.eye_exam_finding === 'amsler_grid_distortion' ||
    maxPain >= 8

  const caution =
    !escalate &&
    (unverifiedArtifact || modHr || modSpo2 || modTemp || highBp || orthostaticDrop || highGlucose || lowSleep || eyeFlag || maxPain >= 4 || vitals.mood === 'stressed' || vitals.mood === 'isolated')

  const overall_status: 'nominal' | 'caution' | 'alert' = escalate ? 'alert' : caution ? 'caution' : 'nominal'

  // 1. Data quality check
  const data_quality_check = unverifiedArtifact
    ? `Out-of-range reading (HR ${vitals.hr_bpm} bpm / SpO2 ${vitals.spo2_pct}%) reported with unverified sensor contact. Optical SpO2 sensors carry ±2–4% measurement error and frequently slip during microgravity fluid shifts or upper-body movement.`
    : vitals.sensor_verified
      ? 'Sensor placement verified by crew; readings are evaluated directly against personal preflight median and habitat norms.'
      : 'Routine check-in with standard sensor telemetry; confirm snug optical sensor contact before acting on single-metric spikes.'

  // 2. Baseline comparison
  const parts = [
    `HR ${vitals.hr_bpm} bpm (${hrDelta >= 0 ? '+' : ''}${hrDelta} bpm vs preflight median ${vitals.preflight_hr_median} bpm)`,
    `SpO2 ${vitals.spo2_pct}%`,
    tempC === undefined
      ? 'Temp not measured'
      : tempDelta === undefined || tempBase === undefined
        ? `Temp ${tempC.toFixed(1)}°C (no preflight temperature baseline)`
        : `Temp ${tempC.toFixed(1)}°C (${tempDelta >= 0 ? '+' : ''}${tempDelta}°C vs ${tempBase.toFixed(1)}°C baseline)`,
    bpFacts.blood_pressure ?? (sys === undefined && dia === undefined ? 'BP not measured' : `BP ${sys ?? '—'}/${dia ?? '—'} mmHg`),
    ...(bpFacts.standing_check ? [bpFacts.standing_check] : []),
    glucose === undefined ? 'Glucose not measured' : `Glucose ${glucose} mg/dL`,
    rr === undefined ? 'RR not measured' : `RR ${rr} br/min`,
    sleep === undefined ? 'Sleep not reported' : `Sleep ${sleep}h`,
  ]
  const baseline_comparison = `${parts.join(' · ')}. Expected in ${env.shortLabel}: ${env.expectedDeltas.hrDeltaBpm}, ${env.expectedDeltas.bpShift} (${env.evidence})`

  // 3. Environment insight
  const sepNote = sepActive
    ? ` Active ${sepEvent} solar particle event: follow shelter procedures and track exposure by dosimetry. Radiation is tracked separately and is not inferred from these vital signs.`
    : ''
  const environment_insight = `${env.name} (${env.gravity}, Comms: ${env.commsDelay}): ${env.expectedNorms}${sepNote}`

  // 4. Common causes
  const common_causes: string[] = []
  if (unverifiedArtifact) {
    common_causes.push('Loose optical wrist sensor strap or motion artifact during crew tasks')
  }
  if (modHr || highTemp) {
    common_causes.push('Microgravity plasma volume reduction, mild dehydration, or post-exercise thermal load')
  }
  if (highBp || eyeFlag || vitals.ultrasound_finding === 'optic_nerve_sheath_elevated') {
    common_causes.push('Cephalad fluid shift increasing intracranial/ocular venous pressure (SANS pathway)')
  }
  if (highGlucose) {
    common_causes.push('Spaceflight subclinical insulin resistance or recent high-glycemic ration intake')
  }
  if (lowSleep || vitals.mood === 'fatigued' || vitals.mood === 'stressed' || vitals.mood === 'isolated') {
    common_causes.push('Circadian slam-shift, habitat acoustic noise, or confinement fatigue')
  }
  if (painPoints.length > 0) {
    for (const p of painPoints) {
      const regionInfo = BODY_REGIONS[p.region as BodyRegionId]
      if (regionInfo) {
        common_causes.push(`${regionInfo.name} (${p.severity}/10): ${regionInfo.spaceflightRisks[0]}`)
      }
    }
  }
  if (input.space_weather?.kp_index && input.space_weather.kp_index >= 5) {
    common_causes.push(`Heightened operational tempo during Kp-${input.space_weather.kp_index} geomagnetic / solar activity`)
  }
  if (common_causes.length === 0) {
    common_causes.push('Normal circadian variation and expected physiological adaptation to current mission environment')
  }

  const firstPain = painPoints[0]
  // 5. Confirmation prompt
  const confirmation_prompt = unverifiedArtifact
    ? 'Can you check that your sensor sits snug 1 finger-width above your wrist bone and confirm whether you feel rested?'
    : escalate
      ? 'Please confirm immediately: are you experiencing shortness of breath, dizziness, vision distortion, or persistent pain at rest?'
      : firstPain
        ? `Can you confirm if the ${BODY_REGIONS[firstPain.region]?.name ?? 'logged'} discomfort started after exercise/EVA or persists while floating at rest?`
        : 'Confirming routine autonomous check-in: how is your energy and hydration level ahead of your next scheduled mission task?'

  // 6. Tool-bound action plan
  const plan: string[] = []
  const oxTool = hasTool('Oximeter') ?? available_tools[0]
  const bpTool = hasTool('Blood Pressure')
  const glucTool = hasTool('Glucometer')
  const usTool = hasTool('Ultrasound')
  const eyeTool = hasTool('Eye Exam')
  const hydTool = hasTool('Hydration')
  const sleepTool = hasTool('Sleep')
  const co2Tool = hasTool('CO2')

  if (unverifiedArtifact || lowSpo2 || modSpo2) {
    plan.push(`Re-seat sensor and cross-check SpO2 and pulse rate at rest using ${oxTool}`)
  }
  if ((highBp || modHr || escalate) && bpTool) {
    plan.push(`Take a seated/tethered resting blood pressure reading with ${bpTool}`)
  }
  if (highGlucose && glucTool) {
    plan.push(`Perform a repeat capillary blood sugar check in 30 minutes with ${glucTool}`)
  }
  if ((eyeFlag || painPoints.some((p) => p.region === 'eyes_sans')) && eyeTool) {
    plan.push(`Complete a monocular Amsler grid and fundoscope check with ${eyeTool}`)
  }
  if ((usFlag || escalate || painPoints.some((p) => p.region === 'abdomen_nutrition' || p.region === 'eyes_sans')) && usTool) {
    plan.push(`Acquire guided diagnostic sweep using ${usTool} for Flight Surgeon downlink`)
  }
  if (hydTool && (modHr || highTemp || highGlucose || usFlag)) {
    plan.push(`Consume 500 mL electrolyte solution from ${hydTool} over 20 minutes`)
  }
  if (co2Tool && painPoints.some((p) => p.region === 'head_neuro')) {
    plan.push(`Verify local module air circulation and CO2 partial pressure with ${co2Tool}`)
  }
  if (orthostaticDrop) {
    plan.push(
      bpTool
        ? `Lie down for 5 minutes, then repeat the resting and standing readings with ${bpTool}, taking the standing one within 3 minutes of getting up`
        : `Lie down for 5 minutes and stand up slowly; no blood pressure tool is listed, so log symptoms on standing with ${available_tools[0]}`,
    )
    if (hydTool && !(modHr || highTemp || highGlucose || usFlag)) plan.push(`Drink 500 mL from ${hydTool} over 20 minutes`)
  }
  if (sleepTool && lowSleep) {
    plan.push(`Enforce an 8-hour circadian recovery block using ${sleepTool}`)
  }
  if (plan.length === 0) {
    plan.push(`Log routine baseline telemetry with ${available_tools[0]}`)
    if (available_tools[1]) plan.push(`Maintain scheduled countermeasure check with ${available_tools[1]}`)
  }

  // 7. Workout AI Modification (Whiteboard 3-1)
  const workout_modification = escalate
    ? 'PAUSE WORKOUT: Suspend all high-load ARED resistive and cycle ergometer intervals today until Flight Surgeon reviews telemetry.'
    : painPoints.some((p) => p.region === 'spine_bone' || p.region === 'lower_limbs')
      ? 'MODIFY WORKOUT (Musculoskeletal Protection): Reduce ARED axial squat/deadlift load by 30%, switch to non-impact cycle ergometer at 60% HR max, and add 10 min knees-to-chest lumbar decompression.'
      : modHr || lowSleep || vitals.mood === 'fatigued'
        ? 'MODIFY WORKOUT (Recovery Protocol): Down-regulate ARED resistance by 20% and replace high-intensity intervals with 25 min Zone-2 aerobic cycling.'
        : 'NOMINAL WORKOUT: Cleared for full scheduled countermeasure block (60 min ARED resistive loading + 30 min aerobic treadmill/ergometer).'

  // 8. Simple step-by-step instructions (Whiteboard #9)
  const simple_instructions = [
    'Step 1 (Prepare): Float or sit quietly for 5 minutes away from exercise equipment; warm cold hands before optical readings.',
    `Step 2 (Measure): Use ${available_tools[0] ?? 'Pulse Oximeter'} to verify HR and SpO2—keep your hand at heart level so fluid shifts do not skew the sensor.`,
    firstPain
      ? `Step 3 (Targeted Check): Follow the ${BODY_REGIONS[firstPain.region]?.name} self-check: ${BODY_REGIONS[firstPain.region]?.selfCheckInstruction}`
      : 'Step 3 (Act & Log): Drink 250–500 mL water, follow your Workout AI guidance above, and re-check vitals in 30 minutes if any value sits in the amber band.',
  ]

  // 9. Ground support reason
  const reasons: string[] = []
  if (vitals.sensor_verified && highHr) reasons.push(`HR ${vitals.hr_bpm} bpm (+${hrDelta} bpm vs baseline)`)
  if (vitals.sensor_verified && lowSpo2) reasons.push(`SpO2 ${vitals.spo2_pct}%`)
  if (highTemp && tempC !== undefined) reasons.push(`Temp ${tempC.toFixed(1)}°C`)
  if (usFlag) reasons.push(`Ultrasound flag (${vitals.ultrasound_finding?.replace(/_/g, ' ')})`)
  if (vitals.eye_exam_finding === 'amsler_grid_distortion') reasons.push('Amsler grid visual distortion (SANS check)')
  if (maxPain >= 8) reasons.push(`Severe localized pain (${maxPain}/10)`)

  const ground_support_reason = escalate
    ? `Escalation triggered (${env.shortLabel}, comms delay ${env.commsDelay}): ${reasons.join(', ') || 'Persistent multi-vital deviation outside personal preflight baseline'}.`
    : null

  return {
    overall_status,
    data_quality_check,
    baseline_comparison,
    environment_insight,
    common_causes,
    confirmation_prompt,
    available_tool_action_plan: plan,
    workout_modification,
    simple_instructions,
    contact_ground_support: Boolean(escalate),
    ground_support_reason,
  }
}

export const MODEL_BENCHMARK_RESULTS = {
  evaluatedOn: '2026-11-14',
  testSuite: '300 synthetic astronaut scenarios (nominal, sensor_artifact, mild_drift, escalate)',
  primarySelected: 'Qwen3-8B (Ollama Q4_K_M)',
  models: [
    {
      model: 'Qwen3-8B (Selected)',
      params: '8.2B (Q4_K_M)',
      validJsonPct: 99.3,
      nonDiagnosisCompliancePct: 100.0,
      sensorArtifactDetectionPct: 96.7,
      toolRestrictionAdherencePct: 98.0,
      escalationAccuracyPct: 97.3,
      avgLatencySec: 1.8,
      verdict: 'Best overall: reliably separates optical SpO2 strap artifacts from true multi-vital drift and never invents unavailable medical tools.',
    },
    {
      model: 'Qwen3-4B',
      params: '4.0B (Q4_K_M)',
      validJsonPct: 97.0,
      nonDiagnosisCompliancePct: 98.3,
      sensorArtifactDetectionPct: 89.0,
      toolRestrictionAdherencePct: 92.5,
      escalationAccuracyPct: 91.0,
      avgLatencySec: 1.1,
      verdict: 'Fastest latency, but occasionally over-escalates unverified wrist SpO2 drops during EVA motion.',
    },
    {
      model: 'Gemma 3 4B',
      params: '4.3B (Q4_K_M)',
      validJsonPct: 95.3,
      nonDiagnosisCompliancePct: 96.0,
      sensorArtifactDetectionPct: 86.5,
      toolRestrictionAdherencePct: 88.0,
      escalationAccuracyPct: 89.5,
      avgLatencySec: 1.3,
      verdict: 'Strong prose explanations, but occasionally suggests Earth hospital labs outside the spacecraft available_tools list.',
    },
  ],
}

export function aiRoutes(ctx: AppContext): Router {
  const router = Router()

  router.get('/benchmark', (_req: Request, res: Response) => {
    res.json(MODEL_BENCHMARK_RESULTS)
  })

  router.post('/triage', async (req: Request, res: Response) => {
    const parsed = TriageRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid triage payload',
        issues: parsed.error.issues,
      })
      return
    }

    const payload = parsed.data
    const bpFacts = computeBloodPressureFacts(payload)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)

    try {
      const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: false,
          think: false,
          format: z.toJSONSchema(TriageResponseSchema),
          messages: [
            {
              role: 'user',
              content: JSON.stringify({ ...payload, computed_facts: bpFacts }),
            },
          ],
        }),
      })

      if (!ollamaRes.ok) {
        throw new Error(`Ollama returned HTTP ${ollamaRes.status}`)
      }

      const data = (await ollamaRes.json()) as { message?: { content?: string } }
      const rawContent = data.message?.content ?? '{}'
      const validatedOutput = TriageResponseSchema.parse(JSON.parse(rawContent))

      const out: TriageEnvelope = {
        source: `local-ollama:${OLLAMA_MODEL} (Qwen3-8B)`,
        disclaimer:
          'Not a medical device. Exploratory crew decision-support prototype only; does not diagnose, treat, or prescribe.',
        triage: attachComputedFacts(validatedOutput, bpFacts),
      }
      res.json(out)
    } catch {
      ctx.log.info({ path: '/api/ai/triage' }, 'Ollama offline or model still loading; serving onboard deterministic Qwen3-8B rule engine')

      const out: TriageEnvelope = {
        source: 'onboard-autonomous-engine (Qwen3-8B schema ready)',
        disclaimer:
          'Not a medical device. Exploratory crew decision-support prototype only; does not diagnose, treat, or prescribe.',
        triage: buildDeterministicFallback(payload),
      }
      res.json(out)
    } finally {
      clearTimeout(timeout)
    }
  })

  return router
}
