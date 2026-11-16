/**
 * Builds the fine-tuning data. Run from the repository root:
 *
 *   npx tsx ai/training/make_dataset.mts [trainCount] [validCount]
 *
 * Every case is a request the app could send. The answer the model is taught is the rule engine's
 * own answer with its checklist of the rules in place of the long description of the readings, so
 * the model learns to reproduce the rules; it cannot become more accurate than they are. The prompt is exactly what the server sends: the request plus
 * the computed facts.
 *
 * Writes ai/training/data/: train.jsonl and valid.jsonl (chat format), heldout.jsonl (the
 * hand-written test set with its expectations, never trained on), test500.jsonl (500 more random
 * cases in the valid.jsonl format, none sharing its readings with a training, validation or
 * held-out case) and response_schema.json.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { buildDeterministicFallback, computeVitalFacts, evaluateRules, TriageRequestSchema, TriageResponseSchema } from '../../apps/server/src/routes/ai.ts'
import { ONBOARD_TOOLS } from '../../packages/shared/src/triage.ts'
import { HELD_OUT, requestFor } from './heldout_cases.mts'

const here = dirname(fileURLToPath(import.meta.url))
const SYSTEM = readFileSync(join(here, 'system_prompt.txt'), 'utf8').trim()
/** Qwen3 writes an empty thinking block when thinking is off; the taught answers carry it so training matches use. */
const NO_THINKING = '<think>\n\n</think>\n\n'

// A small seeded generator, so the same command always writes the same files.
function seeded(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1))
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!
  const chance = (p: number) => next() < p
  const one = (lo: number, hi: number) => Math.round((lo + next() * (hi - lo)) * 10) / 10
  return { next, int, pick, chance, one }
}
type Rng = ReturnType<typeof seeded>

const ENVIRONMENTS = ['iss_leo', 'lunar_base', 'deep_space_transit', 'mars_surface', 'eva_spacewalk', 'earth_preflight'] as const
const REGIONS = ['head_neuro', 'eyes_sans', 'chest_cardio', 'abdomen_nutrition', 'spine_bone', 'upper_limbs', 'lower_limbs'] as const
const CONDITIONS = [
  'None', 'None', 'None', 'None',
  'None; mild orthostatic sensitivity post-parabolic flight',
  'COPD (mild)', 'Asthma, well controlled', 'Type 2 diabetes', 'Pre-diabetes', 'Hypertension, treated',
  'Former smoker', 'Bronchiectasis', 'Seasonal allergies', 'Kidney stone (2019)', 'Migraine',
]
const PAIN_NOTES = [undefined, undefined, 'after EVA', 'worse at rest', 'since ARED session', 'dull ache', 'started this morning']
const FLARES = ['None', 'C3.2', 'C8.5', 'M1.4', 'M2.1', 'M5.6', 'X1.2', 'X2.8']
const SEP = ['None', 'None', 'None', 'S1', 'S2', 'S3']
const FEATURES = ['hr', 'spo2', 'bp', 'glucose', 'temp', 'rr', 'sleep', 'mood', 'ultrasound', 'eye', 'pain'] as const
type Feature = (typeof FEATURES)[number]

/**
 * One request. `abnormal` lists the readings drawn from outside their reference range; the rest are
 * drawn from inside it. Both draws favour values right at a threshold, on its own side, because
 * the thresholds are what the model has to learn.
 */
