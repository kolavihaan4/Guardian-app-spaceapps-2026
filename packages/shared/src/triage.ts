/**
 * Astronaut Self-Assessment, Mission Environments, 5 NASA Spaceflight Hazards,
 * Interactive Body Regions, and Overarching AI (Qwen3-8B) Triage contracts.
 */

export type MissionEnvironmentId =
  | 'iss_leo'
  | 'lunar_base'
  | 'deep_space_transit'
  | 'mars_surface'
  | 'eva_spacewalk'
  | 'earth_preflight'

export interface MissionEnvironmentInfo {
  id: MissionEnvironmentId
  name: string
  shortLabel: string
  gravity: string
  commsDelay: string
  radiationLevel: 'Low (Magnetosphere)' | 'Elevated (LEO/SAA)' | 'High (Deep Space / Unshielded)' | 'Variable (Surface Shielded)'
  expectedNorms: string
  /** Where the expectedDeltas come from. None are NASA thresholds; shown wherever the deltas are shown. */
  evidence: string
  environmentInsights: string[]
  expectedDeltas: {
    hrDeltaBpm: string
    bpShift: string
    spo2Note: string
    fluidShift: string
  }
}

export const MISSION_ENVIRONMENTS: Record<MissionEnvironmentId, MissionEnvironmentInfo> = {
  iss_leo: {
    id: 'iss_leo',
    name: 'Space Station (ISS · Low Earth Orbit)',
    shortLabel: 'ISS / LEO (0g)',
    gravity: '0g Microgravity',
    commsDelay: '< 2 sec (Near-real-time)',
    evidence: 'Project estimate informed by published ISS crew studies; varies by person and study.',
    radiationLevel: 'Elevated (LEO/SAA)',
    expectedNorms:
      'Cephalad fluid shift moves ~2L of fluid toward the head/chest; resting HR often sits near or slightly below preflight, while upright recovery Tolerance drops.',
    environmentInsights: [
      'Schedule 2.5 hrs/day on ARED + treadmill to counter 1–1.5%/month bone density loss.',
      'Monitor cabin CO2 partial pressure; levels > 3 mmHg commonly trigger frontal headaches and sleep fragmentation.',
      'Perform weekly SANS eye checks due to microgravity intracranial venous congestion.',
    ],
    expectedDeltas: {
      hrDeltaBpm: '-4 to +8 bpm vs preflight',
      bpShift: 'Mean arterial pressure -5 to -10 mmHg in microgravity',
      spo2Note: '96–99% typical (verify wrist strap fit as limb volume shrinks)',
      fluidShift: 'High cephalad shift (puffy face, nasal congestion, spinal elongation)',
    },
  },
  lunar_base: {
    id: 'lunar_base',
    name: 'Lunar Surface Base & Rover (Artemis)',
    shortLabel: 'Lunar Base (1/6g)',
    gravity: '0.16g Lunar Gravity',
    commsDelay: '1.3 sec one-way',
    evidence: 'Project estimate only. No resting baseline shift has been measured for long stays in lunar gravity.',
    radiationLevel: 'High (Deep Space / Unshielded)',
    expectedNorms:
      'Partial gravity reduces cephalad fluid pooling compared with 0g, but frequent surface EVAs increase metabolic load, dehydration risk, and lunar dust airway irritation.',
    environmentInsights: [
      'Check respiratory rate and SpO2 after airlock repressurization to screen for ultrafine lunar regolith inhalation.',
      'Verify NOAA/DONKI solar energetic particle (SEP) alerts before rover excursions beyond storm-shelter range.',
      'Use partial-gravity balance and knee/ankle loading drills to prevent loping-gait strains.',
    ],
    expectedDeltas: {
      hrDeltaBpm: '+5 to +18 bpm during habitat/rover ops',
      bpShift: 'Near preflight baseline; orthostatic dip post-EVA',
      spo2Note: '95–99% in habitat; monitor after dusty suit doffing',
      fluidShift: 'Moderate redistribution; partial gravity aids venous return',
    },
  },
  deep_space_transit: {
    id: 'deep_space_transit',
    name: 'Deep Space Transit Spacecraft (Mars Transfer)',
    shortLabel: 'Deep Space Craft (0g)',
    gravity: '0g Microgravity',
    commsDelay: '5 to 22 min one-way',
    evidence: 'Project estimate extrapolated from ISS microgravity studies. No long-duration human deep-space transit data exists.',
    radiationLevel: 'High (Deep Space / Unshielded)',
    expectedNorms:
      'Long-duration 0g deconditioning combined with Galactic Cosmic Rays (GCR), strict confinement, and delayed Ground Support requires high crew autonomy.',
    environmentInsights: [
      'Autonomous triage is primary: Flight Surgeon responses may take up to 44 minutes round-trip.',
      'Strict circadian lighting + 8h sleep window protects immune and behavioral stability in confined transit.',
      'Track fasting glucose and kidney hydration closely—microgravity bone calcium release elevates renal stone risk.',
    ],
    expectedDeltas: {
      hrDeltaBpm: '0 to +12 bpm; watch HRV trend for cumulative stress',
      bpShift: 'Reduced baroreflex sensitivity; cephalad venous stasis',
      spo2Note: '96–99% nominal',
      fluidShift: 'Persistent cephalad shift + progressive neuro-ocular (SANS) risk',
    },
  },
  mars_surface: {
    id: 'mars_surface',
    name: 'Planetary Surface Habitat (Mars Base)',
    shortLabel: 'Mars Surface (3/8g)',
    gravity: '0.38g Martian Gravity',
    commsDelay: '4 to 22 min one-way',
    evidence: 'Project estimate only. No human has been to Mars, so no Mars vital-sign data exists.',
    radiationLevel: 'Variable (Surface Shielded)',
    expectedNorms:
      'Transitioning from months of 0g transit into 0.38g gravity stresses cardiovascular orthostasis, vestibular balance, and weakened load-bearing bones.',
    environmentInsights: [
      'Gradually ramp resistive and locomotive workout intensity during the first 14 sols after landing.',
      'Monitor blood pressure seated and standing to track post-transit orthostatic adaptation.',
      'Maintain strict dust-lock decontamination protocols to prevent perchlorate dust exposure.',
    ],
    expectedDeltas: {
      hrDeltaBpm: '+10 to +22 bpm on standing after 0g transit',
      bpShift: 'Orthostatic systolic drop (-10 to -20 mmHg) during early surface adaptation',
      spo2Note: '95–99% inside pressurized habitat',
      fluidShift: 'Re-pooling to lower extremities; monitor for lightheadedness',
    },
  },
  eva_spacewalk: {
    id: 'eva_spacewalk',
    name: 'EVA / Spacewalk Suit Operations',
    shortLabel: 'EVA Spacewalk',
    gravity: 'Microgravity / Surface EVA',
    commsDelay: 'Relay via Habitat',
    evidence: 'Project estimate based on EVA workload reports; task-related, not a resting baseline.',
    radiationLevel: 'High (Deep Space / Unshielded)',
    expectedNorms:
      'High upper-body exertion in a 4.3 psi pressurized suit elevates heart rate, core temperature, and respiratory rate; motion artifacts on wrist wearables are common.',
    environmentInsights: [
      'Optical wrist SpO2 sensors frequently slip during pressurized glove/suit work—always verify sensor contact before acting on low SpO2 flags.',
      'Target 250–400 mL/hr in-suit hydration to prevent thermal strain and decompression sickness risk.',
      'Abort or pause high-exertion tasks if verified core temp exceeds 38.0°C or HR remains > 80% max for 10+ minutes.',
    ],
    expectedDeltas: {
      hrDeltaBpm: '+25 to +55 bpm during active EVA tasks',
      bpShift: 'Systolic elevation with upper-body isometric grip work',
      spo2Note: 'High motion-artifact rate on wrist sensors; verify at rest',
      fluidShift: 'Sweat loss + suit pressure point fatigue in hands/shoulders',
    },
  },
  earth_preflight: {
    id: 'earth_preflight',
    name: 'Earth Preflight Baseline (JSC Clinical Lab)',
    shortLabel: 'Earth Baseline (1g)',
    gravity: '1.0g Standard Earth Gravity',
    commsDelay: 'Instant (On-site)',
    evidence: 'General resting-adult reference ranges; the personal preflight median takes priority.',
    radiationLevel: 'Low (Magnetosphere)',
    expectedNorms:
      'Personal preflight baseline readings (L-92, L-44, L-3) establish each astronaut’s individual reference median prior to launch.',
    environmentInsights: [
      'Log resting morning vitals to lock in personal preflight median before launch.',
      'Consumer wearables (Apple Watch / HealthKit) act as Earth-analog telemetry stand-ins; wrist SpO2 carries ±2–4% optical error.',
      'Compare all in-flight deviations against your personal preflight median alongside clinical reference ranges.',
    ],
    expectedDeltas: {
      hrDeltaBpm: '0 bpm (Personal Reference Baseline)',
      bpShift: '110–120 / 70–80 mmHg typical resting baseline',
      spo2Note: '97–100% sea-level baseline',
      fluidShift: 'Normal 1g hydrostatic gradient',
    },
  },
}

