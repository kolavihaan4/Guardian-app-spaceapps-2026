/**
 * The held-out test set: boundary cases written by hand, never used for training or tuning.
 *
 * Each expectation is written from the threshold named in `basis`, not by running the rule engine:
 *   flag     = overall_status should be "caution" or "alert" (false means "nominal")
 *   escalate = contact_ground_support should be true
 *
 * Two kinds of threshold appear, and `basis` says which:
 *   - a published reference range the app cites (AHA/ACC, BTS, ATS, ADA, AASM), where the expectation
 *     is that a reading outside the range is flagged;
 *   - one of the project's own decision lines (marked "project line"), which no guideline sets.
 *
 * make_dataset.mts drops any generated training case whose readings equal one of these.
 */

export interface HeldOutCase {
  id: string
  basis: string
  /** Changes applied to the all-normal base request below. */
  vitals?: Record<string, unknown>
  environment?: string
  previous_conditions?: string
  pain?: { region: string; severity: number }
  weather?: { kp_index?: number; solar_flare?: string; sep_event?: string }
  flag: boolean
  escalate: boolean
}

export const BASE_REQUEST = {
  crew_id: 'C001',
  environment: 'iss_leo',
  profile: { crew_id: 'C001', age: 38, height_cm: 178, weight_kg: 76, gender: 'Male', previous_conditions: 'None' },
  vitals: { hr_bpm: 64, preflight_hr_median: 60, spo2_pct: 98, sensor_verified: true },
  available_tools: [
    'Pulse Oximeter',
    'Blood Pressure Cuff',
    'Glucometer',
    'Thermometer',
    'Portable Ultrasound',
    'Eye Exam Kit (Fundoscope & Amsler)',
    'ARED Resistive Exercise System',
    'Hydration & Electrolyte Pack',
  ],
}

const BP = '2025 AHA/ACC blood pressure categories; the app flags from the stage 2 line (140 or 90)'
const BP_LOW = 'project line: systolic 88 or below is flagged'
const BP_ALONE = 'project line: blood pressure alone never escalates'
const HR = 'project line: 15 bpm or more above the personal median is flagged'
const HR_RANGE = 'resting adult range 60–100 bpm'
const HR_ALONE = 'project line: heart rate alone never escalates'
const O2 = 'BTS oxygen guideline: target range 94–98%'
const O2_COPD = 'BTS oxygen guideline: 88–92% target for COPD and similar conditions'
const O2_FALL = 'BTS oxygen guideline: a fall of 3 points or more from the personal baseline'
const O2_ESC = 'project line: SpO2 91 or below with a high heart rate, sensor verified, escalates'
const O2_RR = 'project line: SpO2 below 90 with breathing above 22 and heart rate above 100, or with breathing below 10, escalates'
const TEMP = 'usual adult oral range 35.7–37.3 °C'
const TEMP_OWN = 'project line: 0.6 °C above the personal baseline is flagged'
const TEMP_ESC = 'project line: 38.0 °C, or 1.2 °C above the personal baseline, sensor verified, escalates'
const GLU = 'ADA: below 70 mg/dL is low; the app flags below 70 and from 140'
const RR = 'resting adult range 12–20 breaths a minute'
const SLEEP = 'AASM 7-hour recommendation; project line: below 5.5 hours is flagged'
const MOOD = 'project line: stressed or isolated is flagged'
const PAIN = 'project line: pain of 4 or more is flagged, 8 or more escalates'
const FIND = 'project line: a flagged ultrasound finding or Amsler grid distortion escalates'
const WEATHER = 'project line: space weather never changes the decision'
const ORTHO = '2024 AHA orthostatic criterion: a fall of 20 systolic or 10 diastolic on standing, gravity environments only'
const HR_BP = 'project line: high heart rate with stage 2 blood pressure, sensor verified, escalates'

const bp = (s: number, d: number) => ({ bp_systolic: s, bp_diastolic: d })
const hr = (now: number, median: number) => ({ hr_bpm: now, preflight_hr_median: median })
const temp = (now: number, median: number) => ({ temp_c: now, preflight_temp_median: median })
const standing = (s: number, d: number, ss: number, sd: number) => ({ ...bp(s, d), standing_bp_systolic: ss, standing_bp_diastolic: sd })