function buildRequest(r: Rng, abnormal: Set<Feature>, present: (f: Feature, p: number) => boolean) {
  const vitals: Record<string, unknown> = {}
  const median = r.int(50, 76)
  if (abnormal.has('hr')) {
    const mode = r.next()
    const hr =
      mode < 0.35 ? median + r.pick([15, 16, 17, 33, 34, 35, 36])
      : mode < 0.5 ? r.pick([101, 102, 114, 115, 116])
      : mode < 0.65 ? median + r.pick([-15, -16, -17, -20, -24])
      : mode < 0.82 ? median + r.int(18, 32)
      : median + r.int(37, 72)
    // a fixed value such as 101 can land inside the normal band for a high median; move it out
    vitals.hr_bpm = hr > median - 15 && hr < median + 15 && hr <= 100 ? median + 15 : hr
  } else {
    vitals.hr_bpm = r.chance(0.35) ? median + r.pick([12, 13, 14, -13, -14]) : median + r.int(-6, 11)
  }
  vitals.preflight_hr_median = median

  if (abnormal.has('spo2')) {
    const mode = r.next()
    if (mode < 0.2) {
      vitals.spo2_pct = r.pick([95, 96])
      vitals.preflight_spo2_median = (vitals.spo2_pct as number) + r.pick([3, 3, 4])
    } else {
      vitals.spo2_pct = mode < 0.65 ? r.pick([93, 92, 91, 90, 89, 88]) : r.int(80, 87)
      if (r.chance(0.5)) vitals.preflight_spo2_median = r.int(96, 99)
    }
  } else {
    vitals.spo2_pct = r.chance(0.35) ? r.pick([94, 95]) : r.int(96, 100)
    if (r.chance(0.5)) vitals.preflight_spo2_median = Math.min(100, Math.max(96, (vitals.spo2_pct as number) + r.int(0, 2)))
    // a baseline that would put the reading 3 or more below it belongs to the abnormal draw
    if (vitals.preflight_spo2_median !== undefined && (vitals.preflight_spo2_median as number) - (vitals.spo2_pct as number) >= 3) delete vitals.preflight_spo2_median
  }

  if (present('bp', 0.75)) {
    let sys = r.chance(0.35) ? r.pick([89, 90, 119, 120, 129, 130, 138, 139]) : r.int(96, 137)
    let dia = r.chance(0.35) ? r.pick([79, 80, 88, 89]) : r.int(58, 87)
    if (abnormal.has('bp')) {
      const which = r.pick(['sys', 'dia', 'both', 'low'] as const)
      if (which === 'low') sys = r.chance(0.5) ? r.pick([88, 87]) : r.int(74, 86)
      if (which === 'sys' || which === 'both') sys = r.chance(0.4) ? r.pick([140, 141, 142]) : r.chance(0.15) ? r.int(181, 205) : r.int(143, 180)
      if (which === 'dia' || which === 'both') dia = r.chance(0.4) ? r.pick([90, 91]) : r.chance(0.1) ? r.int(121, 128) : r.int(92, 112)
      if (which === 'low') dia = Math.min(dia, r.int(48, 60))
    }
    vitals.bp_systolic = sys
    vitals.bp_diastolic = dia
    if (r.chance(0.28)) {
      const fallSys = r.pick([0, 5, 12, 18, 19, 20, 21, 28])
      const fallDia = r.pick([0, 3, 8, 9, 10, 11, 15])
      vitals.standing_bp_systolic = Math.max(45, sys - fallSys)
      vitals.standing_bp_diastolic = Math.max(25, dia - fallDia)
      if (r.chance(0.6)) vitals.standing_hr_bpm = (vitals.hr_bpm as number) + r.int(0, 34)
    }
  }

  if (present('glucose', 0.55)) {
    vitals.blood_sugar_mg_dl = abnormal.has('glucose')
      ? r.chance(0.4) ? r.pick([69, 68, 140, 141]) : r.chance(0.35) ? r.int(42, 67) : r.int(142, 320)
      : r.chance(0.35) ? r.pick([70, 71, 99, 100, 125, 126, 138, 139]) : r.int(74, 136)
  }

  if (present('temp', 0.75)) {
    const base = r.one(36.4, 37.0)
    const withBase = r.chance(0.85)
    let t: number
    if (abnormal.has('temp')) {
      const mode = r.next()
      t = mode < 0.3 ? r.pick([37.4, 37.5, 37.7, 37.8, 37.9, 38.0, 35.6, 35.0])
        : mode < 0.5 ? Math.round((base + r.pick([0.6, 0.7, 1.1, 1.2, 1.3])) * 10) / 10
        : mode < 0.85 ? r.one(38.1, 40.4)
        : r.one(34.0, 35.5)
    } else {
      t = r.chance(0.3) ? r.pick([37.3, 35.7, 37.2]) : Math.round((base + r.one(-0.4, 0.5)) * 10) / 10
      t = Math.min(37.3, Math.max(35.7, t))
      // keep it under the personal-baseline line as well
      if (withBase && t - base >= 0.55) t = Math.round((base + 0.5) * 10) / 10
    }
    vitals.temp_c = t
    if (withBase) vitals.preflight_temp_median = base
  }

  if (present('rr', 0.55)) {
    vitals.respiratory_rate = abnormal.has('rr')
      ? r.chance(0.5) ? r.pick([11, 10, 9, 21, 22, 23]) : r.chance(0.3) ? r.int(5, 8) : r.int(24, 36)
      : r.chance(0.35) ? r.pick([12, 20]) : r.int(13, 19)
  }

  if (present('sleep', 0.6)) {
    vitals.sleep_hours = abnormal.has('sleep')
      ? r.chance(0.4) ? r.pick([5.4, 5.3, 5]) : r.one(1.5, 5.2)
      : r.chance(0.35) ? r.pick([5.5, 5.6, 6.9, 7]) : r.one(5.7, 9.5)
  }

  if (present('mood', 0.6)) vitals.mood = abnormal.has('mood') ? r.pick(['stressed', 'isolated']) : r.pick(['optimal', 'focused', 'fatigued'])
  if (present('ultrasound', 0.4)) {
    vitals.ultrasound_finding = abnormal.has('ultrasound') ? r.pick(['optic_nerve_sheath_elevated', 'renal_debris_suspected', 'jugular_venous_stasis']) : r.pick(['not_performed', 'normal'])
  }
  if (present('eye', 0.4)) {
    vitals.eye_exam_finding = abnormal.has('eye') ? r.pick(['hyperopia_shift', 'amsler_grid_distortion']) : r.pick(['not_performed', 'normal_20_20', 'mild_eye_strain'])
  }
  vitals.sensor_verified = r.chance(0.62)

  const crew = r.pick(['C001', 'C002', 'C003', 'C004'])
  const request: Record<string, unknown> = { crew_id: crew, environment: r.pick(ENVIRONMENTS) }
  if (r.chance(0.7)) {
    request.profile = { crew_id: crew, age: r.int(27, 58), height_cm: r.int(155, 195), weight_kg: r.int(52, 98), gender: r.pick(['Male', 'Female']), previous_conditions: r.pick(CONDITIONS) }
  }
  request.vitals = vitals

  if (present('pain', 0.22)) {
    const count = r.chance(0.75) ? 1 : 2
    const points = []
    for (let i = 0; i < count; i++) {
      const severe = abnormal.has('pain') && i === 0
      const severity = severe ? (r.chance(0.5) ? r.pick([4, 7, 8]) : r.pick([5, 6, 9, 10])) : r.pick([1, 2, 3, 3])
      const note = r.pick(PAIN_NOTES)
      points.push({ region: r.pick(REGIONS), severity, ...(note ? { note } : {}) })
    }
    request.pain_points = points
  }
  if (r.chance(0.75)) {
    const weather: Record<string, unknown> = {}
    if (r.chance(0.9)) weather.kp_index = r.int(0, 9)
    if (r.chance(0.8)) weather.solar_flare = r.pick(FLARES)
    if (r.chance(0.8)) weather.sep_event = r.pick(SEP)
    request.space_weather = weather
  }
  // a shuffled subset of the equipment, so the model has to read the list instead of assuming it
  const tools = [...ONBOARD_TOOLS].sort(() => r.next() - 0.5).slice(0, r.int(2, ONBOARD_TOOLS.length))
  request.available_tools = tools
  return request
}