export interface SpaceHazardInfo {
  id: string
  code: string
  name: string
  summary: string
  healthRisks: string[]
  keyIndicators: string[]
  countermeasure: string
}

export const FIVE_NASA_HAZARDS: SpaceHazardInfo[] = [
  {
    id: 'radiation',
    code: 'H1',
    name: 'Space Radiation',
    summary: 'Galactic cosmic rays (GCR) and solar particle events (SPE) outside Earth’s magnetosphere.',
    healthRisks: ['Immune system suppression', 'Acute radiation syndrome (during SPE)', 'Cardiovascular endothelial strain', 'Cataracts & CNS effects'],
    keyIndicators: ['NOAA S-scale & Kp Index', 'Body Temperature', 'Heart Rate & HRV', 'Fatigue / Nausea'],
    countermeasure: 'Monitor DONKI/NOAA proton flux, move to storm shelter during ≥ S2 events, maintain antioxidant nutrition.',
  },
  {
    id: 'isolation',
    code: 'H2',
    name: 'Isolation & Confinement',
    summary: 'Small crew quarters, circadian disruption, and prolonged sensory monotony.',
    healthRisks: ['Behavioral & mood changes', 'Sleep loss & circadian desynchrony', 'Cognitive fatigue', 'Stress hormone elevation'],
    keyIndicators: ['Daily Sleep Hours', 'Mood Check-in', 'Resting HR & HRV', 'Blood Sugar'],
    countermeasure: 'Blue-enriched morning light, 8-hour protected sleep window, structured crew social time & mindfulness.',
  },
  {
    id: 'distance',
    code: 'H3',
    name: 'Distance from Earth',
    summary: 'Up to 22-minute one-way comms delay and no medical evacuation capability.',
    healthRisks: ['Delayed Flight Surgeon intervention', 'Limited onboard pharmacy & diagnostic inventory', 'Autonomous medical triage pressure'],
    keyIndicators: ['Multi-vital drift status', 'Onboard Ultrasound & Eye Exam', 'Available Tools Inventory'],
    countermeasure: 'Onboard local AI decision-support (Qwen3-8B), portable ultrasound guides, and clear Ground Support escalation thresholds.',
  },
  {
    id: 'gravity',
    code: 'H4',
    name: 'Gravity Fields (0g / Partial g)',
    summary: 'Weightlessness and gravity transitions alter bones, muscles, inner ear, and fluid distribution.',
    healthRisks: ['1–1.5%/month bone density loss', 'Muscle atrophy', 'SANS vision changes', 'Orthostatic intolerance & kidney stones'],
    keyIndicators: ['Blood Pressure', 'Eye Exam (SANS)', 'Ultrasound', 'Spine/Leg Pain', 'Exercise Adherence'],
    countermeasure: 'ARED resistive workouts + cycle/treadmill sessions, 2.5L+ daily hydration, and lower-body negative pressure.',
  },
  {
    id: 'environment',
    code: 'H5',
    name: 'Hostile / Closed Environments',
    summary: 'Recycled cabin air, elevated CO2 pockets, acoustic noise, microbial shifts, and planetary dust.',
    healthRisks: ['CO2-induced headaches', 'Respiratory irritation from lunar/Martian dust', 'Skin & immune sensitization', 'Thermal stress in EVA suits'],
    keyIndicators: ['SpO2 (%)', 'Respiratory Rate', 'Body Temperature', 'Head / Chest Symptoms'],
    countermeasure: 'Cabin air filtration & CO2 scrubbing checks, post-EVA airway monitoring, and suit thermal pacing.',
  },
]

