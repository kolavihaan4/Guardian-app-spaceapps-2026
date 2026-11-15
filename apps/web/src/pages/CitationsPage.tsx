import { Card } from '../components/common'

const NASA_CITATIONS = [
  {
    name: 'NASA Life Sciences Data Archive (LSDA) — IDP-LSDA_DATASET-0000000000001812 (JMLSAHNEWSV722_152)',
    source: 'NASA Johnson Space Center (JSC) Flight Medicine Clinic / Longitudinal Study of Astronaut Health (LSAH)',
    url: 'https://nlsp.nasa.gov/search/data/details/IDP-LSDA_DATASET-0000000000001812?dataType=DATASETS',
    license: 'U.S. Government Public Domain',
    usage: 'Mean sitting systolic and diastolic blood pressure values stratified by age group (<35 to 60+) and sex (male/female astronauts and comparison subjects).',
  },
  {
    name: 'NASA Open Science Data Repository — OSD-575 (Inspiration4 Crew Biomedical Dataset)',
    source: 'NASA OSDR / Space Omics and Medical Atlas (SOMA)',
    url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
    license: 'Creative Commons CC0 1.0 Universal (Public Domain)',
    usage: 'Preflight (L-92, L-44, L-3) and post-return (R+1, R+45, R+82, R+194) clinical blood chemistry baselines for coded crew profiles C001–C004.',
  },
  {
    name: 'NASA Human Research Program (HRP) — 5 Hazards of Human Spaceflight',
    source: 'NASA Johnson Space Center / Human Research Program',
    url: 'https://www.nasa.gov/hrp/hazards/',
    license: 'U.S. Government Public Domain',
    usage: 'Framework mapping Space Radiation, Isolation & Confinement, Distance from Earth, Gravity Fields, and Hostile/Closed Environments to physiological indicators and countermeasures.',
  },
  {
    name: '2025 AHA/ACC Guideline for the Prevention, Detection, Evaluation and Management of High Blood Pressure in Adults',
    source: 'American Heart Association / American College of Cardiology — Hypertension 2025;82(10):e212–e316',
    url: 'https://doi.org/10.1161/HYP.0000000000000249',
    license: 'Copyright American Heart Association; cited for reference ranges only',
    usage: 'Blood pressure categories (normal, elevated, stage 1, stage 2) used to label a single reading. Earth clinic reference for adults, not an in-flight limit.',
  },
  {
    name: 'Orthostatic Hypotension in Adults With Hypertension: A Scientific Statement From the American Heart Association',
    source: 'American Heart Association — Hypertension 2024;81(3):e16–e30 (PMC11067441)',
    url: 'https://doi.org/10.1161/HYP.0000000000000236',
    license: 'Copyright American Heart Association; cited for the standing-test criterion only',
    usage: 'Criterion for a blood pressure fall on standing (20 mmHg systolic or 10 mmHg diastolic within 3 minutes), the rest-then-stand measurement protocol, and the warning that one pair of readings can meet it by chance. Applied only in gravity environments.',
  },
  {
    name: 'NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information)',
    source: 'NASA Goddard Space Flight Center / Community Coordinated Modeling Center (CCMC)',
    url: 'https://ccmc.gsfc.nasa.gov/DONKI-API/',
    license: 'U.S. Government Public Domain',
    usage: 'Live solar flare (FLR), coronal mass ejection (CME), geomagnetic storm (GST / Kp index), and solar energetic particle (SEP) alerts.',
  },
  {
    name: 'NOAA Space Weather Prediction Center (SWPC) — GOES Integral Proton Flux & Scales',
    source: 'NOAA / National Weather Service',
    url: 'https://services.swpc.noaa.gov/',
    license: 'U.S. Government Public Domain',
    usage: '24-hour ≥10 MeV integral proton flux series and official NOAA S1–S5 solar radiation storm scale.',
  },
  {
    name: 'NASA EONET v3 (Earth Observatory Natural Event Tracker)',
    source: 'NASA Earthdata',
    url: 'https://eonet.gsfc.nasa.gov/api/v3/events',
    license: 'U.S. Government Public Domain',
    usage: 'Global natural event tracking (wildfires, severe storms, volcanic activity) for Earth-analog comparison.',
  },
  {
    name: 'NASA POWER (Prediction Of Worldwide Energy Resources)',
    source: 'NASA Langley Research Center',
    url: 'https://power.larc.nasa.gov/',
    license: 'U.S. Government Public Domain',
    usage: 'Surface temperature, humidity, atmospheric pressure, wind speed, and solar irradiance time-series.',
  },
  {
    name: 'NASA APOD (Astronomy Picture of the Day)',
    source: 'NASA Science Editorial Team',
    url: 'https://science.nasa.gov/wp-json/wp/v2/apod-basic',
    license: 'Public Domain (with individual image copyright attribution displayed on every entry)',
    usage: 'Daily space science imagery and educational context.',
  },
]