function randomRequest(r: Rng) {
  const kind = r.next()
  const abnormal = new Set<Feature>()
  if (kind < 0.28) {
    // every reading inside its range
  } else if (kind < 0.75) {
    const weighted: Feature[] = ['hr', 'hr', 'spo2', 'spo2', 'bp', 'bp', 'temp', 'temp', 'glucose', 'rr', 'sleep', 'mood', 'ultrasound', 'eye', 'pain']
    abnormal.add(r.pick(weighted))
    if (r.chance(0.45)) abnormal.add(r.pick(weighted))
  } else {
    for (const f of FEATURES) if (r.chance(0.3)) abnormal.add(f)
  }
  return buildRequest(r, abnormal, (f, p) => abnormal.has(f) || r.chance(p))
}

const readingsKey = (v: Record<string, unknown>) =>
  JSON.stringify(['hr_bpm', 'preflight_hr_median', 'spo2_pct', 'bp_systolic', 'bp_diastolic', 'blood_sugar_mg_dl', 'temp_c', 'respiratory_rate', 'sleep_hours'].map((k) => v[k] ?? null))

function example(raw: Record<string, unknown>) {
  const payload = TriageRequestSchema.parse(raw)
  const facts = computeVitalFacts(payload)
  const { triage: rules, checklist } = evaluateRules(payload)
  // The checklist must lead to the same decision as the rule engine, or the model would be taught a contradiction.
  const escalates = checklist.includes('escalate: yes')
  const fromChecklist = escalates ? 'alert' : checklist.includes('flags: none;') ? 'nominal' : 'caution'
  if (escalates !== rules.contact_ground_support || fromChecklist !== rules.overall_status) throw new Error(`checklist disagrees with the rules: ${checklist}`)
  // The model writes the rule checklist where the rule engine writes its long description of the
  // readings. The server replaces that field with the rule engine's text either way
  // (applyRuleDecisions), and the checklist comes first so the model works through every rule before
  // it commits to a status. A first round without it scored 73% on the held-out set: the model
  // mostly repeated computed_facts.minimum_status.
  const answer = { ...rules, baseline_comparison: checklist }
  return {
    payload,
    answer,
    user: JSON.stringify({ ...payload, computed_facts: facts }),
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: JSON.stringify({ ...payload, computed_facts: facts }) },
      { role: 'assistant', content: NO_THINKING + JSON.stringify(answer) },
    ],
  }
}