export type BodyRegionId =
  | 'head_neuro'
  | 'eyes_sans'
  | 'chest_cardio'
  | 'abdomen_nutrition'
  | 'spine_bone'
  | 'upper_limbs'
  | 'lower_limbs'

export interface BodyRegionInfo {
  id: BodyRegionId
  name: string
  functionSummary: string
  spaceflightRisks: string[]
  linkedIndicators: string[]
  selfCheckInstruction: string
  recommendedTools: string[]
}

export const BODY_REGIONS: Record<BodyRegionId, BodyRegionInfo> = {
  head_neuro: {
    id: 'head_neuro',
    name: 'Head & Neuro-Vestibular',
    functionSummary: 'Regulates balance, spatial orientation, cognition, sleep-wake cycles, and cerebral blood flow.',
    spaceflightRisks: [
      'Cephalad fluid shift ("puffy head" sinus pressure & congestion)',
      'CO2 accumulation headaches in low-airflow cabin zones',
      'Vestibular spatial disorientation during gravity transitions',
    ],
    linkedIndicators: ['Blood Pressure', 'Sleep Hours', 'Mood', 'Body Temperature'],
    selfCheckInstruction: 'Check cabin CO2 sensor, take seated blood pressure, and note if headache improves after moving to a ventilated module.',
    recommendedTools: ['Blood Pressure Cuff', 'Thermometer', 'Cabin CO2 & Air Monitor', 'Sleep & Circadian Light Mask'],
  },
  eyes_sans: {
    id: 'eyes_sans',
    name: 'Eyes & Optic Nerve (SANS)',
    functionSummary: 'Visual acuity and ocular pressure stability; highly sensitive to microgravity intracranial fluid shifts.',
    spaceflightRisks: [
      'Spaceflight-Associated Neuro-ocular Syndrome (SANS)',
      'Optic disc edema & optic nerve sheath distension',
      'Globe flattening causing hyperopic (farsighted) vision shift',
    ],
    linkedIndicators: ['Eye Exam Finding', 'Ultrasound (Ocular)', 'Blood Pressure'],
    selfCheckInstruction: 'Test near/far reading on the Amsler grid at 30 cm (one eye at a time) and perform a 2-minute ocular ultrasound scan if lines appear wavy or blurred.',
    recommendedTools: ['Eye Exam Kit (Fundoscope & Amsler)', 'Portable Ultrasound', 'Blood Pressure Cuff'],
  },
  chest_cardio: {
    id: 'chest_cardio',
    name: 'Chest, Cardiovascular & Lungs',
    functionSummary: 'Maintains systemic oxygen delivery, arterial pressure regulation, and respiratory gas exchange.',
    spaceflightRisks: [
      'Aerobic and cardiac muscle deconditioning in 0g',
      'Reduced baroreceptor reflex causing post-landing dizziness',
      'Airway irritation from cabin particulates or lunar/Mars dust',
    ],
    linkedIndicators: ['Heart Rate (bpm)', 'Blood Pressure (mmHg)', 'SpO2 (%)', 'Respiratory Rate (br/min)'],
    selfCheckInstruction: 'Rest quietly for 5 minutes, verify pulse oximeter finger/wrist placement, and measure heart rate, SpO2, and blood pressure.',
    recommendedTools: ['Pulse Oximeter', 'Blood Pressure Cuff', 'Portable Ultrasound'],
  },
  abdomen_nutrition: {
    id: 'abdomen_nutrition',
    name: 'Abdomen, Renal & Metabolism',
    functionSummary: 'Fluid balance, glucose metabolism, nutrient absorption, and renal filtration of mobilized bone calcium.',
    spaceflightRisks: [
      'Increased kidney stone risk (hypercalciuria + concentrated urine)',
      'Altered insulin sensitivity and elevated blood glucose in spaceflight',
      'Slowed GI motility and dehydration',
    ],
    linkedIndicators: ['Blood Sugar (mg/dL)', 'Sodium & Creatinine (Baseline Lab)', 'Ultrasound (Renal)'],
    selfCheckInstruction: 'Check fasting or pre-meal blood glucose with the Glucometer, consume 500 mL water with electrolytes, and perform a flank ultrasound if experiencing abdominal/back pain.',
    recommendedTools: ['Glucometer', 'Hydration & Electrolyte Pack', 'Portable Ultrasound'],
  },
  spine_bone: {
    id: 'spine_bone',
    name: 'Spine & Skeletal System',
    functionSummary: 'Structural support and mineral reservoir; unloads in microgravity causing disc expansion and calcium loss.',
    spaceflightRisks: [
      'Spinal elongation (+3 to 5 cm) causing lumbar stretching pain',
      '1–1.5% monthly bone mineral loss in spine, hip, and femur',
      'Intervertebral disc herniation risk upon return to gravity',
    ],
    linkedIndicators: ['Pain Severity (0–10)', 'Resistive Workout Adherence', 'Sleep Quality'],
    selfCheckInstruction: 'Use fetal-tuck knees-to-chest stretching in sleep restraint; switch ARED axial squats to low-load mobility if acute lumbar pain exceeds 5/10.',
    recommendedTools: ['ARED Resistive Exercise System', 'Sleep & Circadian Light Mask'],
  },
  upper_limbs: {
    id: 'upper_limbs',
    name: 'Shoulders, Arms & Hands',
    functionSummary: 'Primary locomotion and tool manipulation in microgravity and pressurized EVA gloves.',
    spaceflightRisks: [
      'Rotator cuff impingement from pressurized EVA suit bearings',
      'Forearm/hand fatigue and fingernail delamination during spacewalks',
      'Loose wrist-wearable sensor contact as fluid shifts out of limbs',
    ],
    linkedIndicators: ['Heart Rate', 'SpO2 Sensor Quality', 'Workout Load'],
    selfCheckInstruction: 'Check wrist sensor strap snugness (1 finger-width above wrist bone) and reduce upper-body ARED press load if shoulder soreness is present.',
    recommendedTools: ['Pulse Oximeter', 'ARED Resistive Exercise System'],
  },
  lower_limbs: {
    id: 'lower_limbs',
    name: 'Legs, Hips & Antigravity Muscles',
    functionSummary: 'Postural and locomotive muscles (calves, quadriceps, glutes) and venous capacitance vessels.',
    spaceflightRisks: [
      'Rapid atrophy of soleus and quadriceps without daily resistive loading',
      '"Bird-legs" fluid shift reducing lower-limb volume by ~10%',
      'Deep venous stasis and post-flight muscle strain',
    ],
    linkedIndicators: ['Daily Exercise Minutes', 'Heart Rate Recovery', 'Blood Pressure'],
    selfCheckInstruction: 'Complete scheduled ARED heel raises/squats and cycle ergometer intervals; adjust resistance down 20% if joint pain or elevated resting HR is flagged.',
    recommendedTools: ['ARED Resistive Exercise System', 'Cycle Ergometer', 'Hydration & Electrolyte Pack'],
  },
}

