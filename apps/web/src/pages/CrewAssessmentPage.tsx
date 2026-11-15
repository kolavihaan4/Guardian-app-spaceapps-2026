import {
  BODY_REGIONS,
  FIVE_NASA_HAZARDS,
  MISSION_ENVIRONMENTS,
  ONBOARD_TOOLS,
  type BodyRegionId,
  type EyeExamFinding,
  type MissionEnvironmentId,
  type MoodStatus,
  type PainPoint,
  type TriageEnvelope,
  type TriageRequest,
  type UltrasoundFinding,
  BP_REFERENCE_SOURCE,
  GRAVITY_ENVIRONMENTS,
  LSAH_REFERENCE_SOURCE,
  classifyBloodPressure,
  compareWithAstronautAverage,
} from '@astrovitals/shared'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Card, useAsync } from '../components/common'
import { api } from '../lib/api'

type CrewId = 'C001' | 'C002' | 'C003' | 'C004'

const CREW_PROFILES: Record<
  CrewId,
  {
    age: number
    height_cm: number
    weight_kg: number
    gender: string
    previous_conditions: string
    hr_median: number
    temp_median: number
    glucose_median: number
  }
> = {
  C001: {
    age: 38,
    height_cm: 178,
    weight_kg: 76,
    gender: 'Male',
    previous_conditions: 'None; mild orthostatic sensitivity post-parabolic flight',
    hr_median: 60,
    temp_median: 36.7,
    glucose_median: 88,
  },
  C002: {
    age: 34,
    height_cm: 166,
    weight_kg: 62,
    gender: 'Female',
    previous_conditions: 'Prior mild motion sickness during centrifuge training',
    hr_median: 64,
    temp_median: 36.8,
    glucose_median: 92,
  },
  C003: {
    age: 43,
    height_cm: 182,
    weight_kg: 81,
    gender: 'Male',
    previous_conditions: 'Mild hyperopic shift (+0.5D) on prior 6-month ISS increment',
    hr_median: 58,
    temp_median: 36.6,
    glucose_median: 85,
  },
  C004: {
    age: 31,
    height_cm: 171,
    weight_kg: 67,
    gender: 'Female',
    previous_conditions: 'None; baseline vitamin D supplementation protocol',
    hr_median: 62,
    temp_median: 36.8,
    glucose_median: 90,
  },
}

interface DailyQuest {
  id: string
  title: string
  category: string
  xp: number
  instruction: string
  done: boolean
}

const INITIAL_QUESTS: DailyQuest[] = [
  {
    id: 'q1',
    title: '60-Min ARED Resistive Loading (Squats, Deadlifts, Heel Raises)',
    category: 'Gravity Hazard · Bone & Muscle',
    xp: 150,
    instruction: 'Perform 3 sets × 10 reps on the Advanced Resistive Exercise Device to counter 1–1.5%/month bone mineral loss.',
    done: true,
  },
  {
    id: 'q2',
    title: 'Consume 2.5L Water + Electrolyte Ration',
    category: 'Microgravity Fluid Shift · Renal Stone Prevention',
    xp: 100,
    instruction: 'Space out 500 mL pouches every 3 hours; adequate urine volume prevents calcium oxalate kidney stones.',
    done: true,
  },
  {
    id: 'q3',
    title: 'Log Morning Resting Vitals & Personal Baseline Check',
    category: 'Autonomous Self-Assessment',
    xp: 100,
    instruction: 'Measure HR, BP, SpO2, and Temp after 5 minutes at rest before caffeine or exercise.',
    done: true,
  },
  {
    id: 'q4',
    title: 'Monocular Amsler Grid & SANS Vision Check',
    category: 'Gravity Fields · Neuro-Ocular (SANS)',
    xp: 75,
    instruction: 'Hold Amsler chart at 30 cm, cover one eye, and check whether central grid lines appear wavy or blurred.',
    done: false,
  },
  {
    id: 'q5',
    title: '8-Hour Protected Sleep Window + Circadian Light Protocol',
    category: 'Isolation & Confinement · Behavioral Health',
    xp: 100,
    instruction: 'Switch cabin LEDs to 480nm blue-depleted warm spectrum 90 minutes before sleep station entry.',
    done: false,
  },
  {
    id: 'q6',
    title: 'Inspect Sleeping Quarters Airflow & CO2 Scrubbing Level',
    category: 'Hostile Closed Environment',
    xp: 50,
    instruction: 'Confirm fan intake is unobstructed and local pCO2 remains below 3.0 mmHg to prevent morning headaches.',
    done: false,
  },
]

function vitalBand(
  value: number,
  okMin: number,
  okMax: number,
  warnMin: number,
  warnMax: number,
): 'nominal' | 'caution' | 'alert' {
  if (value >= okMin && value <= okMax) return 'nominal'
  if (value >= warnMin && value <= warnMax) return 'caution'
  return 'alert'
}

// three.js is large, so the 3D body loads only when the triage page shows it.
const Body3D = lazy(() => import('../components/Body3D'))
const Anatomy3D = lazy(() => import('../components/Anatomy3D'))