const trainCount = Number(process.argv[2] ?? 2000)
const validCount = Number(process.argv[3] ?? 150)
const heldOutRequests = HELD_OUT.map((c) => ({ c, raw: requestFor(c) }))
const heldOutKeys = new Set(heldOutRequests.map(({ raw }) => readingsKey(raw.vitals as Record<string, unknown>)))

const seen = new Set<string>()
/** The readings of every training and validation case, so the 500-case test can keep clear of them. */
const trainedReadings = new Set<string>()
let dropped = 0
let testDropped = 0
/**
 * `test` marks the 500-case test: it also drops any case whose readings match a training or
 * validation case. It has its own seed and is generated last, so it cannot change the other files.
 */
function generate(count: number, seed: number, test = false) {
  const r = seeded(seed)
  const rows: ReturnType<typeof example>[] = []
  while (rows.length < count) {
    const raw = randomRequest(r)
    const key = readingsKey(raw.vitals as Record<string, unknown>)
    // never train on a case whose readings match the held-out set, and never repeat a request across the files
    if (heldOutKeys.has(key)) { if (test) testDropped++; else dropped++; continue }
    // a test case that shares its readings with a training case would measure memory, not skill
    if (test && trainedReadings.has(key)) { testDropped++; continue }
    const row = example(raw)
    if (seen.has(row.user)) continue
    seen.add(row.user)
    if (!test) trainedReadings.add(key)
    rows.push(row)
  }
  return rows
}

const train = generate(trainCount, 20261115)
const valid = generate(validCount, 771)
const TEST_COUNT = 500
const test500 = generate(TEST_COUNT, 5002026, true)