export const HELD_OUT: HeldOutCase[] = [
  // blood pressure
  { id: 'bp-119-79', basis: BP, vitals: bp(119, 79), flag: false, escalate: false },
  { id: 'bp-120-79', basis: BP, vitals: bp(120, 79), flag: false, escalate: false },
  { id: 'bp-129-79', basis: BP, vitals: bp(129, 79), flag: false, escalate: false },
  { id: 'bp-130-80', basis: BP, vitals: bp(130, 80), flag: false, escalate: false },
  { id: 'bp-139-89', basis: BP, vitals: bp(139, 89), flag: false, escalate: false },
  { id: 'bp-140-89', basis: BP, vitals: bp(140, 89), flag: true, escalate: false },
  { id: 'bp-139-90', basis: BP, vitals: bp(139, 90), flag: true, escalate: false },
  { id: 'bp-141-91', basis: BP, vitals: bp(141, 91), flag: true, escalate: false },
  { id: 'bp-160-100', basis: BP_ALONE, vitals: bp(160, 100), flag: true, escalate: false },
  { id: 'bp-181-95', basis: BP_ALONE, vitals: bp(181, 95), flag: true, escalate: false },
  { id: 'bp-150-121', basis: BP_ALONE, vitals: bp(150, 121), flag: true, escalate: false },
  { id: 'bp-180-120', basis: BP_ALONE, vitals: bp(180, 120), environment: 'mars_surface', flag: true, escalate: false },
  { id: 'bp-89-60', basis: BP_LOW, vitals: bp(89, 60), flag: false, escalate: false },
  { id: 'bp-88-58', basis: BP_LOW, vitals: bp(88, 58), flag: true, escalate: false },
  { id: 'bp-85-55', basis: BP_LOW, vitals: bp(85, 55), environment: 'lunar_base', flag: true, escalate: false },

  // heart rate
  { id: 'hr-plus14', basis: HR, vitals: hr(74, 60), flag: false, escalate: false },
  { id: 'hr-plus15', basis: HR, vitals: hr(75, 60), flag: true, escalate: false },
  { id: 'hr-100', basis: HR_RANGE, vitals: hr(100, 90), flag: false, escalate: false },
  { id: 'hr-101', basis: HR_RANGE, vitals: hr(101, 90), flag: true, escalate: false },
  { id: 'hr-plus35-alone', basis: HR_ALONE, vitals: hr(95, 60), flag: true, escalate: false },
  { id: 'hr-120-alone', basis: HR_ALONE, vitals: hr(120, 70), environment: 'deep_space_transit', flag: true, escalate: false },
  { id: 'hr-58', basis: HR, vitals: hr(58, 60), flag: false, escalate: false },
  { id: 'hr-minus18', basis: 'project line: 15 bpm or more below the personal median is flagged', vitals: hr(42, 60), flag: true, escalate: false },
  { id: 'hr-minus14', basis: 'project line: 15 bpm or more below the personal median is flagged', vitals: hr(46, 60), flag: false, escalate: false },

  // oxygen saturation
  { id: 'o2-94', basis: O2, vitals: { spo2_pct: 94 }, flag: false, escalate: false },
  { id: 'o2-93', basis: O2, vitals: { spo2_pct: 93 }, flag: true, escalate: false },
  { id: 'o2-92-alone', basis: O2_ESC, vitals: { spo2_pct: 92 }, flag: true, escalate: false },
  { id: 'o2-91-alone', basis: O2_ESC, vitals: { spo2_pct: 91 }, flag: true, escalate: false },
  { id: 'o2-91-hr-high', basis: O2_ESC, vitals: { spo2_pct: 91, ...hr(96, 60) }, flag: true, escalate: true },
  { id: 'o2-92-hr-high', basis: O2_ESC, vitals: { spo2_pct: 92, ...hr(96, 60) }, flag: true, escalate: false },
  { id: 'o2-91-hr-high-unverified', basis: O2_ESC, vitals: { spo2_pct: 91, ...hr(96, 60), sensor_verified: false }, flag: true, escalate: false },
  { id: 'o2-88-alone', basis: 'ATS: 88% or below is severe low oxygen at rest', vitals: { spo2_pct: 88 }, flag: true, escalate: false },
  { id: 'o2-84-verified', basis: 'BTS oxygen guideline: below 85% is the line for high-flow oxygen, so a verified reading should reach Ground Support', vitals: { spo2_pct: 84 }, flag: true, escalate: true },
  { id: 'o2-85-verified', basis: 'BTS oxygen guideline: below 85% is the line for high-flow oxygen; 85 itself is not below it', vitals: { spo2_pct: 85 }, flag: true, escalate: false },
  { id: 'o2-84-unverified', basis: 'project line: an unverified sensor never escalates on a reading alone', vitals: { spo2_pct: 84, sensor_verified: false }, flag: true, escalate: false },
  { id: 'o2-copd-90', basis: O2_COPD, vitals: { spo2_pct: 90 }, previous_conditions: 'COPD (mild)', flag: false, escalate: false },
  { id: 'o2-copd-93', basis: O2_COPD, vitals: { spo2_pct: 93 }, previous_conditions: 'COPD (mild)', flag: false, escalate: false },
  { id: 'o2-copd-87', basis: O2_COPD, vitals: { spo2_pct: 87 }, previous_conditions: 'Chronic obstructive pulmonary disease', flag: true, escalate: false },
  { id: 'o2-fall-3', basis: O2_FALL, vitals: { spo2_pct: 96, preflight_spo2_median: 99 }, flag: true, escalate: false },
  { id: 'o2-fall-2', basis: O2_FALL, vitals: { spo2_pct: 97, preflight_spo2_median: 99 }, flag: false, escalate: false },

  // low oxygen with breathing rate
  { id: 'o2-89-rr-23-hr-101', basis: O2_RR, vitals: { spo2_pct: 89, respiratory_rate: 23, ...hr(101, 90) }, flag: true, escalate: true },
  { id: 'o2-89-rr-22-hr-101', basis: O2_RR, vitals: { spo2_pct: 89, respiratory_rate: 22, ...hr(101, 90) }, flag: true, escalate: false },
  { id: 'o2-90-rr-24-hr-105', basis: O2_RR, vitals: { spo2_pct: 90, respiratory_rate: 24, ...hr(105, 92) }, flag: true, escalate: false },
  { id: 'o2-89-rr-9', basis: O2_RR, vitals: { spo2_pct: 89, respiratory_rate: 9 }, flag: true, escalate: true },
  { id: 'o2-89-rr-10', basis: O2_RR, vitals: { spo2_pct: 89, respiratory_rate: 10 }, flag: true, escalate: false },
  { id: 'o2-89-rr-9-unverified', basis: O2_RR, vitals: { spo2_pct: 89, respiratory_rate: 9, sensor_verified: false }, flag: true, escalate: false },

  // temperature
  { id: 'temp-37.3', basis: TEMP, vitals: temp(37.3, 36.8), flag: false, escalate: false },
  { id: 'temp-37.4', basis: TEMP, vitals: temp(37.4, 36.9), flag: true, escalate: false },
  { id: 'temp-35.7', basis: TEMP, vitals: temp(35.7, 36.2), flag: false, escalate: false },
  { id: 'temp-35.6', basis: TEMP, vitals: temp(35.6, 36.2), flag: true, escalate: false },
  { id: 'temp-plus0.6', basis: TEMP_OWN, vitals: temp(37.2, 36.6), flag: true, escalate: false },
  { id: 'temp-plus0.5', basis: TEMP_OWN, vitals: temp(37.2, 36.7), flag: false, escalate: false },
  { id: 'temp-37.9', basis: TEMP_ESC, vitals: temp(37.9, 36.8), flag: true, escalate: false },
  { id: 'temp-38.0', basis: TEMP_ESC, vitals: temp(38.0, 36.9), flag: true, escalate: true },
  { id: 'temp-plus1.2', basis: TEMP_ESC, vitals: temp(37.9, 36.7), flag: true, escalate: true },
  { id: 'temp-38.2-unverified', basis: TEMP_ESC, vitals: { ...temp(38.2, 36.8), sensor_verified: false }, flag: true, escalate: false },
  { id: 'temp-40.1', basis: 'above 40 °C is a red-flag temperature', vitals: temp(40.1, 36.8), environment: 'mars_surface', flag: true, escalate: true },
  { id: 'temp-34.9-verified', basis: 'below 35 °C is a red-flag temperature (hypothermia line), so a verified reading should reach Ground Support', vitals: temp(34.9, 36.6), flag: true, escalate: true },
  { id: 'temp-35.1-verified', basis: '35 °C or below is the hypothermia line; 35.1 is above it', vitals: temp(35.1, 36.6), flag: true, escalate: false },

  // blood glucose
  { id: 'glu-70', basis: GLU, vitals: { blood_sugar_mg_dl: 70 }, flag: false, escalate: false },
  { id: 'glu-69', basis: GLU, vitals: { blood_sugar_mg_dl: 69 }, flag: true, escalate: false },
  { id: 'glu-53', basis: GLU, vitals: { blood_sugar_mg_dl: 53 }, flag: true, escalate: false },
  { id: 'glu-99', basis: GLU, vitals: { blood_sugar_mg_dl: 99 }, flag: false, escalate: false },
  { id: 'glu-126', basis: GLU, vitals: { blood_sugar_mg_dl: 126 }, flag: false, escalate: false },
  { id: 'glu-139', basis: GLU, vitals: { blood_sugar_mg_dl: 139 }, flag: false, escalate: false },
  { id: 'glu-140', basis: GLU, vitals: { blood_sugar_mg_dl: 140 }, flag: true, escalate: false },
  { id: 'glu-250', basis: GLU, vitals: { blood_sugar_mg_dl: 250 }, previous_conditions: 'Type 2 diabetes', flag: true, escalate: false },

  // breathing rate
  { id: 'rr-12', basis: RR, vitals: { respiratory_rate: 12 }, flag: false, escalate: false },
  { id: 'rr-11', basis: RR, vitals: { respiratory_rate: 11 }, flag: true, escalate: false },
  { id: 'rr-20', basis: RR, vitals: { respiratory_rate: 20 }, flag: false, escalate: false },
  { id: 'rr-21', basis: RR, vitals: { respiratory_rate: 21 }, flag: true, escalate: false },
  { id: 'rr-30-alone', basis: RR, vitals: { respiratory_rate: 30 }, flag: true, escalate: false },

  // sleep
  { id: 'sleep-7', basis: SLEEP, vitals: { sleep_hours: 7 }, flag: false, escalate: false },
  { id: 'sleep-6', basis: SLEEP, vitals: { sleep_hours: 6 }, flag: false, escalate: false },
  { id: 'sleep-5.5', basis: SLEEP, vitals: { sleep_hours: 5.5 }, flag: false, escalate: false },
  { id: 'sleep-5.4', basis: SLEEP, vitals: { sleep_hours: 5.4 }, flag: true, escalate: false },
  { id: 'sleep-3', basis: SLEEP, vitals: { sleep_hours: 3 }, flag: true, escalate: false },

  // mood
  { id: 'mood-stressed', basis: MOOD, vitals: { mood: 'stressed' }, flag: true, escalate: false },
  { id: 'mood-isolated', basis: MOOD, vitals: { mood: 'isolated' }, environment: 'deep_space_transit', flag: true, escalate: false },
  { id: 'mood-fatigued', basis: MOOD, vitals: { mood: 'fatigued' }, flag: false, escalate: false },
  { id: 'mood-focused', basis: MOOD, vitals: { mood: 'focused' }, flag: false, escalate: false },

  // pain
  { id: 'pain-3', basis: PAIN, pain: { region: 'lower_limbs', severity: 3 }, flag: false, escalate: false },
  { id: 'pain-4', basis: PAIN, pain: { region: 'spine_bone', severity: 4 }, flag: true, escalate: false },
  { id: 'pain-7', basis: PAIN, pain: { region: 'upper_limbs', severity: 7 }, flag: true, escalate: false },
  { id: 'pain-8', basis: PAIN, pain: { region: 'abdomen_nutrition', severity: 8 }, flag: true, escalate: true },
  { id: 'pain-10', basis: PAIN, pain: { region: 'head_neuro', severity: 10 }, flag: true, escalate: true },

  // exam findings
  { id: 'us-normal', basis: FIND, vitals: { ultrasound_finding: 'normal' }, flag: false, escalate: false },
  { id: 'us-optic-nerve', basis: FIND, vitals: { ultrasound_finding: 'optic_nerve_sheath_elevated' }, flag: true, escalate: true },
  { id: 'us-renal', basis: FIND, vitals: { ultrasound_finding: 'renal_debris_suspected' }, flag: true, escalate: true },
  { id: 'us-jugular', basis: FIND, vitals: { ultrasound_finding: 'jugular_venous_stasis' }, flag: true, escalate: true },
  { id: 'eye-strain', basis: FIND, vitals: { eye_exam_finding: 'mild_eye_strain' }, flag: false, escalate: false },
  { id: 'eye-hyperopia', basis: 'project line: a hyperopia shift is flagged but does not escalate', vitals: { eye_exam_finding: 'hyperopia_shift' }, flag: true, escalate: false },
  { id: 'eye-amsler', basis: FIND, vitals: { eye_exam_finding: 'amsler_grid_distortion' }, flag: true, escalate: true },
  { id: 'exams-not-performed', basis: FIND, vitals: { ultrasound_finding: 'not_performed', eye_exam_finding: 'not_performed' }, flag: false, escalate: false },

  // space weather
  { id: 'storm-normal-readings', basis: WEATHER, weather: { kp_index: 8, solar_flare: 'X2.0', sep_event: 'S3' }, environment: 'deep_space_transit', flag: false, escalate: false },
  { id: 'storm-hr-plus20', basis: WEATHER, vitals: hr(80, 60), weather: { kp_index: 7, sep_event: 'S2' }, flag: true, escalate: false },
  { id: 'storm-hr-plus35-alone', basis: WEATHER, vitals: hr(95, 60), weather: { kp_index: 9, solar_flare: 'X5.1', sep_event: 'S3' }, flag: true, escalate: false },
  { id: 'storm-o2-91-hr-high', basis: WEATHER, vitals: { spo2_pct: 91, ...hr(96, 60) }, weather: { kp_index: 7, sep_event: 'S2' }, flag: true, escalate: true },

  // standing check
  { id: 'stand-fall-20', basis: ORTHO, vitals: standing(120, 78, 100, 70), environment: 'lunar_base', flag: true, escalate: false },
  { id: 'stand-fall-19-9', basis: ORTHO, vitals: standing(120, 78, 101, 69), environment: 'lunar_base', flag: false, escalate: false },
  { id: 'stand-fall-dia-10', basis: ORTHO, vitals: standing(120, 78, 112, 68), environment: 'mars_surface', flag: true, escalate: false },
  { id: 'stand-no-gravity', basis: ORTHO, vitals: standing(120, 78, 95, 60), environment: 'iss_leo', flag: false, escalate: false },
  { id: 'stand-earth', basis: ORTHO, vitals: standing(118, 76, 96, 70), environment: 'earth_preflight', flag: true, escalate: false },

  // high heart rate with blood pressure
  { id: 'hr-high-bp-142', basis: HR_BP, vitals: { ...hr(96, 60), ...bp(142, 85) }, flag: true, escalate: true },
  { id: 'hr-high-bp-138', basis: HR_BP, vitals: { ...hr(96, 60), ...bp(138, 85) }, flag: true, escalate: false },
  { id: 'hr-high-bp-142-unverified', basis: HR_BP, vitals: { ...hr(96, 60), ...bp(142, 85), sensor_verified: false }, flag: true, escalate: false },
]

/** The full request for a case. */
export function requestFor(c: HeldOutCase): Record<string, unknown> {
  return {
    ...BASE_REQUEST,
    environment: c.environment ?? BASE_REQUEST.environment,
    profile: { ...BASE_REQUEST.profile, previous_conditions: c.previous_conditions ?? BASE_REQUEST.profile.previous_conditions },
    vitals: { ...BASE_REQUEST.vitals, ...c.vitals },
    ...(c.pain ? { pain_points: [c.pain] } : {}),
    ...(c.weather ? { space_weather: c.weather } : {}),
  }
}