export const ONBOARD_TOOLS = [
  'Pulse Oximeter',
  'Blood Pressure Cuff',
  'Glucometer',
  'Thermometer',
  'Portable Ultrasound',
  'Eye Exam Kit (Fundoscope & Amsler)',
  'ARED Resistive Exercise System',
  'Cycle Ergometer',
  'Hydration & Electrolyte Pack',
  'Sleep & Circadian Light Mask',
  'Cabin CO2 & Air Monitor',
] as const

export type MoodStatus = 'optimal' | 'focused' | 'fatigued' | 'stressed' | 'isolated'
export type UltrasoundFinding =
  | 'not_performed'
  | 'normal'
  | 'optic_nerve_sheath_elevated'
  | 'renal_debris_suspected'
  | 'jugular_venous_stasis'
export type EyeExamFinding =
  | 'not_performed'
  | 'normal_20_20'
  | 'hyperopia_shift'
  | 'amsler_grid_distortion'
  | 'mild_eye_strain'

export interface PainPoint {
  region: BodyRegionId
  severity: number // 1–10
  note?: string
}

export interface AstronautProfile {
  crew_id: string
  age: number
  height_cm: number
  weight_kg: number
  gender: string
  previous_conditions: string
}

export interface TriageVitalsInput {
  hr_bpm: number
  preflight_hr_median: number
  spo2_pct: number
  bp_systolic?: number
  bp_diastolic?: number
  /** Taken within 3 minutes of standing; only meaningful where there is gravity. */
  standing_bp_systolic?: number
  standing_bp_diastolic?: number
  standing_hr_bpm?: number
  blood_sugar_mg_dl?: number
  temp_c?: number
  preflight_temp_median?: number
  respiratory_rate?: number
  sleep_hours?: number
  mood?: MoodStatus
  ultrasound_finding?: UltrasoundFinding
  eye_exam_finding?: EyeExamFinding
  sensor_verified?: boolean
}