const out = join(here, 'data')
mkdirSync(out, { recursive: true })
const lines = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
writeFileSync(join(out, 'train.jsonl'), lines(train.map((row) => ({ messages: row.messages }))))
writeFileSync(join(out, 'valid.jsonl'), lines(valid.map((row) => ({ messages: row.messages }))))
// The 500-case test (evaluate.py --test-file data/test500.jsonl): same record format as valid.jsonl.
const test500Text = lines(test500.map((row) => ({ messages: row.messages })))
writeFileSync(join(out, 'test500.jsonl'), test500Text)
writeFileSync(
  join(out, 'heldout.jsonl'),
  lines(
    heldOutRequests.map(({ c, raw }) => {
      const row = example(raw)
      return { id: c.id, basis: c.basis, expect: { flag: c.flag, escalate: c.escalate }, rules: { overall_status: row.answer.overall_status, contact_ground_support: row.answer.contact_ground_support }, payload: row.payload, user: row.user }
    }),
  ),
)
writeFileSync(join(out, 'response_schema.json'), JSON.stringify(z.toJSONSchema(TriageResponseSchema)))

const share = (rows: ReturnType<typeof example>[]) => {
  const n = { nominal: 0, caution: 0, alert: 0 }
  for (const row of rows) n[row.answer.overall_status]++
  return `${rows.length} cases: nominal ${n.nominal}, caution ${n.caution}, alert ${n.alert}`
}
console.log('train', share(train))
console.log('valid', share(valid))
console.log(`dropped ${dropped} generated case(s) whose readings matched the held-out set`)

// The make-up of the 500-case test. Random cases contain few of the rare escalation rules, so a
// score on this file says little about a rule that appears in a handful of cases or in none.
/** The escalation rules that fired, from the last entry of the checklist: "escalate: yes (a; b)". */
const reasonsOf = (row: ReturnType<typeof example>) => /escalate: yes \((.*)\)$/.exec(row.answer.baseline_comparison)?.[1]?.split('; ') ?? []
const tally = (rows: ReturnType<typeof example>[]) => {
  const all = new Map<string, number>()
  const alone = new Map<string, number>()
  for (const row of rows) {
    const reasons = reasonsOf(row)
    for (const reason of reasons) all.set(reason, (all.get(reason) ?? 0) + 1)
    if (reasons.length === 1) alone.set(reasons[0]!, (alone.get(reasons[0]!) ?? 0) + 1)
  }
  return { all, alone }
}
const inTest = tally(test500)
const inTrain = tally(train)
const reasonNames = [...new Set([...inTrain.all.keys(), ...inTest.all.keys()])].sort(
  (a, b) => (inTest.all.get(b) ?? 0) - (inTest.all.get(a) ?? 0) || (a < b ? -1 : a > b ? 1 : 0),
)
const heldBack = test500.filter((row) => row.answer.baseline_comparison.endsWith('escalate: no (sensor not verified)')).length
const escalated = test500.filter((row) => row.answer.contact_ground_support).length
console.log(`test500 ${share(test500)} (dropped ${testDropped} generated case(s) whose readings matched a training, validation or held-out case)`)
console.log(`test500 sha256 starts ${createHash('sha256').update(test500Text).digest('hex').slice(0, 16).toUpperCase()} (must be the same on every machine)`)
console.log(`test500 escalated cases by reason: ${escalated} escalate; a case with two reasons counts under both, "alone" is where it is the only reason`)
for (const name of reasonNames) console.log(`  ${name}: ${inTest.all.get(name) ?? 0}, alone ${inTest.alone.get(name) ?? 0} (train has ${inTrain.all.get(name) ?? 0})`)
console.log(`test500 not escalated: ${TEST_COUNT - escalated}, of which ${heldBack} have an escalation rule held back because the sensor is not verified`)

// The rule engine against the hand-written expectations: a disagreement is a finding about the rules.
const misses = heldOutRequests
  .map(({ c, raw }) => ({ c, answer: buildDeterministicFallback(TriageRequestSchema.parse(raw)) }))
  .filter(({ c, answer }) => (answer.overall_status !== 'nominal') !== c.flag || answer.contact_ground_support !== c.escalate)
console.log(`held-out: ${HELD_OUT.length} cases, rule engine agrees on ${HELD_OUT.length - misses.length}`)
for (const { c, answer } of misses) console.log(`  DISAGREES ${c.id}: expected flag=${c.flag} escalate=${c.escalate}, rules gave ${answer.overall_status} / escalate=${answer.contact_ground_support} — ${c.basis}`)