export function CrewAssessmentPage() {
  // 1. Mission Environment (Whiteboard Feature #1, #6, #20)
  const [environment, setEnvironment] = useState<MissionEnvironmentId>('iss_leo')
  const envInfo = MISSION_ENVIRONMENTS[environment]

  // 2. Crew Profile & Vitals (Whiteboard #3-1)
  const [crewId, setCrewId] = useState<CrewId>('C001')
  const [age, setAge] = useState<number>(38)
  const [heightCm, setHeightCm] = useState<number>(178)
  const [weightKg, setWeightKg] = useState<number>(76)
  const [gender, setGender] = useState<string>('Male')
  const [conditions, setConditions] = useState<string>(CREW_PROFILES.C001.previous_conditions)

  const [hrBpm, setHrBpm] = useState<number>(64)
  const [preflightHr, setPreflightHr] = useState<number>(60)
  const [bpSys, setBpSys] = useState<number>(118)
  const [bpDia, setBpDia] = useState<number>(76)
  // The 3D body is the default; it switches itself off if WebGL or the model is unavailable.
  const [use3d, setUse3d] = useState(true)
  // The detailed anatomy model is tried first; if it cannot load, the simpler figure takes over.
  const [useAnatomy, setUseAnatomy] = useState(true)
  // Optional standing reading; empty means it was not taken, so nothing is sent.
  const [standSys, setStandSys] = useState<string>('')
  const [standDia, setStandDia] = useState<string>('')
  const [bloodSugar, setBloodSugar] = useState<number>(91)
  const [tempC, setTempC] = useState<number>(36.8)
  const [preflightTemp, setPreflightTemp] = useState<number>(36.7)
  const [spo2Pct, setSpo2Pct] = useState<number>(98)
  // Optional personal baseline; empty means none is known, so nothing is sent.
  const [spo2Baseline, setSpo2Baseline] = useState<string>('')
  const [respRate, setRespRate] = useState<number>(14)
  const [sleepHours, setSleepHours] = useState<number>(7.5)
  const [mood, setMood] = useState<MoodStatus>('optimal')
  const [ultrasound, setUltrasound] = useState<UltrasoundFinding>('normal')
  const [eyeExam, setEyeExam] = useState<EyeExamFinding>('normal_20_20')
  const [sensorVerified, setSensorVerified] = useState<boolean>(true)

  // Space Weather Context
  const [kpIndex, setKpIndex] = useState<number>(2)
  const [solarFlare, setSolarFlare] = useState<string>('None')
  const [sepEvent, setSepEvent] = useState<string>('None')

  // 3. Interactive Body Region & Pain Tracker
  const [selectedRegion, setSelectedRegion] = useState<BodyRegionId>('eyes_sans')
  const [painPoints, setPainPoints] = useState<PainPoint[]>([])

  // 4. Available Onboard Tools (Whiteboard Front End #7)
  const [availableTools, setAvailableTools] = useState<string[]>([
    'Pulse Oximeter',
    'Blood Pressure Cuff',
    'Glucometer',
    'Thermometer',
    'Portable Ultrasound',
    'Eye Exam Kit (Fundoscope & Amsler)',
    'ARED Resistive Exercise System',
    'Hydration & Electrolyte Pack',
  ])

  // 5. Overarching AI State
  const [triageResult, setTriageResult] = useState<TriageEnvelope | null>(null)
  const [triageLoading, setTriageLoading] = useState<boolean>(false)
  const [triageError, setTriageError] = useState<string | null>(null)
  const [crewConfirmation, setCrewConfirmation] = useState<string | null>(null)
  const [showBenchmark, setShowBenchmark] = useState<boolean>(false)

  // 6. Gamification & Daily Healthy Life (Whiteboard #5, #21)
  const [quests, setQuests] = useState<DailyQuest[]>(INITIAL_QUESTS)
  const [streakDays, setStreakDays] = useState<number>(14)

  const benchmark = useAsync(() => api.aiBenchmark(), [])

  const selectCrew = (id: CrewId) => {
    const p = CREW_PROFILES[id]
    setCrewId(id)
    setAge(p.age)
    setHeightCm(p.height_cm)
    setWeightKg(p.weight_kg)
    setGender(p.gender)
    setConditions(p.previous_conditions)
    setPreflightHr(p.hr_median)
    setPreflightTemp(p.temp_median)
    setBloodSugar(p.glucose_median)
  }

  const setRegionPain = (region: BodyRegionId, severity: number) => {
    setPainPoints((prev) => {
      const rest = prev.filter((p) => p.region !== region)
      return severity <= 0 ? rest : [...rest, { region, severity }]
    })
  }

  const getRegionPain = (region: BodyRegionId) => painPoints.find((p) => p.region === region)?.severity ?? 0

  const toggleTool = (tool: string) => {
    setAvailableTools((prev) => {
      if (prev.includes(tool)) {
        return prev.length > 1 ? prev.filter((t) => t !== tool) : prev
      }
      return [...prev, tool]
    })
  }

  const runAiTriage = async (overridePayload?: Partial<TriageRequest>) => {
    setTriageLoading(true)
    setTriageError(null)
    setCrewConfirmation(null)
    try {
      const payload: TriageRequest = {
        crew_id: crewId,
        environment,
        profile: {
          crew_id: crewId,
          age,
          height_cm: heightCm,
          weight_kg: weightKg,
          gender,
          previous_conditions: conditions,
        },
        vitals: {
          hr_bpm: hrBpm,
          preflight_hr_median: preflightHr,
          spo2_pct: spo2Pct,
          ...(spo2Baseline !== '' ? { preflight_spo2_median: Number(spo2Baseline) } : {}),
          bp_systolic: bpSys,
          bp_diastolic: bpDia,
          ...(standSys !== '' && standDia !== ''
            ? { standing_bp_systolic: Number(standSys), standing_bp_diastolic: Number(standDia) }
            : {}),
          blood_sugar_mg_dl: bloodSugar,
          temp_c: tempC,
          preflight_temp_median: preflightTemp,
          respiratory_rate: respRate,
          sleep_hours: sleepHours,
          mood,
          ultrasound_finding: ultrasound,
          eye_exam_finding: eyeExam,
          sensor_verified: sensorVerified,
        },
        pain_points: painPoints,
        space_weather: {
          kp_index: kpIndex,
          solar_flare: solarFlare,
          sep_event: sepEvent,
        },
        available_tools: availableTools,
        ...overridePayload,
      }
      const res = await api.aiTriage(payload)
      setTriageResult(res)
    } catch (e) {
      setTriageError((e as Error).message)
    } finally {
      setTriageLoading(false)
    }
  }

  // Run initial assessment on mount so the dashboard starts populated
  useEffect(() => {
    void runAiTriage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Demo Scenario Presets
  const loadScenario = (kind: 'nominal' | 'artifact' | 'sans_drift' | 'escalate') => {
    if (kind === 'nominal') {
      setEnvironment('iss_leo')
      setHrBpm(preflightHr + 3)
      setSpo2Pct(98)
      setBpSys(116)
      setBpDia(74)
      setBloodSugar(89)
      setTempC(preflightTemp)
      setRespRate(14)
      setSleepHours(7.8)
      setMood('optimal')
      setUltrasound('normal')
      setEyeExam('normal_20_20')
      setSensorVerified(true)
      setPainPoints([])
      setKpIndex(2)
      setSolarFlare('None')
      setSepEvent('None')
    } else if (kind === 'artifact') {
      setEnvironment('eva_spacewalk')
      setHrBpm(preflightHr + 52)
      setSpo2Pct(86)
      setBpSys(128)
      setBpDia(80)
      setBloodSugar(94)
      setTempC(preflightTemp + 0.2)
      setRespRate(18)
      setSleepHours(7.0)
      setMood('focused')
      setUltrasound('not_performed')
      setEyeExam('not_performed')
      setSensorVerified(false)
      setSelectedRegion('upper_limbs')
      setPainPoints([{ region: 'upper_limbs', severity: 3 }])
      setKpIndex(3)
      setSolarFlare('C4.0')
      setSepEvent('None')
    } else if (kind === 'sans_drift') {
      setEnvironment('iss_leo')
      setHrBpm(preflightHr + 20)
      setSpo2Pct(95)
      setBpSys(136)
      setBpDia(88)
      setBloodSugar(118)
      setTempC(Number((preflightTemp + 0.4).toFixed(1)))
      setRespRate(16)
      setSleepHours(5.0)
      setMood('fatigued')
      setUltrasound('optic_nerve_sheath_elevated')
      setEyeExam('hyperopia_shift')
      setSensorVerified(true)
      setSelectedRegion('eyes_sans')
      setPainPoints([
        { region: 'head_neuro', severity: 5 },
        { region: 'spine_bone', severity: 4 },
      ])
      setKpIndex(5)
      setSolarFlare('M1.8')
      setSepEvent('None')
    } else {
      setEnvironment('deep_space_transit')
      setHrBpm(preflightHr + 54)
      setSpo2Pct(90)
      setBpSys(152)
      setBpDia(96)
      setBloodSugar(148)
      setTempC(38.4)
      setRespRate(24)
      setSleepHours(4.2)
      setMood('stressed')
      setUltrasound('renal_debris_suspected')
      setEyeExam('amsler_grid_distortion')
      setSensorVerified(true)
      setSelectedRegion('chest_cardio')
      setPainPoints([
        { region: 'chest_cardio', severity: 7 },
        { region: 'abdomen_nutrition', severity: 8 },
      ])
      setKpIndex(7)
      setSolarFlare('X2.1')
      setSepEvent('S2')
    }
  }

  // Color coding status calculations for each vital indicator (Whiteboard #8)
  const hrStatus = vitalBand(hrBpm, preflightHr - 10, preflightHr + 15, preflightHr - 18, preflightHr + 34)
  const bpCategory = classifyBloodPressure(bpSys, bpDia)
  const astronautAverage = compareWithAstronautAverage(bpSys, bpDia, age, gender)
  // Colour follows the guideline category; the low side keeps the project's own cut-offs.
  const bpStatus: 'nominal' | 'caution' | 'alert' =
    bpCategory.category === 'stage_2' || bpSys < 88
      ? 'alert'
      : bpCategory.category !== 'normal' || bpSys < 95
        ? 'caution'
        : 'nominal'
  const spo2Status = vitalBand(spo2Pct, 94, 100, 89, 100)
  const tempStatus = vitalBand(tempC, 35.7, 37.3, 35.1, 37.9)
  const glucStatus = vitalBand(bloodSugar, 70, 99, 65, 139)
  const rrStatus = vitalBand(respRate, 12, 20, 8, 24)
  const sleepStatus = vitalBand(sleepHours, 7, 9.5, 5.0, 10.5)

  const totalXp = quests.filter((q) => q.done).reduce((sum, q) => sum + q.xp, 0)
  const maxXp = quests.reduce((sum, q) => sum + q.xp, 0)
  const readinessPct = Math.round((totalXp / maxXp) * 100)
  const regionDetail = BODY_REGIONS[selectedRegion]

  return (
    <div className="stack" style={{ gap: 18 }}>
      {/* 1. CHOOSE MISSION LOCATION / ENVIRONMENT (Whiteboard Feature #1, #6, #20) */}
      <section className="card env-banner">
        <div className="card-head">
          <div>
            <span className="eyebrow">Step 1 · Select Current Mission Environment</span>
            <h1 style={{ marginTop: 2 }}>🛰️ Crew Autonomous Health & Triage Console</h1>
          </div>
          <span className="spacer" />
          <div className="row" style={{ gap: 6 }}>
            <span className="badge">Comms Delay: {envInfo.commsDelay}</span>
            <span className="badge">Gravity: {envInfo.gravity}</span>
            <span className="badge">Radiation: {envInfo.radiationLevel}</span>
          </div>
        </div>

        <div className="env-grid" role="radiogroup" aria-label="Mission Environment">
          {(Object.keys(MISSION_ENVIRONMENTS) as MissionEnvironmentId[]).map((id) => {
            const m = MISSION_ENVIRONMENTS[id]
            const active = environment === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`env-pill${active ? ' active' : ''}`}
                onClick={() => setEnvironment(id)}
              >
                <strong>{m.shortLabel}</strong>
                <span>{m.gravity} · Comms {m.commsDelay}</span>
              </button>
            )
          })}
        </div>

        <div className="env-norms">
          <div>
            <strong>What’s the physiological norm in {envInfo.shortLabel}?</strong>
            <p className="muted" style={{ margin: '2px 0 0' }}>{envInfo.expectedNorms}</p>
          </div>
          <div className="env-deltas">
            <span><strong>HR Shift:</strong> {envInfo.expectedDeltas.hrDeltaBpm}</span>
            <span><strong>BP Shift:</strong> {envInfo.expectedDeltas.bpShift}</span>
            <span><strong>SpO₂ Note:</strong> {envInfo.expectedDeltas.spo2Note}</span>
            <span className="muted"><strong>Evidence:</strong> {envInfo.evidence}</span>
          </div>
        </div>
      </section>

      {/* DEMO SCENARIO PRESETS BAR */}
      <div className="card row" style={{ justifyContent: 'space-between', padding: '10px 16px' }}>
        <div className="row" style={{ gap: 8 }}>
          <strong>Quick Test Scenarios:</strong>
          <button type="button" onClick={() => loadScenario('nominal')}>🟢 Nominal Orbit Check-in</button>
          <button type="button" onClick={() => loadScenario('artifact')}>🟡 EVA Loose Sensor Artifact</button>
          <button type="button" onClick={() => loadScenario('sans_drift')}>🟠 SANS Vision + Fluid Shift</button>
          <button type="button" onClick={() => loadScenario('escalate')}>🔴 Deep Space S2 Storm Escalation</button>
        </div>
        <button type="button" className="primary" onClick={() => void runAiTriage()} disabled={triageLoading}>
          {triageLoading ? 'Running Qwen3-8B Triage…' : '⚡ Run Overarching AI Triage'}
        </button>
      </div>

      {/* 2. INTERACTIVE BODY MAP + COMPLETE VITALS & ASTRONAUT INPUT (Whiteboard #3-1) */}
      <div className="grid two triage-columns" style={{ alignItems: 'start' }}>
        {/* LEFT COLUMN: INTERACTIVE CLICKABLE HUMAN BODY */}
        <Card
          title="🧍 Interactive Crew Body Map — Click Region to Inspect & Log Pain"
          actions={
            painPoints.length > 0 ? (
              <button type="button" onClick={() => setPainPoints([])} style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}>
                Clear {painPoints.length} pain flag(s)
              </button>
            ) : (
              <span className="badge">No localized pain logged</span>
            )
          }
        >
          <div className="body-explorer">
            <div className="body-svg-wrap">
              {use3d ? (
                <Suspense fallback={<p className="body-3d-hint">Loading 3D body…</p>}>
                  {useAnatomy ? (
                    <Anatomy3D
                      sex={/^\s*(f|woman)/i.test(gender) ? 'female' : 'male'}
                      selected={selectedRegion}
                      pain={Object.fromEntries(painPoints.filter((p) => p.severity > 0).map((p) => [p.region, p.severity]))}
                      onSelect={setSelectedRegion}
                      onUnavailable={() => setUseAnatomy(false)}
                    />
                  ) : (
                    <Body3D
                      selected={selectedRegion}
                      pain={Object.fromEntries(painPoints.filter((p) => p.severity > 0).map((p) => [p.region, p.severity]))}
                      onSelect={setSelectedRegion}
                      onUnavailable={() => setUse3d(false)}
                    />
                  )}
                </Suspense>
              ) : (
                <svg viewBox="0 0 240 430" className="body-svg" role="img" aria-label="Interactive astronaut body diagram. Click any body region to view spaceflight health risks and log pain.">
                  <defs>
                    <radialGradient id="suitGlow" cx="50%" cy="45%" r="55%">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <circle cx="120" cy="210" r="115" fill="url(#suitGlow)" />

                  {/* Head & Neuro */}
                  <g
                    className={`body-zone ${selectedRegion === 'head_neuro' ? 'selected' : ''} ${getRegionPain('head_neuro') > 0 ? 'has-pain' : ''}`}
                    onClick={() => setSelectedRegion('head_neuro')}
                    role="button"
                    tabIndex={0}
                    aria-label="Head and Neuro-Vestibular"
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedRegion('head_neuro')}
                  >
                    <circle cx="120" cy="48" r="30" />
                    <title>Head & Neuro-Vestibular</title>
                  </g>

                  {/* Eyes & SANS */}
                  <g
                    className={`body-zone eyes ${selectedRegion === 'eyes_sans' ? 'selected' : ''} ${getRegionPain('eyes_sans') > 0 ? 'has-pain' : ''}`}
                    onClick={() => setSelectedRegion('eyes_sans')}
                    role="button"
                    tabIndex={0}
                    aria-label="Eyes and Optic Nerve (SANS)"
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedRegion('eyes_sans')}
                  >
                    <rect x="98" y="36" width="44" height="16" rx="8" />
                    <circle cx="110" cy="44" r="3.5" fill="currentColor" />
                    <circle cx="130" cy="44" r="3.5" fill="currentColor" />
                    <title>Eyes & Vision (SANS)</title>
                  </g>

                  {/* Chest, Heart & Lungs */}
                  <g
                    className={`body-zone ${selectedRegion === 'chest_cardio' ? 'selected' : ''} ${getRegionPain('chest_cardio') > 0 ? 'has-pain' : ''}`}
                    onClick={() => setSelectedRegion('chest_cardio')}
                    role="button"
                    tabIndex={0}
                    aria-label="Chest, Heart and Lungs"
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedRegion('chest_cardio')}
                  >
                    <rect x="82" y="86" width="76" height="68" rx="14" />
                    <path d="M106 120 h10 l4 -9 l6 18 l5 -9 h12" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
                    <title>Chest, Cardiovascular & Lungs</title>
                  </g>

                  {/* Spine & Bone (Center Pillar Overlay) */}
                  <g
                    className={`body-zone spine ${selectedRegion === 'spine_bone' ? 'selected' : ''} ${getRegionPain('spine_bone') > 0 ? 'has-pain' : ''}`}
                    onClick={() => setSelectedRegion('spine_bone')}
                    role="button"
                    tabIndex={0}
                    aria-label="Spine and Skeletal System"
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedRegion('spine_bone')}
                  >
                    <rect x="112" y="88" width="16" height="132" rx="6" />
                    <title>Spine & Skeletal Density</title>
                  </g>

                  {/* Abdomen, GI & Renal */}
                  <g
                    className={`body-zone ${selectedRegion === 'abdomen_nutrition' ? 'selected' : ''} ${getRegionPain('abdomen_nutrition') > 0 ? 'has-pain' : ''}`}
                    onClick={() => setSelectedRegion('abdomen_nutrition')}
                    role="button"
                    tabIndex={0}
                    aria-label="Abdomen, Renal and Metabolism"
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedRegion('abdomen_nutrition')}
                  >
                    <rect x="86" y="158" width="68" height="64" rx="12" />
                    <title>Abdomen, Renal & Metabolism</title>
                  </g>

                  {/* Upper Limbs (Shoulders, Arms, Hands) */}
                  <g
                    className={`body-zone ${selectedRegion === 'upper_limbs' ? 'selected' : ''} ${getRegionPain('upper_limbs') > 0 ? 'has-pain' : ''}`}
                    onClick={() => setSelectedRegion('upper_limbs')}
                    role="button"
                    tabIndex={0}
                    aria-label="Shoulders, Arms and Hands"
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedRegion('upper_limbs')}
                  >
                    <rect x="48" y="90" width="28" height="135" rx="13" />
                    <rect x="164" y="90" width="28" height="135" rx="13" />
                    <title>Shoulders, Arms & Hands (EVA / Wearable Strap)</title>
                  </g>

                  {/* Lower Limbs (Hips, Legs, Calves) */}
                  <g
                    className={`body-zone ${selectedRegion === 'lower_limbs' ? 'selected' : ''} ${getRegionPain('lower_limbs') > 0 ? 'has-pain' : ''}`}
                    onClick={() => setSelectedRegion('lower_limbs')}
                    role="button"
                    tabIndex={0}
                    aria-label="Legs, Hips and Antigravity Muscles"
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedRegion('lower_limbs')}
                  >
                    <rect x="86" y="228" width="30" height="172" rx="14" />
                    <rect x="124" y="228" width="30" height="172" rx="14" />
                    <title>Legs, Hips & Antigravity Muscles</title>
                  </g>
                </svg>
              )}
              <button type="button" className="zone-btn" onClick={() => setUse3d((v) => !v)} aria-pressed={use3d}>
                {use3d ? 'Switch to 2D diagram' : 'Switch to 3D body'}
              </button>

              <div className="body-zone-pills">
                {(Object.keys(BODY_REGIONS) as BodyRegionId[]).map((rId) => {
                  const p = getRegionPain(rId)
                  return (
                    <button
                      key={rId}
                      type="button"
                      className={`zone-btn ${selectedRegion === rId ? 'active' : ''} ${p > 0 ? 'pain' : ''}`}
                      onClick={() => setSelectedRegion(rId)}
                    >
                      {BODY_REGIONS[rId].name.split('&')[0]}
                      {p > 0 ? <span className="pain-pill">{p}/10</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Selected Body Region Details + Pain Slider */}
            <div className="body-detail stack">
              <div>
                <span className="eyebrow">Selected Body System</span>
                <h2>{regionDetail.name}</h2>
                <p className="muted">{regionDetail.functionSummary}</p>
              </div>

              <div className="pain-control">
                <label>
                  <span>
                    <strong>Locate & Rate Discomfort / Pain in {regionDetail.name}:</strong>{' '}
                    <span className={`status-chip ${getRegionPain(selectedRegion) >= 7 ? 'alert' : getRegionPain(selectedRegion) >= 3 ? 'caution' : 'nominal'}`}>
                      {getRegionPain(selectedRegion) === 0 ? '0/10 (No Pain)' : `${getRegionPain(selectedRegion)}/10 Severity`}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={getRegionPain(selectedRegion)}
                    onChange={(e) => setRegionPain(selectedRegion, Number(e.target.value))}
                  />
                </label>
              </div>

              <div>
                <h3>Spaceflight Risks in this Region</h3>
                <ul className="compact-list">
                  {regionDetail.spaceflightRisks.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="instruction-box">
                <strong>📋 Simple Self-Check Instruction:</strong>
                <p style={{ margin: '4px 0 0' }}>{regionDetail.selfCheckInstruction}</p>
              </div>

              <div className="row" style={{ gap: 6 }}>
                <small>Linked Indicators:</small>
                {regionDetail.linkedIndicators.map((ind) => (
                  <span key={ind} className="badge">{ind}</span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* RIGHT COLUMN: ASTRONAUT PROFILE, VITALS INPUT & AVAILABLE TOOLS */}
        <Card
          title="🩺 Step 2 · Astronaut Profile, Vitals & Exam Input"
          actions={<span className="badge">Color-Coded Status at a Glance</span>}
        >
          <div className="stack" style={{ gap: 12 }}>
            {/* Astronaut Profile Row (Whiteboard 3-1: Age, Height, Weight, Gender, Previous Medical Conditions) */}
            <div className="subcard">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>Astronaut Profile & Preflight Baseline (NASA OSD-575)</strong>
                <div className="row" style={{ gap: 4 }}>
                  {(Object.keys(CREW_PROFILES) as CrewId[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={crewId === id ? 'primary' : undefined}
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      onClick={() => selectCrew(id)}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-grid four">
                <label>
                  Age
                  <input type="number" value={age} onChange={(e) => setAge(Number(e.target.value))} />
                </label>
                <label>
                  Height (cm)
                  <input type="number" value={heightCm} onChange={(e) => setHeightCm(Number(e.target.value))} />
                </label>
                <label>
                  Weight (kg)
                  <input type="number" value={weightKg} onChange={(e) => setWeightKg(Number(e.target.value))} />
                </label>
                <label>
                  Gender
                  <input type="text" value={gender} onChange={(e) => setGender(e.target.value)} />
                </label>
              </div>
              <label style={{ marginTop: 6 }}>
                Previous Medical Conditions / Flight History
                <input type="text" value={conditions} onChange={(e) => setConditions(e.target.value)} />
              </label>
            </div>

            {/* Vital Signs Grid with Live Green/Amber/Red Color Coding (Whiteboard #3-1 & #8) */}
            <div className="form-grid three">
              <label className={`vital-input ${hrStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Heart Rate (bpm)</span>
                  <span className={`status-dot ${hrStatus}`} title={`Preflight baseline: ${preflightHr} bpm`} />
                </span>
                <input type="number" value={hrBpm} onChange={(e) => setHrBpm(Number(e.target.value))} />
                <small>Baseline median: {preflightHr} bpm ({hrBpm - preflightHr >= 0 ? `+${hrBpm - preflightHr}` : hrBpm - preflightHr})</small>
              </label>

              <label className={`vital-input wide ${bpStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Blood Pressure (mmHg)</span>
                  <span className={`status-dot ${bpStatus}`} />
                </span>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <input type="number" value={bpSys} onChange={(e) => setBpSys(Number(e.target.value))} aria-label="Systolic BP" />
                  <span>/</span>
                  <input type="number" value={bpDia} onChange={(e) => setBpDia(Number(e.target.value))} aria-label="Diastolic BP" />
                </div>
                <small>{bpCategory.label}. {BP_REFERENCE_SOURCE}, not an in-flight limit.</small>
                <small>
                  {astronautAverage
                    ? `Astronaut average, ${astronautAverage.group}: ${astronautAverage.averageSystolic}/${astronautAverage.averageDiastolic} mmHg. ${LSAH_REFERENCE_SOURCE}.`
                    : 'No NASA LSAH astronaut average for this age and gender.'}
                </small>
                <span style={{ marginTop: 6 }}>Standing BP, within 3 min (optional)</span>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <input type="number" value={standSys} onChange={(e) => setStandSys(e.target.value)} aria-label="Standing systolic BP" />
                  <span>/</span>
                  <input type="number" value={standDia} onChange={(e) => setStandDia(e.target.value)} aria-label="Standing diastolic BP" />
                </div>
                <small>
                  {GRAVITY_ENVIRONMENTS.includes(environment)
                    ? 'Compared with the resting reading: a fall of 20 systolic or 10 diastolic meets the orthostatic drop criterion.'
                    : 'A standing test needs gravity, so it is not assessed in this environment.'}
                </small>
              </label>

              <label className={`vital-input ${glucStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Blood Sugar (mg/dL)</span>
                  <span className={`status-dot ${glucStatus}`} />
                </span>
                <input type="number" value={bloodSugar} onChange={(e) => setBloodSugar(Number(e.target.value))} />
                <small>Normal fasting range: 70–99 mg/dL (ADA 2026, NIDDK). Fasting means 8 hours without food.</small>
              </label>

              <label className={`vital-input ${tempStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Body Temp (°C)</span>
                  <span className={`status-dot ${tempStatus}`} />
                </span>
                <input type="number" step="0.1" value={tempC} onChange={(e) => setTempC(Number(e.target.value))} />
                <small>Preflight baseline: {preflightTemp}°C. Usual adult oral range: 35.7–37.3 °C (Obermeyer 2017); 37.8 °C or more counts as fever (Merck Manual). Earth reference.</small>
              </label>

              <label className={`vital-input ${spo2Status}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>O₂ Saturation SpO₂ (%)</span>
                  <span className={`status-dot ${spo2Status}`} />
                </span>
                <input type="number" value={spo2Pct} onChange={(e) => setSpo2Pct(Number(e.target.value))} />
                <input type="number" value={spo2Baseline} onChange={(e) => setSpo2Baseline(e.target.value)} placeholder="Usual SpO₂ (optional)" aria-label="Usual SpO2 baseline, optional" />
                <small>Target range: 94–98% (BTS 2017), Earth reference; 88–92% for some lung conditions. A fall of 3 points from the usual value prompts a recheck.</small>
              </label>

              <label className={`vital-input ${rrStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Respiratory Rate (br/m)</span>
                  <span className={`status-dot ${rrStatus}`} />
                </span>
                <input type="number" value={respRate} onChange={(e) => setRespRate(Number(e.target.value))} />
                <small>Resting adult range: 12–20 breaths/min (KORA-FF4), Earth reference</small>
              </label>

              <label className={`vital-input ${sleepStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Daily Sleep (hours)</span>
                  <span className={`status-dot ${sleepStatus}`} />
                </span>
                <input type="number" step="0.5" value={sleepHours} onChange={(e) => setSleepHours(Number(e.target.value))} />
                <small>Recommended for adults: 7 or more hours a night (AASM and SRS, via AHA 2016), Earth reference</small>
              </label>

              <label className={`vital-input ${mood === 'optimal' || mood === 'focused' ? 'nominal' : mood === 'fatigued' ? 'caution' : 'alert'}`}>
                <span>Psyche / Mood Check-in</span>
                <select value={mood} onChange={(e) => setMood(e.target.value as MoodStatus)}>
                  <option value="optimal">Optimal / Rested</option>
                  <option value="focused">Focused / High Workload</option>
                  <option value="fatigued">Fatigued / Circadian Drift</option>
                  <option value="stressed">Stressed / High Cognitive Load</option>
                  <option value="isolated">Isolated / Confinement Strain</option>
                </select>
                <small>Behavioral & psychological status</small>
              </label>

              <label className={`vital-input ${sensorVerified ? 'nominal' : 'caution'}`}>
                <span>Sensor Contact Status</span>
                <button
                  type="button"
                  onClick={() => setSensorVerified((v) => !v)}
                  style={{ textAlign: 'left', fontWeight: 600 }}
                >
                  {sensorVerified ? '✅ Sensor Snug & Verified' : '⚠️ Unverified (Possible Motion/Slip)'}
                </button>
                <small>Check before escalating SpO₂/HR spikes</small>
              </label>
            </div>

            {/* Specialized Spaceflight Exams: Ultrasound & Eye Exam (SANS) */}
            <div className="form-grid two">
              <label>
                <strong>Portable Ultrasound Finding</strong>
                <select value={ultrasound} onChange={(e) => setUltrasound(e.target.value as UltrasoundFinding)}>
                  <option value="not_performed">Not performed today</option>
                  <option value="normal">Normal ocular, cardiac & renal sweep</option>
                  <option value="optic_nerve_sheath_elevated">Optic nerve sheath &gt; 5.8 mm (SANS indicator)</option>
                  <option value="renal_debris_suspected">Renal shadowing / micro-calculi suspected</option>
                  <option value="jugular_venous_stasis">Internal jugular venous stasis / sluggish flow</option>
                </select>
              </label>
              <label>
                <strong>Eye Exam / SANS Vision Check</strong>
                <select value={eyeExam} onChange={(e) => setEyeExam(e.target.value as EyeExamFinding)}>
                  <option value="not_performed">Not performed today</option>
                  <option value="normal_20_20">20/20 acuity · Clear Amsler grid</option>
                  <option value="mild_eye_strain">Mild display / lighting eye strain</option>
                  <option value="hyperopia_shift">Hyperopic (near-focus) shift detected</option>
                  <option value="amsler_grid_distortion">Amsler central grid distortion / scotoma</option>
                </select>
              </label>
            </div>

            {/* Available Onboard Tools Selector (Whiteboard Front End #7) */}
            <div className="subcard">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <strong>🧰 Available Onboard Medical & Countermeasure Tools ({availableTools.length} selected)</strong>
                <small>AI treatment & workout plans strictly use only checked tools</small>
              </div>
              <div className="tools-grid">
                {ONBOARD_TOOLS.map((tool) => {
                  const active = availableTools.includes(tool)
                  return (
                    <button
                      key={tool}
                      type="button"
                      className={`tool-chip${active ? ' active' : ''}`}
                      aria-pressed={active}
                      onClick={() => toggleTool(tool)}
                    >
                      {active ? '✓ ' : '+ '}
                      {tool}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              type="button"
              className="primary"
              style={{ width: '100%', padding: '0.65rem 1rem', fontWeight: 700 }}
              onClick={() => void runAiTriage()}
              disabled={triageLoading}
            >
              {triageLoading ? 'Analyzing Vitals, Body Map & Environment…' : '🧠 Evaluate Health Indicators & Generate Action Plan'}
            </button>
          </div>
        </Card>
      </div>

      {/* 3. OVERARCHING AI (QWEN3-8B) TRIAGE & WORKOUT MODIFICATION PANEL (Whiteboard Feature #4, #3-1, #9) */}
      <section className={`card ai-panel ${triageResult?.triage.overall_status ?? 'nominal'}`}>
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}>
            <span className={`status-pill ${triageResult?.triage.overall_status ?? 'nominal'}`}>
              {triageResult?.triage.overall_status === 'alert'
                ? '🔴 ALERT · ESCALATE TO GROUND SUPPORT'
                : triageResult?.triage.overall_status === 'caution'
                  ? '🟡 CAUTION · MONITOR & VERIFY'
                  : '🟢 NOMINAL · WITHIN MISSION BASELINE'}
            </span>
            <h2>Crew Decision-Support</h2>
            {triageResult ? <span className="badge">Answered by: {triageResult.source}</span> : null}
          </div>
          <span className="spacer" />
          <button type="button" onClick={() => setShowBenchmark((v) => !v)} style={{ fontSize: '0.8rem' }}>
            {showBenchmark ? 'Hide LLM Benchmark' : '📊 View Qwen3-8B vs 4B vs Gemma 3 Benchmark'}
          </button>
        </div>

        {triageError ? <div className="banner error">{triageError}</div> : null}

        {triageResult ? (
          <div className="stack" style={{ gap: 12 }}>
            {/* Ground Support Alert Banner when contact_ground_support is true */}
            {triageResult.triage.contact_ground_support ? (
              <div className="banner error pulse-border" role="alert">
                <strong>🚨 CONTACT FLIGHT SURGEON / GROUND SUPPORT IMMEDIATELY:</strong>{' '}
                {triageResult.triage.ground_support_reason} (Current one-way comms delay: <strong>{envInfo.commsDelay}</strong> — execute onboard action plan while telemetry packet transmits).
              </div>
            ) : null}

            <div className="grid two">
              <div className="subcard stack">
                <div>
                  <h3>1. Sensor & Data-Quality Check</h3>
                  <p>{triageResult.triage.data_quality_check}</p>
                </div>
                <div>
                  <h3>2. Personal Baseline & Location Norm Comparison</h3>
                  {/* The comparison is a run of separate facts joined by " · "; one per line reads far better. */}
                  <ul className="compact-list">
                    {triageResult.triage.baseline_comparison.split(' · ').map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>3. Mission Environment Insight ({envInfo.shortLabel})</h3>
                  <p>{triageResult.triage.environment_insight}</p>
                </div>
                <div>
                  <h3>4. Common Non-Diagnostic Spaceflight Causes</h3>
                  <ul className="compact-list">
                    {triageResult.triage.common_causes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="subcard stack">
                {/* Interactive Confirmation Prompt (Whiteboard Feature #4: "Ask them to confirm") */}
                <div className="confirm-box">
                  <h3>5. Crew Confirmation Check</h3>
                  <p style={{ fontWeight: 600 }}>{triageResult.triage.confirmation_prompt}</p>
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <button
                      type="button"
                      className={crewConfirmation === 'confirmed_normal' ? 'primary' : undefined}
                      onClick={() => setCrewConfirmation('confirmed_normal')}
                    >
                      ✅ Confirmed: Sensor Snug & Feeling Stable
                    </button>
                    <button
                      type="button"
                      className={crewConfirmation === 'symptoms_present' ? 'danger' : undefined}
                      onClick={() => setCrewConfirmation('symptoms_present')}
                    >
                      ⚠️ Symptoms Persist After Sensor Check
                    </button>
                  </div>
                  {crewConfirmation === 'symptoms_present' ? (
                    <p style={{ color: 'var(--status-critical)', fontSize: '0.85rem', marginTop: 6 }}>
                      Crew confirmed persistent symptoms after sensor verification → <strong>Flight Surgeon telemetry packet prioritized.</strong>
                    </p>
                  ) : crewConfirmation === 'confirmed_normal' ? (
                    <p style={{ color: 'var(--status-good)', fontSize: '0.85rem', marginTop: 6 }}>
                      Crew confirmed stable status & sensor placement → logged to onboard SQLite medical timeline.
                    </p>
                  ) : null}
                </div>

                {/* Tool-Bound Action Plan */}
                <div>
                  <h3>6. Action Plan (Restricted to Available Tools)</h3>
                  <ul className="compact-list">
                    {triageResult.triage.available_tool_action_plan.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>

                {/* Modify Workout AI (Whiteboard #3-1) */}
                <div className="workout-ai-box">
                  <h3>🏋️ 7. Modify Workout AI Countermeasure</h3>
                  <p style={{ margin: '4px 0 0' }}>{triageResult.triage.workout_modification}</p>
                </div>

                {/* Simple Step-by-Step Instructions (Whiteboard #9) */}
                <div>
                  <h3>8. Simple Step-by-Step Crew Instructions</h3>
                  <ul className="compact-list">
                    {triageResult.triage.simple_instructions.map((inst) => (
                      <li key={inst}>{inst}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* EXPANDABLE MODEL BENCHMARK TABLE (Whiteboard #10: Qwen3-8B vs Qwen 4B vs Gemma 3 4B) */}
        {showBenchmark && benchmark.data ? (
          <div className="subcard" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <strong>🔬 Onboard Local LLM Benchmark ({benchmark.data.testSuite})</strong>
              <span className="badge">Selected Model: {benchmark.data.primarySelected}</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Ollama Model</th>
                    <th>Params</th>
                    <th>Valid JSON</th>
                    <th>Refuses to Diagnose</th>
                    <th>Flags SpO₂ Sensor Artifact</th>
                    <th>Stays Within Available Tools</th>
                    <th>Ground Escalation Accuracy</th>
                    <th>Avg Latency</th>
                    <th>Evaluation Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmark.data.models.map((m) => (
                    <tr key={m.model}>
                      <td><strong>{m.model}</strong></td>
                      <td>{m.params}</td>
                      <td>{m.validJsonPct}%</td>
                      <td>{m.nonDiagnosisCompliancePct}%</td>
                      <td>{m.sensorArtifactDetectionPct}%</td>
                      <td>{m.toolRestrictionAdherencePct}%</td>
                      <td>{m.escalationAccuracyPct}%</td>
                      <td>{m.avgLatencySec}s</td>
                      <td>{m.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* 4. GAMIFICATION SYSTEM & HEALTHY DAILY MISSION ROUTINE (Whiteboard #5 & #21) */}
      <Card
        title="🎮 Daily Countermeasure Gamification & Healthy Spaceflight Routine"
        actions={
          <div className="row" style={{ gap: 8 }}>
            <span className="badge">🔥 {streakDays}-Sol Crew Health Streak</span>
            <span className="badge">⭐ {totalXp} / {maxXp} Mission XP ({readinessPct}%)</span>
          </div>
        }
      >
        <div className="xp-bar-wrap" aria-label={`Mission health readiness ${readinessPct}%`}>
          <div className="xp-bar-fill" style={{ width: `${readinessPct}%` }} />
        </div>
        <p className="muted" style={{ fontSize: '0.86rem', marginBottom: 10 }}>
          Long-duration astronauts maintain peak bone, cardiovascular, ocular, and behavioral health by completing daily countermeasure routines. Check off completed tasks to build your crew readiness streak:
        </p>
        <div className="grid two">
          {quests.map((q) => (
            <div key={q.id} className={`quest-card${q.done ? ' done' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <label className="row" style={{ cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={q.done}
                    onChange={() => {
                      setQuests((prev) => prev.map((item) => (item.id === q.id ? { ...item, done: !item.done } : item)))
                      if (!q.done) setStreakDays((s) => s)
                    }}
                  />
                  {q.title}
                </label>
                <span className="badge">+{q.xp} XP</span>
              </div>
              <small>{q.category}</small>
              <p className="muted" style={{ fontSize: '0.82rem', margin: '4px 0 0' }}>{q.instruction}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* 5. NASA HUMAN RESEARCH PROGRAM: 5 HAZARDS OF HUMAN SPACEFLIGHT (Whiteboard #2 & NASA Prompt) */}
      <Card title="🛡️ NASA Human Research Program — The 5 Hazards of Human Spaceflight">
        <div className="grid tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))' }}>
          {FIVE_NASA_HAZARDS.map((h) => (
            <div key={h.id} className="subcard stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="badge">{h.code}</span>
                <strong style={{ fontSize: '0.92rem' }}>{h.name}</strong>
              </div>
              <p className="muted" style={{ fontSize: '0.82rem' }}>{h.summary}</p>
              <div>
                <small><strong>Health Risks:</strong> {h.healthRisks.join(', ')}</small>
              </div>
              <div>
                <small><strong>Tracked By:</strong> {h.keyIndicators.join(' · ')}</small>
              </div>
              <div style={{ borderTop: '1px solid var(--grid)', paddingTop: 6 }}>
                <small><strong>Countermeasure:</strong> {h.countermeasure}</small>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