export interface TriageRequest {
  crew_id: string
  environment?: MissionEnvironmentId
  profile?: AstronautProfile
  vitals: TriageVitalsInput
  pain_points?: PainPoint[]
  space_weather?: {
    kp_index?: number
    solar_flare?: string
    sep_event?: string
  }
  available_tools: string[]
}

export interface TriageResponse {
  overall_status: 'nominal' | 'caution' | 'alert'
  data_quality_check: string
  baseline_comparison: string
  environment_insight: string
  common_causes: string[]
  confirmation_prompt: string
  available_tool_action_plan: string[]
  workout_modification: string
  simple_instructions: string[]
  contact_ground_support: boolean
  ground_support_reason: string | null
}

export interface TriageEnvelope {
  source: string
  disclaimer: string
  triage: TriageResponse
}


export type BloodPressureCategory = 'normal' | 'elevated' | 'stage_1' | 'stage_2'

export const BP_REFERENCE_SOURCE = '2025 AHA/ACC adult guideline, Earth clinic reference'

const BP_CATEGORY_LABELS: Record<BloodPressureCategory, string> = {
  normal: 'Normal range (below 120 and below 80)',
  elevated: 'Elevated range (120–129 and below 80)',
  stage_1: 'Stage 1 range (130–139 or 80–89)',
  stage_2: 'Stage 2 range (140 or higher, or 90 or higher)',
}

