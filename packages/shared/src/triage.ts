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
    evidence: 'Norsk et al. 2015 (J Physiol): 24-hour blood pressure 8–10 mmHg lower and heart rate unchanged in eight astronauts after 85–192 days on the ISS. One small study; varies by person.',
    radiationLevel: 'Elevated (LEO/SAA)',
    expectedNorms:
      'Fluids shift toward the head and chest and may put pressure on the eyes (NASA); average heart rate was unchanged in the one long-duration study, while tolerance of standing drops on return to gravity.',
    environmentInsights: [
      'Keep to the scheduled resistive and aerobic exercise: weight-bearing bones lose on average 1–1.5% of mineral density per month in spaceflight (NASA).',
      'Check cabin CO2: NASA limits the one-hour average to 3 mmHg, and crew reports link headaches to roughly 2.8–4.5 mmHg and poor sleep to 3.5 mmHg (NASA OCHMO-TB-004).',
      'Perform weekly SANS eye checks due to microgravity intracranial venous congestion.',
    ],
    expectedDeltas: {
      hrDeltaBpm: 'Unchanged on average (24-hour mean 64 vs 63 bpm)',
      bpShift: '24-hour systolic about 8, diastolic 9 and mean 10 mmHg lower than on Earth',
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
    evidence: 'Project estimate only. No resting baseline shift has been measured for long stays in lunar gravity. Jones 2021 (NASA, ICES-2021-142) concludes that gravity below 0.4 g is probably insufficient to maintain heart, muscle and bone conditioning, with deconditioning probably less severe than in 0g. Beck 2018 measured a heart-rate rise on standing of about 21 bpm in lunar gravity in 14 people during parabolic flight.',
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
    commsDelay: '3 to 22 min one-way',
    evidence: 'Project estimate only. No human has been to Mars, so no Mars vital-sign data exists. Jones 2021 (NASA, ICES-2021-142) concludes that gravity below 0.4 g is probably insufficient to maintain heart, muscle and bone conditioning, with deconditioning probably less severe than in 0g. The standing heart-rate figure is from 14 people in parabolic flight (Beck 2018).',
    radiationLevel: 'Variable (Surface Shielded)',
    expectedNorms:
      'Transitioning from months of 0g transit into 0.38g gravity stresses cardiovascular orthostasis, vestibular balance, and weakened load-bearing bones.',
    environmentInsights: [
      'Gradually ramp resistive and locomotive workout intensity during the first 14 sols after landing.',
      'Monitor blood pressure seated and standing to track post-transit orthostatic adaptation.',
      'Maintain strict dust-lock decontamination protocols to prevent perchlorate dust exposure.',
    ],
    expectedDeltas: {
      hrDeltaBpm: 'About +23 bpm on standing in Mars gravity, against +34 on Earth (Beck 2018)',
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
      'Consumer wearables (Apple Watch / HealthKit) act as Earth-analog telemetry stand-ins; pulse oximetry may read 2% to 4% higher or lower than the true level (MedlinePlus), so confirm low readings with a fingertip oximeter.',
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
  /** The crew member's own usual SpO2; a fall of 3 points or more from it prompts a recheck. */
  preflight_spo2_median?: number
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


export type BloodPressureCategory = 'normal' | 'elevated' | 'stage_1' | 'stage_2' | 'severe'

export const BP_REFERENCE_SOURCE = '2025 AHA/ACC adult guideline, Earth clinic reference'

const BP_CATEGORY_LABELS: Record<BloodPressureCategory, string> = {
  normal: 'Normal range (below 120 and below 80)',
  elevated: 'Elevated range (120–129 and below 80)',
  stage_1: 'Stage 1 range (130–139 or 80–89)',
  stage_2: 'Stage 2 range (140 or higher, or 90 or higher)',
  severe: 'Severe range (above 180 or above 120); repeat within minutes and report any new symptoms to Ground Support',
}

/**
 * Places one blood pressure reading in the 2025 AHA/ACC adult categories (doi:10.1161/HYP.0000000000000249).
 * These are Earth clinic reference ranges, not in-flight limits, and the guideline assigns a category
 * only from an average of two or more readings on two or more occasions, so this labels a reading
 * and never a person. The guideline defines no low-pressure category. It calls a pressure above
 * 180/120 without signs of organ damage "severe hypertension" (confirmed from summaries of the
 * guideline, not its full text).
 */
export function classifyBloodPressure(
  systolic: number,
  diastolic: number,
): { category: BloodPressureCategory; label: string } {
  const category: BloodPressureCategory =
    systolic > 180 || diastolic > 120
      ? 'severe'
      : systolic >= 140 || diastolic >= 90
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

export const LSAH_REFERENCE_SOURCE = 'NASA LSAH astronaut averages, sitting, Earth clinic (1998)'

/**
 * Mean sitting blood pressure by age group for astronauts in NASA's Longitudinal Study of Astronaut
 * Health, from NASA LSDA dataset IDP-LSDA_DATASET-0000000000001812 (file JMLSAHNEWSV722_152; the CSV
 * in information(DATASETS)/ is the source of these numbers and a test keeps the two in step).
 * Averages only: the dataset gives no sample sizes or spread, was measured on Earth, and has no
 * values for women aged 50 and over. Each entry is [systolic, diastolic] in mmHg.
 */
export const LSAH_ASTRONAUT_BP: Record<'male' | 'female', Record<string, readonly [number, number]>> = {
  male: {
    'under 35': [116.56, 73.23],
    '35–39': [114.81, 74.13],
    '40–44': [115.87, 75.12],
    '45–49': [117.19, 77.14],
    '50–54': [120.15, 78.58],
    '55–59': [120.65, 78.93],
    '60 and over': [121.86, 79.51],
  },
  female: {
    'under 35': [101.57, 65.0],
    '35–39': [105.68, 69.44],
    '40–44': [101.73, 65.64],
    '45–49': [103.4, 68.0],
  },
}

function lsahAgeGroup(age: number): string {
  if (age < 35) return 'under 35'
  if (age < 40) return '35–39'
  if (age < 45) return '40–44'
  if (age < 50) return '45–49'
  if (age < 55) return '50–54'
  if (age < 60) return '55–59'
  return '60 and over'
}

/**
 * Compares a reading with the LSAH astronaut average for the crew member's age group and sex.
 * Returns undefined when the dataset has no matching group (sex not recorded as male or female,
 * or women aged 50 and over). An average shows what is typical, not what is safe.
 */
export function compareWithAstronautAverage(
  systolic: number,
  diastolic: number,
  age: number,
  gender: string,
): { averageSystolic: number; averageDiastolic: number; group: string; summary: string } | undefined {
  const g = gender.trim().toLowerCase()
  const sex = g === 'male' || g === 'm' || g === 'man' ? 'male' : g === 'female' || g === 'f' || g === 'woman' ? 'female' : undefined
  if (!sex) return undefined
  const ageGroup = lsahAgeGroup(age)
  const average = LSAH_ASTRONAUT_BP[sex][ageGroup]
  if (!average) return undefined
  const [averageSystolic, averageDiastolic] = [Math.round(average[0]), Math.round(average[1])]
  const diff = (n: number) => (n === 0 ? 'level with' : `${Math.abs(n)} ${n > 0 ? 'above' : 'below'}`)
  const group = `${sex === 'male' ? 'men' : 'women'} aged ${ageGroup}`
  const summary =
    `Astronaut average for ${group} is ${averageSystolic}/${averageDiastolic} mmHg (${LSAH_REFERENCE_SOURCE}); ` +
    `this reading is systolic ${diff(Math.round(systolic - average[0]))} and diastolic ${diff(Math.round(diastolic - average[1]))} that average, which shows what is typical, not what is safe`
  return { averageSystolic, averageDiastolic, group, summary }
}

export const HR_REFERENCE_SOURCE = 'resting adult range 60–100 bpm (StatPearls Vital Sign Assessment; Cleveland Clinic), Earth reference'

/**
 * 24-hour average heart rate in healthy adults aged 50–65 wearing an ambulatory ECG
 * (Persson et al., Heart 2024, doi:10.1136/heartjnl-2023-323681, n=3942): 2.5th–97.5th percentile
 * of the 24-hour mean, and the average lowest one-minute rate. Applies to a day-long wearable
 * average, never to a single reading.
 */
export const AMBULATORY_HR_REFERENCE = {
  male: { mean24hLow: 57, mean24hHigh: 90, averageMinimum: 48 },
  female: { mean24hLow: 61, mean24hHigh: 92, averageMinimum: 51 },
} as const

export type HeartRateBand = 'below_range' | 'within_range' | 'above_range'

/**
 * Places one heart-rate reading against the 60–100 bpm resting adult range. The range applies only
 * to a reading taken awake and at rest, so `atRest: false` (exercise, EVA) returns no band. A rate
 * below 60 is common in fit adults and in sleep, so the personal preflight median always takes
 * priority over this range.
 */
export function classifyRestingHeartRate(
  hrBpm: number,
  preflightMedian: number,
  atRest: boolean,
): { band?: HeartRateBand; summary: string } {
  const delta = Math.round(hrBpm - preflightMedian)
  const vsBaseline = `${delta >= 0 ? '+' : ''}${delta} bpm vs personal preflight median ${preflightMedian} bpm, which takes priority`
  if (!atRest) {
    return { summary: `HR ${hrBpm} bpm (${vsBaseline}): not compared with the ${HR_REFERENCE_SOURCE}, because that range applies only awake and at rest, not during exercise or EVA` }
  }
  const band: HeartRateBand = hrBpm < 60 ? 'below_range' : hrBpm > 100 ? 'above_range' : 'within_range'
  const note =
    band === 'below_range'
      ? 'below the range; rates in the 40s and 50s are common in fit adults and in sleep (healthy adults average a lowest one-minute rate near 48–51 bpm over 24 hours), so judge it against the personal median and symptoms'
      : band === 'above_range'
        ? 'above the range for a reading at rest; confirm the crew member was awake and resting for 5 minutes, then repeat'
        : 'within the range'
  return { band, summary: `HR ${hrBpm} bpm (${vsBaseline}): ${note} on the ${HR_REFERENCE_SOURCE}` }
}

export const RR_REFERENCE_SOURCE = 'resting adult range 12–20 breaths/min (KORA-FF4 population study, 5th–95th percentile 12.1–20.1), Earth reference'

/**
 * Night-time respiratory rate from a wrist wearable in 10,000 adults aged 20–69 (Natarajan et al.,
 * NPJ Digit Med 2021, doi:10.1038/s41746-021-00493-6): mean 15.4, with 95% of values in this range.
 * Applies only to a rate measured during sleep, never to a waking reading.
 */
export const SLEEP_RR_REFERENCE = { low: 11.2, high: 20.0, mean: 15.4 } as const

/**
 * Conditions that the KORA-FF4 study (Rückert-Eheberg et al., PLoS One 2025,
 * doi:10.1371/journal.pone.0318502; 2,224 adults aged 39–88, awake at rest) found associated with
 * a resting respiratory rate of 18.6 breaths/min or more, with the adjusted odds ratio. An
 * association in a population, not a prediction for one person.
 */
const RR_ASSOCIATED_CONDITIONS: { match: RegExp; name: string; oddsRatio: number }[] = [
  { match: /\bcopd\b|chronic obstructive/i, name: 'COPD', oddsRatio: 1.86 },
  { match: /pre-?diabet/i, name: 'pre-diabetes', oddsRatio: 1.39 },
  { match: /diabet/i, name: 'diabetes', oddsRatio: 1.78 },
  { match: /smok/i, name: 'smoking', oddsRatio: 1.66 },
  { match: /obes/i, name: 'abdominal obesity', oddsRatio: 2.12 },
]

export type RespiratoryRateBand = 'below_range' | 'within_range' | 'above_range'

/**
 * Places one respiratory-rate reading against the 12–20 breaths/min resting adult range. The range
 * applies only awake and at rest, so `atRest: false` (exercise, EVA) returns no band. If the
 * recorded medical history names a condition the KORA-FF4 study linked to faster resting
 * breathing, the summary says so, because that person's usual rate may sit higher.
 */
export function classifyRespiratoryRate(
  breathsPerMin: number,
  atRest: boolean,
  medicalHistory = '',
): { band?: RespiratoryRateBand; summary: string } {
  if (!atRest) {
    return { summary: `RR ${breathsPerMin} br/min: not compared with the ${RR_REFERENCE_SOURCE}, because that range applies only awake and at rest, not during exercise or EVA` }
  }
  const band: RespiratoryRateBand = breathsPerMin < 12 ? 'below_range' : breathsPerMin > 20 ? 'above_range' : 'within_range'
  const note =
    band === 'within_range'
      ? 'within the range'
      : `${band === 'below_range' ? 'below' : 'above'} the range for a reading at rest; count breaths for a full 60 seconds after 5 minutes of rest, then repeat`
  // "pre-diabetes" also contains "diabet": report the first, more specific match only.
  const condition = RR_ASSOCIATED_CONDITIONS.find((c) => c.match.test(medicalHistory))
  const history = condition
    ? `. Recorded history mentions ${condition.name}, which the KORA-FF4 study linked to faster resting breathing (odds ratio ${condition.oddsRatio} for 18.6 br/min or more), so compare with this person's own earlier readings`
    : ''
  return { band, summary: `RR ${breathsPerMin} br/min: ${note} on the ${RR_REFERENCE_SOURCE}${history}` }
}

export const GLUCOSE_REFERENCE_SOURCE = 'ADA Standards of Care 2026 and NIDDK fasting ranges, Earth reference'

export type GlucoseBand = 'low' | 'fasting_normal' | 'above_fasting_normal' | 'fasting_line' | 'random_line'

/**
 * Medicines and conditions that Section 2 of the ADA Standards of Care 2026
 * (doi:10.2337/dc26-S002) says raise the risk of glucose abnormalities or shift readings.
 */
const GLUCOSE_HISTORY_NOTES: { match: RegExp; note: string }[] = [
  { match: /diabet/i, note: 'recorded history mentions diabetes or pre-diabetes, so these screening ranges do not describe this person; use the targets set with the Flight Surgeon' },
  { match: /steroid|glucocortic|prednis|dexameth|hydrocortis/i, note: 'recorded history mentions a glucocorticoid, which the ADA lists as raising glucose' },
  { match: /statin|thiazide|antipsychotic/i, note: 'recorded history mentions a medicine the ADA lists as raising the risk of glucose abnormalities' },
]

/**
 * Places one glucose reading against the fasting ranges: normal is 99 mg/dL or below (NIDDK),
 * 100–125 is the impaired-fasting range and 126 or above is the fasting criterion (ADA 2026,
 * Tables 2.1 and 2.2), and 200 or above is the criterion for a reading taken at any time. Fasting
 * means at least 8 hours without calories, so the fasting ranges mean nothing after a meal; the
 * app does not know when the crew member last ate, and says so. The ADA requires two abnormal
 * results before any category applies to a person, so this labels a reading only.
 *
 * `flag` marks a reading worth acting on whatever the meal timing: below 70, or 140 and above
 * (NIDDK gives 139 or below as normal two hours after a glucose load). The below-70 line is the
 * widely used low-glucose threshold; the ADA section that defines it (Section 6) could not be
 * retrieved when this was written, so it is not attributed to that document.
 */
export function classifyBloodGlucose(mgPerDl: number, medicalHistory = ''): { band: GlucoseBand; flag: boolean; summary: string } {
  const band: GlucoseBand =
    mgPerDl < 70 ? 'low' : mgPerDl <= 99 ? 'fasting_normal' : mgPerDl <= 125 ? 'above_fasting_normal' : mgPerDl < 200 ? 'fasting_line' : 'random_line'
  const label = {
    low: 'below 70 mg/dL, a low reading; recheck now and follow the low-glucose procedure',
    fasting_normal: 'within the normal fasting range (99 or below)',
    above_fasting_normal: 'above the normal fasting range (100–125); this only means something after 8 hours without food',
    fasting_line: 'at or above the 126 fasting line; this only means something after 8 hours without food',
    random_line: 'at or above 200, the line that applies at any time of day',
  }[band]
  const history = GLUCOSE_HISTORY_NOTES.find((h) => h.match.test(medicalHistory))
  const context =
    band === 'fasting_normal'
      ? ''
      : '; one reading does not set a category (the ADA requires two abnormal results), and recent exercise, illness or acute stress can shift glucose'
  return {
    band,
    flag: mgPerDl < 70 || mgPerDl >= 140,
    summary: `Glucose ${mgPerDl} mg/dL: ${label} on the ${GLUCOSE_REFERENCE_SOURCE}${context}${history ? `; ${history.note}` : ''}`,
  }
}

export const SPO2_REFERENCE_SOURCE = 'BTS 2017 oxygen guideline, Earth reference'

export type OxygenSaturationBand = 'within_target' | 'within_lower_target' | 'below_target' | 'severe_line' | 'below_85'

/**
 * Conditions the BTS guideline (doi:10.1136/bmjresp-2016-000170, recommendations A3 and G5) lists
 * as risk factors for hypercapnic respiratory failure, for which it suggests an 88–92% target.
 */
const LOWER_SPO2_TARGET_CONDITIONS: { match: RegExp; name: string }[] = [
  { match: /copd|chronic obstructive|emphysema/i, name: 'COPD' },
  { match: /cystic fibrosis/i, name: 'cystic fibrosis' },
  { match: /bronchiectasis/i, name: 'bronchiectasis' },
  { match: /neuromuscular|chest.wall|kyphoscoliosis/i, name: 'a neuromuscular or chest-wall condition' },
  { match: /morbid(ly)? obes|obesity hypoventilation/i, name: 'morbid obesity or obesity hypoventilation' },
]

/**
 * Places one SpO2 reading against the BTS 2017 guideline. Its target is 94–98% (A2); that is a
 * target for acutely ill adults, used here as the reference line because the concise guideline
 * gives no separate healthy-adult range. For people with the conditions above it suggests 88–92%,
 * so the 94 line is not applied to them. 88% or below is the American Thoracic Society's line for
 * severe resting hypoxaemia (doi:10.1164/rccm.202009-3608ST), and below 85% is where the BTS
 * starts high-flow oxygen (D1). A fall of 3 points or more from the person's own baseline, even
 * inside the range, "should prompt fuller assessment of the patient (and the oximeter signal)"
 * (A4): the guideline means a sudden fall in a monitored patient, so this is a prompt to recheck.
 *
 * `flag` marks a reading that should raise the status to caution. This labels a reading only and
 * recommends no oxygen treatment.
 */
export function classifyOxygenSaturation(
  spo2Pct: number,
  medicalHistory = '',
  baselinePct?: number,
): { band: OxygenSaturationBand; flag: boolean; summary: string } {
  const condition = LOWER_SPO2_TARGET_CONDITIONS.find((c) => c.match.test(medicalHistory))
  const band: OxygenSaturationBand =
    spo2Pct < 85 ? 'below_85' : spo2Pct <= 88 ? 'severe_line' : spo2Pct >= 94 ? 'within_target' : condition ? 'within_lower_target' : 'below_target'
  const label = {
    within_target: 'within the 94–98% target range',
    within_lower_target: `within the 88–92% range the guideline suggests for people with ${condition?.name}, which the recorded history mentions`,
    below_target: 'below the 94% line; check the sensor, then repeat at rest with a warm, still hand',
    severe_line: '88% or below, the American Thoracic Society line for severe low oxygen at rest; check the sensor and repeat now',
    below_85: 'below 85%, the line at which the guideline starts high-flow oxygen; check the sensor and repeat now',
  }[band]
  const fall = baselinePct === undefined ? 0 : Math.round((baselinePct - spo2Pct) * 10) / 10
  const fallNote =
    fall >= 3
      ? `; this is ${fall} points below this person's own baseline of ${baselinePct}%, and the guideline says a sudden fall of 3 or more, even within the range, should prompt a fuller check of the person and the oximeter signal`
      : ''
  const historyNote =
    condition && band !== 'within_lower_target'
      ? `; recorded history mentions ${condition.name}, for which the guideline suggests an 88–92% target, so compare with this person's own earlier readings`
      : ''
  return {
    band,
    flag: band === 'below_target' || band === 'severe_line' || band === 'below_85' || fall >= 3,
    summary: `SpO2 ${spo2Pct}%: ${label} on the ${SPO2_REFERENCE_SOURCE}${fallNote}${historyNote}`,
  }
}

export const SLEEP_REFERENCE_SOURCE = 'recommendation of 7 or more hours a night for adults (AASM and Sleep Research Society, cited in the AHA 2016 statement), Earth reference'

export type SleepBand = 'recommended' | 'short' | 'very_short'

/**
 * Places one night's sleep against the 7-hour adult recommendation quoted in the American Heart
 * Association's 2016 statement on sleep (doi:10.1161/CIR.0000000000000444), which defines short
 * sleep as under 7 hours. The caution line at 5.5 hours is the project's own: no source sets one.
 *
 * Below that line the summary adds what two small laboratory studies measured, as context for
 * reading the other vital signs and never as an adjustment to them. Thresholds for blood pressure
 * and glucose are not loosened after short sleep: a pooled analysis of six trials found no
 * significant change in blood pressure (Hu 2020, doi:10.1177/0193945919868143), and no source
 * supports explaining one person's raised reading by their sleep.
 */
export function classifySleepDuration(hours: number, glucoseAboveFastingNormal = false): { band: SleepBand; summary: string } {
  const band: SleepBand = hours >= 7 ? 'recommended' : hours >= 5.5 ? 'short' : 'very_short'
  if (band === 'recommended') return { band, summary: `Sleep ${hours} h: meets the ${SLEEP_REFERENCE_SOURCE}` }
  const heart =
    band === 'very_short'
      ? '; in a laboratory study of 15 men, five nights of 5 hours left daytime heart rate about 5.5 bpm and systolic pressure about 2.9 mmHg above baseline even after two recovery nights (Reichenberger 2023), so recovery can take more than two nights'
      : ''
  const glucose =
    band === 'very_short' && glucoseAboveFastingNormal
      ? '; two nights of about 4 hours raised the glucose peak after breakfast (about 122 against 110 mg/dL in 15 men, Schmid 2011) while fasting glucose was unchanged, so short sleep may add to a raised reading after a meal but does not explain it'
      : ''
  return { band, summary: `Sleep ${hours} h: below the ${SLEEP_REFERENCE_SOURCE}${heart}${glucose}` }
}

export const TEMPERATURE_REFERENCE_SOURCE = 'usual adult oral range 35.7–37.3 °C (Obermeyer 2017, 35,488 patients) and the Merck Manual fever line, Earth reference'

export type TemperatureBand = 'hypothermia_line' | 'below_range' | 'usual_range' | 'above_range' | 'fever_line' | 'red_flag'

/** Conditions and medicines the retrieved sources say shift temperature or blunt its regulation. */
const TEMPERATURE_HISTORY_NOTES: { match: RegExp; note: string }[] = [
  { match: /hypothyroid/i, note: 'recorded history mentions hypothyroidism, which is linked to a slightly lower baseline and trouble tolerating cold (Obermeyer 2017; NIDDK)' },
  { match: /hyperthyroid|graves/i, note: 'recorded history mentions hyperthyroidism, which causes trouble tolerating heat (NIDDK)' },
  { match: /beta.?blocker|olol\b|anticholinergic|antihistamine|tricyclic|antipsychotic|diuretic/i, note: 'recorded history mentions a medicine the CDC lists as reducing sweating or heat loss, so heat is tolerated less well' },
  { match: /paracetamol|acetaminophen|ibuprofen|aspirin|nsaid|steroid|prednis/i, note: 'recorded history mentions a medicine that lowers fever (Merck Manual), so a normal reading does not rule one out' },
]

/** Environments in weightlessness, where the ISS core-temperature finding applies. */
const WEIGHTLESS_ENVIRONMENTS: MissionEnvironmentId[] = ['iss_leo', 'deep_space_transit', 'eva_spacewalk']

/**
 * Places one oral temperature against published adult references. The usual range is the central
 * 95% of 35,488 outpatients (mean 36.6 °C; Obermeyer, BMJ 2017, doi:10.1136/bmj.j5468). The Merck
 * Manual counts an oral temperature of 37.8 °C or more as elevated at any time of day, lists above
 * 40 °C or below 35 °C as red flags, and defines hypothermia as a core temperature of 35 °C or
 * below. Temperature varies by about 0.6 °C through the day, lowest in the early morning.
 *
 * Resting core temperature rose about 1 °C over the first 2.5 months on the ISS in 11 astronauts
 * (Stahn, Sci Rep 2017, doi:10.1038/s41598-017-15560-w), so in weightlessness a raised reading is
 * noted as possibly adaptation. The note never removes a flag.
 *
 * `flag` marks a reading that should raise the status to caution: outside the usual range.
 */
export function classifyBodyTemperature(
  tempC: number,
  environment: MissionEnvironmentId = 'earth_preflight',
  medicalHistory = '',
  age?: number,
): { band: TemperatureBand; flag: boolean; summary: string } {
  const band: TemperatureBand =
    tempC <= 35 ? 'hypothermia_line' : tempC < 35.7 ? 'below_range' : tempC <= 37.3 ? 'usual_range' : tempC < 37.8 ? 'above_range' : tempC <= 40 ? 'fever_line' : 'red_flag'
  const label = {
    hypothermia_line: '35 °C or below, the line for hypothermia; recheck now and warm the person',
    below_range: 'below the usual range; oral readings can read falsely low, so recheck',
    usual_range: 'within the usual range',
    above_range: 'above the usual range and below the 37.8 °C fever line; temperature varies about 0.6 °C through the day and is highest in the late afternoon',
    fever_line: 'at or above the 37.8 °C fever line',
    red_flag: 'above 40 °C, a red-flag temperature',
  }[band]
  const raised = band === 'above_range' || band === 'fever_line' || band === 'red_flag'
  const space =
    raised && WEIGHTLESS_ENVIRONMENTS.includes(environment)
      ? '; resting core temperature rose about 1 °C over the first 2.5 months on the ISS in 11 astronauts (Stahn 2017), so compare with this person\'s earlier in-flight readings'
      : ''
  const recheck = band === 'usual_range' ? '' : '; wait 20–30 minutes after eating or drinking and an hour after hard exercise before rechecking'
  const older = age !== undefined && age >= 60 && band !== 'usual_range' ? '; adults aged 60 and over run about 0.2 °C lower on average' : ''
  const history = TEMPERATURE_HISTORY_NOTES.find((h) => h.match.test(medicalHistory))
  return {
    band,
    flag: band !== 'usual_range',
    summary: `${label} on the ${TEMPERATURE_REFERENCE_SOURCE}${space}${recheck}${older}${history ? `; ${history.note}` : ''}`,
  }
}

/**
 * Context for a self-reported mood, shown beside the readings. It never changes how a reading is
 * judged: in 21,923 people measured in daily life, reported stress went with a rise of about
 * 1 mmHg or less per step of a 0–4 scale (Gordon and Mendes, PNAS 2021, doi:10.1073/pnas.2105573118),
 * far too small to explain a raised reading. Returns undefined for moods that need no note.
 */
export function describeMood(mood: MoodStatus | undefined): string | undefined {
  if (mood === 'stressed') {
    return 'Mood reported as stressed: in 21,923 people measured in daily life, each step up a 0–4 stress scale went with about 1 mmHg or less of extra blood pressure and about 1 bpm of heart rate (Gordon and Mendes 2021), so reported stress does not explain a raised reading; a mental-arithmetic stress task raised heart rate about 7 bpm and mean pressure about 7 mmHg in five astronauts, the same in flight as on the ground (Aubert 2010)'
  }
  if (mood === 'isolated') {
    return 'Mood reported as isolated: in a 520-day simulated Mars mission, four of six crew members showed a behavioural disturbance or psychological distress, such as disturbed sleep or depressive symptoms (Basner 2014), and NASA lists sleep loss and circadian desynchronisation as compounding isolation'
  }
  if (mood === 'fatigued') {
    return 'Mood reported as fatigued: in a 520-day simulated Mars mission, sleeping six hours or fewer a day on a chronic basis was linked to more vigilance errors (Basner 2014)'
  }
  return undefined
}