const SOFTWARE_CITATIONS = [
  {
    name: 'Qwen3-8B (Local Onboard Triage LLM via Ollama)',
    license: 'Apache License 2.0',
    url: 'https://huggingface.co/Qwen/Qwen3-8B',
    usage: 'Structured JSON crew health-data triage, sensor-artifact verification, tool-bound action plans, and Workout AI modifications.',
  },
  {
    name: 'React 19, Recharts 3, Vite 8 & TypeScript 5.9',
    license: 'MIT / Apache-2.0',
    url: 'https://react.dev/',
    usage: 'Interactive SVG crew body explorer, dynamic baseline timeline charts, color-coded vitals console, and web dashboard.',
  },
  {
    name: 'Node.js (node:sqlite, node:crypto), Express 5, Zod 4, Helmet & Pino',
    license: 'MIT / ISC',
    url: 'https://nodejs.org/',
    usage: 'Offline-capable local SQLite medical store, AES-256-GCM encryption, schema validation, and NASA API caching.',
  },
]

export function CitationsPage() {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card
        title="📚 Citations, NASA Data Sources & Open-Source Licenses"
        actions={<span className="badge">2026 NASA Space Apps Challenge · Apache-2.0 Licensed</span>}
      >
        <p className="muted">
          In compliance with the NASA Space Apps Challenge Participant Terms & Conditions, every scientific dataset, space-environment API, AI model, and open-source library used in <strong>Mission Baseline</strong> is cited below with its license and operational role.
        </p>
      </Card>

      <Card title="🛰️ NASA, NOAA & Space Biomedical Datasets">
        <div className="table-wrap" style={{ maxHeight: 'none' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Dataset / API</th>
                <th>Agency / Provider</th>
                <th>License</th>
                <th>How It Is Used in Mission Baseline</th>
              </tr>
            </thead>
            <tbody>
              {NASA_CITATIONS.map((c) => (
                <tr key={c.name}>
                  <td>
                    <strong>
                      <a href={c.url} target="_blank" rel="noreferrer">
                        {c.name}
                      </a>
                    </strong>
                  </td>
                  <td>{c.source}</td>
                  <td><span className="badge">{c.license}</span></td>
                  <td>{c.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="🤖 AI Models & Open-Source Software Stack">
        <div className="table-wrap" style={{ maxHeight: 'none' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Component</th>
                <th>License</th>
                <th>Role in System</th>
              </tr>
            </thead>
            <tbody>
              {SOFTWARE_CITATIONS.map((s) => (
                <tr key={s.name}>
                  <td>
                    <strong>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.name}
                      </a>
                    </strong>
                  </td>
                  <td><span className="badge">{s.license}</span></td>
                  <td>{s.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="⚖️ Medical Disclaimer & Measurement Error Transparency">
        <ul className="compact-list">
          <li>
            <strong>Not a Medical Device:</strong> Mission Baseline is an educational and exploratory crew health decision-support prototype created for the 2026 NASA Space Apps Challenge. It never diagnoses, treats, or prescribes.
          </li>
          <li>
            <strong>Wearable Optical SpO₂ Error:</strong> Wrist-worn optical photoplethysmography (PPG) sensors serve as Earth-analog stand-ins for crew biotelemetry and carry ±2–4% measurement uncertainty due to motion artifact, strap tension, and microgravity fluid redistribution.
          </li>
          <li>
            <strong>Synthetic & De-Identified Data Only:</strong> No personally identifiable information (PII) is collected or transmitted. Crew profiles C001–C004 derive from NASA’s public, de-identified OSD-575 dataset.
          </li>
        </ul>
      </Card>
    </div>
  )
}