/**
 * Places one blood pressure reading in the 2025 AHA/ACC adult categories (doi:10.1161/HYP.0000000000000249).
 * These are Earth clinic reference ranges, not in-flight limits, and the guideline assigns a category
 * only from an average of two or more readings on two or more occasions, so this labels a reading
 * and never a person. The guideline defines no low-pressure category.
 */
export function classifyBloodPressure(
  systolic: number,
  diastolic: number,
): { category: BloodPressureCategory; label: string } {
  const category: BloodPressureCategory =
    systolic >= 140 || diastolic >= 90
      ? 'stage_2'
      : systolic >= 130 || diastolic >= 80
        ? 'stage_1'
        : systolic >= 120
          ? 'elevated'
          : 'normal'
  return { category, label: BP_CATEGORY_LABELS[category] }
}

export const ORTHOSTATIC_REFERENCE_SOURCE = '2024 AHA scientific statement on orthostatic hypotension, Earth clinic reference'

export interface OrthostaticChange {
  systolicDrop: number
  diastolicDrop: number
  /** True when the fall on standing reaches 20 mmHg systolic or 10 mmHg diastolic. */
  meetsCriterion: boolean
  /** Heart-rate rise divided by systolic fall; only when a standing heart rate was given and systolic fell. */
  hrToSystolicRatio?: number
  summary: string
}

