import '../triage.css'
import { LOCATION_COPY, REGION_COPY, TOOL_LABELS, plainHealthText } from '../lib/triageCopy'
import { regionForZone, zoneLabel, type BodyZoneId } from '../components/bodyRegions'
import {
  BODY_REGIONS,
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
import { UltrasoundCard } from '../components/UltrasoundCard'
import { environmentFromHome, saveEnvironmentForHome } from '../guardian'
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
    title: 'Strength exercise',
    category: 'Bones and muscles',
    xp: 150,
    instruction: 'Use the onboard exercise equipment to work your muscles and support your bones. Follow your crew’s exercise plan.',
    done: false,
  },
  {
    id: 'q2',
    title: 'Drink enough water',
    category: 'Water',
    xp: 100,
    instruction: 'Drink water throughout the day as directed by your crew’s plan.',
    done: false,
  },
  {
    id: 'q3',
    title: 'Record your morning readings',
    category: 'Daily check-in',
    xp: 100,
    instruction: 'After resting, record your heart rate, blood pressure, blood oxygen and temperature.',
    done: false,
  },
  {
    id: 'q4',
    title: 'Check your vision',
    category: 'Eyes and vision',
    xp: 75,
    instruction: 'Use the vision grid as instructed and check whether its lines look blurry or wavy.',
    done: false,
  },
  {
    id: 'q5',
    title: 'Make time for sleep',
    category: 'Rest and wellbeing',
    xp: 100,
    instruction: 'Follow your sleep schedule and dim the lights before bed.',
    done: false,
  },
  {
    id: 'q6',
    title: 'Check airflow in your sleeping area',
    category: 'Cabin environment',
    xp: 50,
    instruction: 'Make sure air can flow freely and check the air monitor using your crew’s instructions.',
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
/** Public-domain NASA photographs for the environment picker (files in public/environments, credits on the Citations page). */
const ENVIRONMENT_PHOTOS: Partial<Record<MissionEnvironmentId, { src: string; credit: string; position?: string }>> = {
  iss_leo: { src: '/environments/iss.jpg', credit: 'International Space Station after STS-132 undocking. NASA / STS-132 crew' },
  eva_spacewalk: { src: '/environments/iss.jpg', credit: 'International Space Station after STS-132 undocking. NASA / STS-132 crew', position: '30% 40%' },
  lunar_base: { src: '/environments/moon.jpg', credit: 'Buzz Aldrin on the Moon, Apollo 11. NASA, photo by Neil Armstrong', position: '50% 30%' },
  mars_surface: { src: '/environments/mars.jpg', credit: 'Mount Sharp from the Curiosity rover (PIA16099). NASA/JPL-Caltech/MSSS' },
  deep_space_transit: { src: '/environments/spacecraft.jpg', credit: 'Orion with the Moon and Earth, Artemis I flight day 13. NASA' },
}

const Body3D = lazy(() => import('../components/Body3D'))
const Anatomy3D = lazy(() => import('../components/Anatomy3D'))

export function CrewAssessmentPage() {
  // 1. Mission Environment (Whiteboard Feature #1, #6, #20)
  // Starts on the environment chosen on the home page, and saves changes back for it.
  const [environment, setEnvironmentState] = useState<MissionEnvironmentId>(() => environmentFromHome() ?? 'iss_leo')
  const setEnvironment = (id: MissionEnvironmentId) => {
    setEnvironmentState(id)
    saveEnvironmentForHome(id)
  }
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
  const [selectedRegion, updateSelectedRegion] = useState<BodyRegionId>('eyes_sans')
  const [selectedZone, setSelectedZone] = useState<BodyZoneId | null>(null)
  const setSelectedRegion = (region: BodyRegionId) => { setSelectedZone(null); updateSelectedRegion(region) }
  const selectZone = (zone: BodyZoneId) => { setSelectedZone(zone); updateSelectedRegion(regionForZone(zone)) }
  const [generalPainPoints, setGeneralPainPoints] = useState<PainPoint[]>([])
  const [zonePain, setZonePain] = useState<Partial<Record<BodyZoneId, number>>>({})
  const setPainPoints = (points: PainPoint[]) => { setZonePain({}); setGeneralPainPoints(points) }
  // The API accepts broad systems; retain precise locations in each system's note.
  const painPoints: PainPoint[] = (Object.keys(BODY_REGIONS) as BodyRegionId[]).flatMap((region) => {
    const details = (Object.entries(zonePain) as [BodyZoneId, number][]).filter(([z, n]) => regionForZone(z) === region && n > 0)
    const general = generalPainPoints.find((p) => p.region === region)
    const severity = Math.max(general?.severity ?? 0, ...details.map(([, n]) => n), 0)
    return severity ? [{ region, severity, note: [general?.note, ...details.map(([z, n]) => zoneLabel(z) + ': ' + n + '/10')].filter(Boolean).join('; ') }] : []
  })

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
    setGeneralPainPoints((prev) => {
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
    bpCategory.category === 'stage_2' || bpCategory.category === 'severe' || bpSys < 88
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
  const selectedPain = selectedZone ? zonePain[selectedZone] ?? 0 : getRegionPain(selectedRegion)
  const regionDetail = BODY_REGIONS[selectedRegion]
  const bodyCopy = REGION_COPY[selectedRegion]
  const locationCopy = LOCATION_COPY[environment]
  const completedActivities = quests.filter((q) => q.done).length

  return (
    <div className="stack triage-page" style={{ gap: 24 }}>
      {/* 1. CHOOSE MISSION LOCATION / ENVIRONMENT (Whiteboard Feature #1, #6, #20) */}
      <section className="card env-banner">
        <div className="card-head">
          <div>
            <span className="eyebrow">Step 1 · Choose your location</span>
            <h1 style={{ marginTop: 2 }}>Crew health check</h1>
            <p className="triage-lead">Choose where the crew is, mark any pain, and review the readings. We’ll help you see what needs attention.</p>
          </div>
          <span className="spacer" />
          <div className="row" style={{ gap: 6 }}>
            <span className="badge">Message delay: {envInfo.commsDelay}</span>
            <span className="badge">Gravity: {locationCopy.gravity}</span>
            <a className="triage-source" href="#/citations">Sources and explanations ↗</a>
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
                {ENVIRONMENT_PHOTOS[id] ? (
                  <img className="env-photo" src={ENVIRONMENT_PHOTOS[id].src} alt="" loading="lazy" style={{ objectPosition: ENVIRONMENT_PHOTOS[id].position }} />
                ) : (
                  <span className="env-photo env-photo-none" aria-hidden="true" />
                )}
                <strong>{LOCATION_COPY[id].name}</strong>
                <span>{LOCATION_COPY[id].gravity} · Messages: {m.commsDelay}</span>
              </button>
            )
          })}
        </div>

        {ENVIRONMENT_PHOTOS[environment] ? <p className="env-credit">Photo: {ENVIRONMENT_PHOTOS[environment].credit} (public domain).</p> : null}

        <div className="env-norms">
          <div>
            <strong>How {locationCopy.name.toLowerCase()} can affect the body</strong>
            <p className="muted" style={{ margin: '2px 0 0' }}>{locationCopy.summary}</p>
          </div>
          <div className="env-deltas">
            <span><strong>Heart rate change:</strong> {plainHealthText(envInfo.expectedDeltas.hrDeltaBpm)}</span>
            <span><strong>Blood pressure change:</strong> {plainHealthText(envInfo.expectedDeltas.bpShift)}</span>
            <span><strong>Blood oxygen:</strong> {plainHealthText(envInfo.expectedDeltas.spo2Note)}</span>
            <details className="triage-details"><summary>Where this information comes from</summary><p>{plainHealthText(envInfo.evidence)}</p></details>
          </div>
        </div>
      </section>

      {/* DEMO SCENARIO PRESETS BAR */}
      <div className="card row triage-examples" style={{ justifyContent: 'space-between', padding: '10px 16px' }}>
        <div className="row" style={{ gap: 8 }}>
          <div><strong>Try an example</strong><p className="triage-caption">These buttons fill in sample readings so you can explore the page.</p></div>
          <button type="button" onClick={() => loadScenario('nominal')}>Regular check-in</button>
          <button type="button" onClick={() => loadScenario('artifact')}>Loose sensor during a spacewalk</button>
          <button type="button" onClick={() => loadScenario('sans_drift')}>Vision changes in space</button>
          <button type="button" onClick={() => loadScenario('escalate')}>Solar storm and support</button>
        </div>
        <button type="button" className="primary" onClick={() => void runAiTriage()} disabled={triageLoading}>
          {triageLoading ? 'Checking the information…' : 'Start health check'}
        </button>
      </div>

      {/* 2. INTERACTIVE BODY MAP + COMPLETE VITALS & ASTRONAUT INPUT (Whiteboard #3-1) */}
      <div className="grid two triage-columns" style={{ alignItems: 'start' }}>
        {/* LEFT COLUMN: INTERACTIVE CLICKABLE HUMAN BODY */}
        <Card
          title="Body map · Select where it hurts"
          actions={
            painPoints.length > 0 ? (
              <button type="button" onClick={() => setPainPoints([])} style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}>
                Clear {painPoints.length} marked area(s)
              </button>
            ) : (
              <span className="badge">No pain marked</span>
            )
          }
        >
          <div className="body-explorer">
            <div className="body-svg-wrap">
              {use3d ? (
                <Suspense fallback={<p className="body-3d-hint">Loading 3D body…</p>}>
                  {useAnatomy ? (
                    <Anatomy3D
                      selectedZone={selectedZone}
                      zonePain={zonePain}
                      onZoneSelect={selectZone}
                      sex={/^\s*(f|woman)/i.test(gender) ? 'female' : 'male'}
                      selected={selectedRegion}
                      pain={Object.fromEntries(generalPainPoints.filter((p) => p.severity > 0).map((p) => [p.region, p.severity]))}
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
                    <title>Head and balance</title>
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
                    <title>Eyes and vision</title>
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
                    <title>Chest, heart and lungs</title>
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
                    <title>Spine and bones</title>
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
                    <title>Stomach and kidneys</title>
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
                    <title>Shoulders, arms and hands</title>
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
                    <title>Legs and hips</title>
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
                      {REGION_COPY[rId].name}
                      {p > 0 ? <span className="pain-pill">{p}/10</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Selected Body Region Details + Pain Slider */}
            <div className="body-detail stack">
              <div>
                <span className="eyebrow">Selected area</span>
                <h2>{selectedZone ? zoneLabel(selectedZone) : bodyCopy.name}</h2>
                {selectedZone && <small>Body area: {bodyCopy.name}</small>}
                <p className="muted">{bodyCopy.summary}</p>
              </div>

              <div className="pain-control">
                <label>
                  <span>
                    <strong>How much does it hurt in {selectedZone ? zoneLabel(selectedZone) : bodyCopy.name}:</strong>{' '}
                    <span className={`status-chip ${selectedPain >= 7 ? 'alert' : selectedPain >= 3 ? 'caution' : 'nominal'}`}>
                      {selectedPain === 0 ? '0/10 (No Pain)' : `${selectedPain}/10 pain`}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={selectedPain}
                    onChange={(e) => selectedZone ? setZonePain((prev) => ({ ...prev, [selectedZone]: Number(e.target.value) })) : setRegionPain(selectedRegion, Number(e.target.value))}
                  />
                </label>
              </div>

              <div>
                <h3>How spaceflight can affect this area</h3>
                <ul className="compact-list">
                  {bodyCopy.risks.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="instruction-box">
                <strong>Simple check:</strong>
                <p style={{ margin: '4px 0 0' }}>{plainHealthText(regionDetail.selfCheckInstruction)}</p>
              </div>

              <UltrasoundCard region={selectedRegion} />

              <div className="row" style={{ gap: 6 }}>
                <small>Related readings:</small>
                {regionDetail.linkedIndicators.map((ind) => (
                  <span key={ind} className="badge">{plainHealthText(ind)}</span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* RIGHT COLUMN: ASTRONAUT PROFILE, VITALS INPUT & AVAILABLE TOOLS */}
        <Card
          title="Step 2 · Enter crew details and readings"
          actions={<span className="badge">Green: usual · Amber: recheck · Red: needs attention</span>}
        >
          <div className="stack" style={{ gap: 12 }}>
            {/* Astronaut Profile Row (Whiteboard 3-1: Age, Height, Weight, Gender, Previous Medical Conditions) */}
            <div className="subcard">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>Crew profile and usual readings before flight</strong>
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
                Health history and previous flights
                <input type="text" value={plainHealthText(conditions)} onChange={(e) => setConditions(e.target.value)} />
              </label>
            </div>

            {/* Vital Signs Grid with Live Green/Amber/Red Color Coding (Whiteboard #3-1 & #8) */}
            <div className="form-grid three">
              <label className={`vital-input ${hrStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Heart rate (beats per minute)</span>
                  <span className={`status-dot ${hrStatus}`} title={`Usual reading before flight: ${preflightHr} bpm`} />
                </span>
                <input type="number" value={hrBpm} onChange={(e) => setHrBpm(Number(e.target.value))} />
                <small>Usual before flight: {preflightHr} beats/min. Change: {hrBpm - preflightHr >= 0 ? `+${hrBpm - preflightHr}` : hrBpm - preflightHr} beats/min.</small>
              </label>

              <label className={`vital-input wide ${bpStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Blood pressure (mmHg)</span>
                  <span className={`status-dot ${bpStatus}`} />
                </span>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <input type="number" value={bpSys} onChange={(e) => setBpSys(Number(e.target.value))} aria-label="Blood pressure top number" />
                  <span>/</span>
                  <input type="number" value={bpDia} onChange={(e) => setBpDia(Number(e.target.value))} aria-label="Blood pressure bottom number" />
                </div>
                <small>{bpCategory.label}. The top number measures pressure during a heartbeat; the bottom number measures pressure between beats. These are Earth reference ranges, not mission limits.</small>
                <small>
                  {astronautAverage
                    ? `Recorded astronaut average, ${astronautAverage.group}: ${astronautAverage.averageSystolic}/${astronautAverage.averageDiastolic} mmHg. ${LSAH_REFERENCE_SOURCE}.`
                    : 'No recorded NASA astronaut average for this age and gender.'}
                </small>
                <span style={{ marginTop: 6 }}>Blood pressure after standing, within 3 minutes (optional)</span>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <input type="number" value={standSys} onChange={(e) => setStandSys(e.target.value)} aria-label="Standing blood pressure top number" />
                  <span>/</span>
                  <input type="number" value={standDia} onChange={(e) => setStandDia(e.target.value)} aria-label="Standing blood pressure bottom number" />
                </div>
                <small>
                  {GRAVITY_ENVIRONMENTS.includes(environment)
                    ? 'Compared with the resting reading, a fall of 20 in the top number or 10 in the bottom number meets the reference for a blood-pressure drop after standing.'
                    : 'A standing test needs gravity, so it is not assessed in this environment.'}
                </small>
              </label>

              <label className={`vital-input ${glucStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Blood sugar (mg/dL)</span>
                  <span className={`status-dot ${glucStatus}`} />
                </span>
                <input type="number" value={bloodSugar} onChange={(e) => setBloodSugar(Number(e.target.value))} />
                <small>A usual fasting reading is 70–99 mg/dL. Fasting means no food for 8 hours. mg/dL is the unit used by this blood-sugar meter.</small>
              </label>

              <label className={`vital-input ${tempStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Body temperature (°C)</span>
                  <span className={`status-dot ${tempStatus}`} />
                </span>
                <input type="number" step="0.1" value={tempC} onChange={(e) => setTempC(Number(e.target.value))} />
                <small>Usual reading before flight: {preflightTemp}°C. For adults on Earth, a usual mouth temperature is 35.7–37.3 °C. A reading of 37.8 °C or above meets the fever reference. °C means degrees Celsius.</small>
              </label>

              <label className={`vital-input ${spo2Status}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Blood oxygen (SpO₂ %)</span>
                  <span className={`status-dot ${spo2Status}`} />
                </span>
                <input type="number" value={spo2Pct} onChange={(e) => setSpo2Pct(Number(e.target.value))} />
                <span>This person’s usual blood oxygen (optional)</span>
                <input type="number" value={spo2Baseline} onChange={(e) => setSpo2Baseline(e.target.value)} aria-label="Usual SpO2 baseline, optional" />
                <small>Shows the percentage of blood carrying oxygen. The Earth reference target is 94–98%, or 88–92% for some lung conditions. Recheck a fall of 3 percentage points from the usual reading.</small>
              </label>

              <label className={`vital-input ${rrStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Breathing rate (breaths per minute)</span>
                  <span className={`status-dot ${rrStatus}`} />
                </span>
                <input type="number" value={respRate} onChange={(e) => setRespRate(Number(e.target.value))} />
                <small>Count breaths taken in one minute. A resting adult Earth reference is 12–20 breaths per minute.</small>
              </label>

              <label className={`vital-input ${sleepStatus}`}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Sleep (hours)</span>
                  <span className={`status-dot ${sleepStatus}`} />
                </span>
                <input type="number" step="0.5" value={sleepHours} onChange={(e) => setSleepHours(Number(e.target.value))} />
                <small>Enter the hours slept. The adult recommendation on Earth is at least 7 hours a night.</small>
              </label>

              <label className={`vital-input ${mood === 'optimal' || mood === 'focused' ? 'nominal' : mood === 'fatigued' ? 'caution' : 'alert'}`}>
                <span>How are you feeling?</span>
                <select value={mood} onChange={(e) => setMood(e.target.value as MoodStatus)}>
                  <option value="optimal">Rested</option>
                  <option value="focused">Focused / Busy</option>
                  <option value="fatigued">Tired / Sleep schedule disrupted</option>
                  <option value="stressed">Stressed / Mentally busy</option>
                  <option value="isolated">Lonely / Feeling confined</option>
                </select>
                <small>Stress or loneliness prompts a closer look. Mood alone does not explain an unusual reading (Gordon and Mendes 2021).</small>
              </label>

              <label className={`vital-input ${sensorVerified ? 'nominal' : 'caution'}`}>
                <span>Is the sensor fitted properly?</span>
                <button
                  type="button"
                  onClick={() => setSensorVerified((v) => !v)}
                  style={{ textAlign: 'left', fontWeight: 600 }}
                >
                  {sensorVerified ? 'Yes, the sensor fits' : 'Not checked yet (it may have moved)'}
                </button>
                <small>Check the fit before reacting to unusual oxygen or heart-rate readings.</small>
              </label>
            </div>

            {/* Specialized Spaceflight Exams: Ultrasound & Eye Exam (SANS) */}
            <div className="form-grid two">
              <label>
                <strong>Ultrasound result</strong>
                <select value={ultrasound} onChange={(e) => setUltrasound(e.target.value as UltrasoundFinding)}>
                  <option value="not_performed">Not performed today</option>
                  <option value="normal">No unusual findings in the eye, heart or kidney scan</option>
                  <option value="optic_nerve_sheath_elevated">Optic nerve covering measures over 5.8 mm</option>
                  <option value="renal_debris_suspected">Possible small kidney stones seen on scan</option>
                  <option value="jugular_venous_stasis">Slow blood flow in a neck vein</option>
                </select>
              </label>
              <label>
                <strong>Eye and vision check</strong>
                <select value={eyeExam} onChange={(e) => setEyeExam(e.target.value as EyeExamFinding)}>
                  <option value="not_performed">Not performed today</option>
                  <option value="normal_20_20">Clear vision and straight lines on the vision grid</option>
                  <option value="mild_eye_strain">Mild eye strain from screens or lighting</option>
                  <option value="hyperopia_shift">Near vision has changed</option>
                  <option value="amsler_grid_distortion">Lines on the vision grid look distorted or missing</option>
                </select>
              </label>
            </div>

            {/* Available Onboard Tools Selector (Whiteboard Front End #7) */}
            <div className="subcard">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <strong>Available medical and exercise tools ({availableTools.length} selected)</strong>
                <small>The suggested plan uses only the tools selected here.</small>
              </div>
              <div className="tools-grid">
                {ONBOARD_TOOLS.map((tool) => {
                  const active = availableTools.includes(tool)
                  return (
                    <button
                      key={TOOL_LABELS[tool] ?? tool}
                      type="button"
                      className={`tool-chip${active ? ' active' : ''}`}
                      aria-pressed={active}
                      onClick={() => toggleTool(tool)}
                    >
                      {active ? '✓ ' : '+ '}
                      {TOOL_LABELS[tool] ?? tool}
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
              {triageLoading ? 'Checking the readings and body map…' : 'Review readings and suggest next steps'}
            </button>
          </div>
        </Card>
      </div>

      {/* 3. OVERARCHING AI (QWEN3-8B) TRIAGE & WORKOUT MODIFICATION PANEL (Whiteboard Feature #4, #3-1, #9) */}
      <section className={`card ai-panel ${triageResult?.triage.overall_status ?? 'nominal'}`}>
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}>
            <span className={`status-pill ${triageResult?.triage.overall_status ?? 'nominal'}`}>
              {!triageResult ? (triageLoading ? 'CHECKING YOUR READINGS…' : 'READY TO CHECK') : triageResult.triage.overall_status === 'alert'
                ? 'ALERT · CONTACT GROUND SUPPORT'
                : triageResult?.triage.overall_status === 'caution'
                  ? 'CAUTION · CHECK AND MONITOR'
                  : 'NO ALERT FROM THESE READINGS'}
            </span>
            <h2>What to do next</h2>
            {triageResult ? <span className="badge">Answered by: {triageResult.source}</span> : null}
          </div>
          <span className="spacer" />
          <button type="button" onClick={() => setShowBenchmark((v) => !v)} style={{ fontSize: '0.8rem' }}>
            {showBenchmark ? 'Hide AI performance details' : 'See AI performance details'}
          </button>
        </div>

        {triageError ? <div className="banner error">{triageError}</div> : null}

        {triageResult ? (
          <div className="stack" style={{ gap: 12 }}>
            {/* Ground Support Alert Banner when contact_ground_support is true */}
            {triageResult.triage.contact_ground_support ? (
              <div className="banner error pulse-border" role="alert">
                <strong>CONTACT THE CREW DOCTOR OR GROUND SUPPORT IMMEDIATELY:</strong>{' '}
                {plainHealthText(triageResult.triage.ground_support_reason)} (A message to Earth takes: <strong>{envInfo.commsDelay}</strong>. Follow the crew’s onboard plan while waiting for a reply.)
              </div>
            ) : null}

            <div className="grid two">
              <div className="subcard stack">
                <div>
                  <h3>1. Check the sensor and readings</h3>
                  <p>{plainHealthText(triageResult.triage.data_quality_check)}</p>
                </div>
                <div>
                  <h3>2. Compare with usual readings</h3>
                  {/* The comparison is a run of separate facts joined by " · "; one per line reads far better. */}
                  <ul className="compact-list">
                    {triageResult.triage.baseline_comparison.split(' · ').map((fact) => (
                      <li key={fact}>{plainHealthText(fact)}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>3. How the location may matter ({locationCopy.name})</h3>
                  <p>{plainHealthText(triageResult.triage.environment_insight)}</p>
                </div>
                <div>
                  <h3>4. Possible explanations to consider</h3>
                  <ul className="compact-list">
                    {triageResult.triage.common_causes.map((c) => (
                      <li key={c}>{plainHealthText(c)}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="subcard stack">
                {/* Interactive Confirmation Prompt (Whiteboard Feature #4: "Ask them to confirm") */}
                <div className="confirm-box">
                  <h3>5. Confirm how the crew member feels</h3>
                  <p style={{ fontWeight: 600 }}>{plainHealthText(triageResult.triage.confirmation_prompt)}</p>
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <button
                      type="button"
                      className={crewConfirmation === 'confirmed_normal' ? 'primary' : undefined}
                      onClick={() => setCrewConfirmation('confirmed_normal')}
                    >
                      Sensor fits and I feel okay
                    </button>
                    <button
                      type="button"
                      className={crewConfirmation === 'symptoms_present' ? 'danger' : undefined}
                      onClick={() => setCrewConfirmation('symptoms_present')}
                    >
                      Symptoms continue after checking the sensor
                    </button>
                  </div>
                  {crewConfirmation === 'symptoms_present' ? (
                    <p style={{ color: 'var(--status-critical)', fontSize: '0.85rem', marginTop: 6 }}>
                      Symptoms continue after checking the sensor. Follow the guidance to contact ground support.
                    </p>
                  ) : crewConfirmation === 'confirmed_normal' ? (
                    <p style={{ color: 'var(--status-good)', fontSize: '0.85rem', marginTop: 6 }}>
                      The crew member reports feeling okay and confirms the sensor fits.
                    </p>
                  ) : null}
                </div>

                {/* Tool-Bound Action Plan */}
                <div>
                  <h3>6. Next steps using available tools</h3>
                  <ul className="compact-list">
                    {triageResult.triage.available_tool_action_plan.map((step) => (
                      <li key={step}>{plainHealthText(step)}</li>
                    ))}
                  </ul>
                </div>

                {/* Modify Workout AI (Whiteboard #3-1) */}
                <div className="workout-ai-box">
                  <h3>7. Suggested workout changes</h3>
                  <p style={{ margin: '4px 0 0' }}>{plainHealthText(triageResult.triage.workout_modification)}</p>
                </div>

                {/* Simple Step-by-Step Instructions (Whiteboard #9) */}
                <div>
                  <h3>8. Step-by-step instructions</h3>
                  <ul className="compact-list">
                    {triageResult.triage.simple_instructions.map((inst) => (
                      <li key={inst}>{plainHealthText(inst)}</li>
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
              <strong>AI performance results ({benchmark.data.testSuite})</strong>
              <span className="badge">Selected Model: {benchmark.data.primarySelected}</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>What answers</th>
                    <th>Model size</th>
                    <th>Valid response format</th>
                    <th>Refuses to Diagnose</th>
                    <th>Holds Back on Unverified Sensor</th>
                    <th>Stays Within Available Tools</th>
                    <th>Accuracy of ground-support alerts</th>
                    <th>Typical response time</th>
                    <th>Evaluation Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmark.data.models.map((m) => (
                    <tr key={m.model}>
                      <td><strong>{m.model}</strong></td>
                      <td>{m.params}</td>
                      {[m.validJsonPct, m.nonDiagnosisCompliancePct, m.sensorArtifactDetectionPct, m.toolRestrictionAdherencePct, m.escalationAccuracyPct].map((pct, i) => (
                        <td key={i}>{pct === null ? 'not measured' : `${pct}%`}</td>
                      ))}
                      <td>{m.avgLatencySec === null ? 'not measured' : m.avgLatencySec === 0 ? 'under 0.01s' : `${m.avgLatencySec}s`}</td>
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
        title="Daily healthy habits"
        actions={
          <div className="row" style={{ gap: 8 }}>
            <span className="routine-count">{completedActivities}<small> / {quests.length} activities done</small></span>
            <span className="badge">{totalXp} of {maxXp} activity points</span>
          </div>
        }
      >
        <div className="xp-bar-wrap" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readinessPct} aria-label={`Daily activity points ${readinessPct}%`}>
          <div className="xp-bar-fill" style={{ width: `${readinessPct}%` }} />
        </div>
        <p className="muted" style={{ fontSize: '0.86rem', marginBottom: 10 }}>
          Tick each activity when you finish it. You earn points as you go. This checklist tracks this visit only; points do not measure how healthy you are.
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
                    }}
                  />
                  {q.title}
                </label>
                <span className="badge">{q.done ? `✓ ${q.xp} points earned` : `+${q.xp} points`}</span>
              </div>
              <small>{q.category}</small>
              <p className="muted" style={{ fontSize: '0.82rem', margin: '4px 0 0' }}>{q.instruction}</p>
            </div>
          ))}
        </div>
      </Card>

    </div>
  )
}