/**
 * Compares a resting blood pressure with one taken within 3 minutes of standing, using the
 * criterion in the AHA statement (doi:10.1161/HYP.0000000000000236): a sustained fall of at least
 * 20 mmHg systolic or 10 mmHg diastolic. The statement notes a person's systolic readings vary by
 * 10 to over 20 mmHg, so one pair can meet the criterion by chance; this labels a pair of readings,
 * never a person, and always asks for a repeat. Standing tests need gravity, so this does not apply in 0g.
 */
export function assessOrthostaticChange(
  resting: { systolic: number; diastolic: number; hrBpm?: number },
  standing: { systolic: number; diastolic: number; hrBpm?: number },
): OrthostaticChange {
  const systolicDrop = resting.systolic - standing.systolic
  const diastolicDrop = resting.diastolic - standing.diastolic
  const meetsCriterion = systolicDrop >= 20 || diastolicDrop >= 10
  const hrRise = resting.hrBpm !== undefined && standing.hrBpm !== undefined ? standing.hrBpm - resting.hrBpm : undefined
  const hrToSystolicRatio = hrRise !== undefined && systolicDrop > 0 ? Number((hrRise / systolicDrop).toFixed(2)) : undefined
  const fall = (n: number) => (n >= 0 ? `fell ${n}` : `rose ${-n}`)
  const ratioNote =
    !meetsCriterion || hrToSystolicRatio === undefined
      ? ''
      : hrToSystolicRatio >= 0.5
        ? ` Heart rate rose ${hrRise} bpm (ratio ${hrToSystolicRatio}), a response the statement associates with reversible factors such as low fluid volume.`
        : ` Heart rate rose only ${hrRise} bpm (ratio ${hrToSystolicRatio}), a smaller response than expected for this fall; include it in Flight Surgeon review.`
  const summary =
    `On standing, systolic ${fall(systolicDrop)} and diastolic ${fall(diastolicDrop)} mmHg (${standing.systolic}/${standing.diastolic} standing). ` +
    (meetsCriterion
      ? `This pair meets the orthostatic drop criterion (20 systolic or 10 diastolic within 3 minutes) on the ${ORTHOSTATIC_REFERENCE_SOURCE}; readings vary enough for one pair to meet it by chance, so repeat after 5 minutes lying down.`
      : `This is below the orthostatic drop criterion (20 systolic or 10 diastolic within 3 minutes) on the ${ORTHOSTATIC_REFERENCE_SOURCE}.`) +
    ratioNote
  return { systolicDrop, diastolicDrop, meetsCriterion, hrToSystolicRatio, summary }
}

/** Environments with enough gravity for a standing blood pressure test to mean anything. */
export const GRAVITY_ENVIRONMENTS: readonly MissionEnvironmentId[] = ['lunar_base', 'mars_surface', 'earth_preflight']
