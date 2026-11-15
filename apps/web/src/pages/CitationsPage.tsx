import { useState } from 'react'
import { Card } from '../components/common'
import { NAMED_REFERENCES, RESEARCH_CITATIONS } from '../lib/researchCitations'
import '../citations.css'

const NASA_CITATIONS = [
  {"name": "CSA Bio-Monitor — wearable vital signs", "source": "Canadian Space Agency", "url": "https://www.csa-asc.gc.ca/eng/sciences/bio-monitor.asp", "license": "Agency publication; paraphrased", "usage": "Add card help for the smart shirt, headband and tablet workflow, breathing rate and skin temperature. Skin temperature is identified separately from core temperature."},
  {"name": "SunTech Tango M2 — User Manual", "source": "SunTech Medical", "url": "https://suntechmed.com/support/document-library/send/96-archive-tango-m2-instructions-manuals/1201-tango-m2-user-manual-english-rev-b", "license": "Manufacturer copyright; linked and paraphrased", "usage": "Add card upper-arm cuff and artery-marker guidance. This later-model reference is not presented as an original ISS flight checklist."},
  {"name": "Pulse oximetry — how the test is performed", "source": "NIH MedlinePlus", "url": "https://medlineplus.gov/lab-tests/pulse-oximetry/", "license": "US National Library of Medicine publication; paraphrased", "usage": "Add card fingertip pulse-oximeter instructions for pulse and oxygen saturation: clean finger, still hand and a settled reading. Sleep and mood entries are personal logs rather than measurements from this equipment."},
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
    usage: 'Five simple summaries on the Hazards page: space radiation, isolation and confinement, distance from Earth, gravity fields, and hostile/closed environments. Each summary links to NASA’s hazard page.',
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
    name: 'Standards of Care in Diabetes 2026, Section 2: Diagnosis and Classification of Diabetes',
    source: 'American Diabetes Association Professional Practice Committee — Diabetes Care 2026;49(Suppl 1):S27–S49',
    url: 'https://doi.org/10.2337/dc26-S002',
    license: 'Copyright American Diabetes Association; numeric criteria cited, no text reproduced',
    usage: 'Fasting glucose lines (100–125 and 126 mg/dL), the 200 mg/dL any-time line, the 8-hour definition of fasting, the two-result confirmation rule, and the medicines that raise glucose.',
  },
  {
    name: 'Diabetes & Prediabetes Tests',
    source: 'National Institute of Diabetes and Digestive and Kidney Diseases (NIDDK), NIH',
    url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/tests-diagnosis',
    license: 'U.S. Government Public Domain',
    usage: 'Normal fasting glucose (99 mg/dL or below) and the normal two-hour value (139 mg/dL or below).',
  },
  {
    name: 'Individual differences in normal body temperature: longitudinal big data analysis of patient records',
    source: 'Obermeyer, Samra, Mullainathan — BMJ 2017;359:j5468',
    url: 'https://doi.org/10.1136/bmj.j5468',
    license: 'Published by BMJ Publishing Group; cited for numeric findings only',
    usage: 'Usual adult temperature range (mean 36.6 °C, central 95% 35.7–37.3 °C) and the small shifts with age and hypothyroidism.',
  },
  {
    name: 'Merck Manual Professional Version — Fever; Hypothermia',
    source: 'Merck & Co., Inc.',
    url: 'https://www.merckmanuals.com/professional/infectious-diseases/biology-of-infectious-disease/fever',
    license: 'Copyright Merck & Co., Inc.; cited for numeric thresholds only',
    usage: 'Fever line (oral 37.8 °C or more at any time of day), red-flag temperatures (above 40 °C or below 35 °C), the hypothermia definition (35 °C or below) and the daily variation of about 0.6 °C.',
  },
  {
    name: 'Increased core body temperature in astronauts during long-duration space missions',
    source: 'Stahn et al. — Scientific Reports 2017;7:16180',
    url: 'https://doi.org/10.1038/s41598-017-15560-w',
    license: 'Creative Commons Attribution (CC BY 4.0)',
    usage: 'Note shown for raised temperatures in weightlessness: resting core temperature rose about 1 °C over the first 2.5 months on the ISS (11 astronauts).',
  },
  {
    name: 'Heat and Medications — Guidance for Clinicians; NIDDK thyroid disease pages',
    source: 'US Centers for Disease Control and Prevention; National Institute of Diabetes and Digestive and Kidney Diseases',
    url: 'https://www.cdc.gov/heat-health/hcp/clinical-guidance/heat-and-medications-guidance-for-clinicians.html',
    license: 'US government publication',
    usage: 'Notes on medicines that reduce sweating or heat loss, and on heat and cold intolerance in thyroid disease.',
  },
  {
    name: 'A large-scale study of stress, emotions, and blood pressure in daily life using a digital platform',
    source: 'Gordon, Mendes — PNAS 2021;118(31):e2105573118',
    url: 'https://doi.org/10.1073/pnas.2105573118',
    license: 'CC BY-NC-ND 4.0; cited for numeric findings only',
    usage: 'Context for a stressed mood: reported stress went with about 1 mmHg or less of extra blood pressure per step of a 0–4 scale (21,923 people, phone sensor), so it does not explain a raised reading.',
  },
  {
    name: 'Effects of mental stress on autonomic cardiac modulation during weightlessness',
    source: "Aubert, Verheyden, d'Ydewalle, Beckers, Van den Bergh — Am J Physiol Heart Circ Physiol 2010;298(1):H202–H209",
    url: 'https://doi.org/10.1152/ajpheart.00865.2009',
    license: 'Publisher copyright; abstract read, cited for numeric findings only',
    usage: 'Context for a stressed mood: a mental-arithmetic task raised heart rate about 7 bpm and mean arterial pressure about 7 mmHg, the same in flight as on the ground (five astronauts).',
  },
  {
    name: 'Psychological and Behavioral Changes during Confinement in a 520-Day Simulated Interplanetary Mission to Mars',
    source: 'Basner et al. — PLOS One 2014;9(3):e93298',
    url: 'https://doi.org/10.1371/journal.pone.0093298',
    license: 'Creative Commons Attribution (CC BY)',
    usage: 'Context for isolated and fatigued moods: four of six crew members showed a behavioural disturbance or psychological distress; chronic sleep of six hours or fewer was linked to vigilance errors.',
  },
  {
    name: 'Hazard: Isolation and Confinement',
    source: 'NASA Human Research Program',
    url: 'https://www.nasa.gov/hrp/hazard-isolation-and-confinement/',
    license: 'NASA web page',
    usage: 'Context for an isolated mood: sleep loss and circadian desynchronisation compound the effects of isolation.',
  },
  {
    name: 'Sleep Duration and Quality: Impact on Lifestyle Behaviors and Cardiometabolic Health (AHA Scientific Statement)',
    source: 'St-Onge et al. — Circulation 2016;134(18):e367–e386',
    url: 'https://doi.org/10.1161/CIR.0000000000000444',
    license: 'Copyright American Heart Association; cited for a numeric recommendation only',
    usage: 'Adult sleep recommendation of 7 or more hours a night, and the definition of short sleep as under 7 hours.',
  },
  {
    name: 'Recovery Sleep After Sleep Restriction Is Insufficient to Return Elevated Daytime Heart Rate and Systolic Blood Pressure to Baseline Levels',
    source: 'Reichenberger et al. — Psychosomatic Medicine 2023;85(8):744–751',
    url: 'https://doi.org/10.1097/PSY.0000000000001229',
    license: 'Copyright American Psychosomatic Society; cited for numeric findings only',
    usage: 'Context shown after very short sleep: heart rate about 5.5 bpm and systolic pressure about 2.9 mmHg above baseline after two recovery nights (15 men, no control group).',
  },
  {
    name: 'Disturbed Glucoregulatory Response to Food Intake After Moderate Sleep Restriction',
    source: 'Schmid et al. — Sleep 2011;34(3):371–377',
    url: 'https://doi.org/10.1093/sleep/34.3.371',
    license: 'Copyright Associated Professional Sleep Societies; cited for numeric findings only (abstract read)',
    usage: 'Context shown when glucose is raised after very short sleep: higher glucose peak after breakfast following two nights of about 4 hours, with fasting glucose unchanged (15 men).',
  },
  {
    name: 'Fluid shifts, vasodilatation and ambulatory blood pressure reduction during long duration spaceflight',
    source: 'Norsk, Asmar, Damgaard, Christensen — Journal of Physiology 2015;593(3):573–584',
    url: 'https://doi.org/10.1113/jphysiol.2014.284869',
    license: 'Copyright the authors and The Physiological Society; cited for numeric findings only',
    usage: 'Expected shift on the ISS: 24-hour blood pressure 8–10 mmHg lower and heart rate unchanged (eight astronauts, 85–192 days in flight).',
  },
  {
    name: 'The Partial Gravity of the Moon and Mars Appears Insufficient to Maintain Human Health',
    source: 'Jones HW — NASA Ames, ICES-2021-142 (NTRS 20210019591)',
    url: 'https://ntrs.nasa.gov/citations/20210019591',
    license: 'NASA public release (government public use permitted)',
    usage: 'Evidence note for the lunar and Mars environments: gravity below 0.4 g is probably insufficient to maintain heart, muscle and bone conditioning.',
  },
  {
    name: 'British Thoracic Society Guideline for oxygen use in adults in healthcare and emergency settings',
    source: "O'Driscoll, Howard, Earis, Mak — BMJ Open Respiratory Research 2017;4(1):e000170",
    url: 'https://doi.org/10.1136/bmjresp-2016-000170',
    license: 'Creative Commons Attribution Non Commercial (CC BY-NC 4.0)',
    usage: 'Oxygen saturation target range (94–98%), the 88–92% range suggested for COPD and other listed conditions, and the rule that a fall of 3% or more prompts a fuller check of the person and the oximeter.',
  },
  {
    name: 'Home Oxygen Therapy for Adults with Chronic Lung Disease: An Official American Thoracic Society Clinical Practice Guideline',
    source: 'Jacobs et al. — Am J Respir Crit Care Med 2020;202(10):e121–e141',
    url: 'https://doi.org/10.1164/rccm.202009-3608ST',
    license: 'Copyright American Thoracic Society; cited for a numeric definition only',
    usage: 'Definition of severe resting hypoxaemia (SpO2 88% or below).',
  },
  {
    name: 'Respiratory rate and its associations with disease and lifestyle factors in the general population: the KORA-FF4 study',
    source: 'Rückert-Eheberg et al. — PLoS One 2025;20(3):e0318502',
    url: 'https://doi.org/10.1371/journal.pone.0318502',
    license: 'Creative Commons Attribution (CC BY 4.0)',
    usage: 'Resting adult respiratory-rate range (5th–95th percentile 12.1–20.1 breaths/min, awake at rest) and the conditions linked to faster resting breathing (diabetes, COPD, smoking, abdominal obesity).',
  },
  {
    name: 'Measurement of respiratory rate using wearable devices and applications to COVID-19 detection',
    source: 'Natarajan et al. — NPJ Digital Medicine 2021;4(1):136',
    url: 'https://doi.org/10.1038/s41746-021-00493-6',
    license: 'Creative Commons Attribution (CC BY 4.0)',
    usage: 'Night-time respiratory rate from a wrist wearable (mean 15.4, 95% of values 11.2–20.0 breaths/min). Stored for sleep data; not applied to waking readings.',
  },
  {
    name: 'Reference equations for tidal breathing parameters using structured light plethysmography',
    source: 'Motamedi-Fakhr et al. — ERJ Open Research 2021;7(2):00050-2021',
    url: 'https://doi.org/10.1183/23120541.00050-2021',
    license: 'Creative Commons Attribution Non-Commercial (CC BY-NC 4.0)',
    usage: 'Supports the 12–20 breaths/min adult convention for quiet breathing at rest.',
  },
  {
    name: 'NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information)',
    source: 'NASA Goddard Space Flight Center / Community Coordinated Modeling Center (CCMC)',
    url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    license: 'U.S. Government Public Domain',
    usage: 'Hazards page timeline of solar flares (FLR), solar clouds (CME), magnetic storms (GST) and fast-particle events (SEP); Kp storm readings; and daily counts of SEP catalog reports. A rolling 14-day UTC window refreshes at midnight UTC and on the next visit. Counts are reports, not particle flux, radiation dose or a crew safety rating. DONKI is preliminary research information and may be revised.',
  },
  {
    name: 'NOAA Space Weather Prediction Center (SWPC) — GOES Integral Proton Flux & Scales',
    source: 'NOAA / National Weather Service',
    url: 'https://services.swpc.noaa.gov/',
    license: 'U.S. Government Public Domain',
    usage: 'Existing backend integration for GOES proton measurements and NOAA’s radiation-storm scale. The Hazards page now uses NASA DONKI reports instead; none of its graphs use this NOAA feed.',
  },
  {
    name: 'NASA EONET v3 (Earth Observatory Natural Event Tracker)',
    source: 'NASA Earthdata',
    url: 'https://eonet.gsfc.nasa.gov/api/v3/events',
    license: 'U.S. Government Public Domain',
    usage: 'Hazards page Earth-event map and list, from EONET v3 /events (status=all, days=14, limit=60), refreshed daily. The first 40 reports are listed. This is Earth context, not spacecraft telemetry; locations are approximate. API documentation: https://eonet.gsfc.nasa.gov/docs/v3.',
  },
  {
    name: 'NASA POWER (Prediction Of Worldwide Energy Resources)',
    source: 'NASA Langley Research Center',
    url: 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
    license: 'U.S. Government Public Domain',
    usage: 'Hazards page daily Earth-surface graphs from POWER /api/temporal/daily/point: T2M (temperature), RH2M (humidity), PS (pressure), WS10M (wind), ALLSKY_SFC_SW_DWN (sunlight), and ALLSKY_SFC_UV_INDEX (UV). Original returned units and values are retained. Each graph names its latest available reading. Dates advance daily; missing values remain gaps. These are grid-area estimates for the selected Earth site, not spacecraft cabin readings. Weather typically lags 2–3 days, sunlight 5–7 days, and UV can lag longer.',
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
    name: 'NASA hazard references: Distance from Earth, Gravity Fields, Hostile/Closed Environments',
    license: 'NASA and US government pages; journal papers cited for numeric findings only',
    url: 'https://www.nasa.gov/hrp/hazards/',
    usage: 'Hazard cards on the Hazards page and the environment notes on the Triage page. Each fact links to its own source: NASA Human Research Program hazard pages, NASA-STD-3001 Volumes 1 and 2, NASA OCHMO-TB-004 (carbon dioxide), NSSDCA Moon and Mars fact sheets, NTRS 20250000703, MedlinePlus and FDA pulse oximetry pages, and papers by Nasrini 2020, Strollo 2014, Richter 2017, Beck 2018, Prisk 1995, Conkin 2017 and the Sleep 2022 ISS study.',
  },
  {
    name: 'Environment photographs (Wikimedia Commons copies of NASA images)',
    license: 'Public domain (NASA)',
    url: 'https://commons.wikimedia.org/wiki/File:International_Space_Station_after_undocking_of_STS-132.jpg',
    usage: 'Mission environment picker on the Crew Triage page: ISS after STS-132 undocking (NASA / STS-132 crew); Buzz Aldrin on Apollo 11 (NASA, photo by Neil Armstrong); Mount Sharp, PIA16099 (NASA/JPL-Caltech/MSSS); Orion with the Moon and Earth, Artemis I flight day 13, art001e000673 (NASA). Resized to 960 px wide, otherwise unmodified.',
  },
  {
    name: 'SegThy — neck ultrasound volumes with thyroid, carotid artery and jugular vein outlines',
    license: 'CC BY 4.0',
    url: 'https://doi.org/10.1371/journal.pone.0268550',
    usage: 'Training and cross-validation data for the jugular vein ultrasound check on the Crew Triage page, and its sample frame. Kroenke et al., PLOS ONE 2022. 31 volumes from 16 healthy volunteers; the check reports vein geometry only and is not validated on astronauts or for clinical use.',
  },
  {
    name: 'CAMUS — cardiac ultrasound with left-ventricle outlines (500 patients)',
    license: 'CC BY-NC-SA 4.0',
    url: 'https://www.creatis.insa-lyon.fr/Challenge/camus/',
    usage: 'Training and test data for the heart ultrasound check on the Crew Triage page (left-ventricle outline and ejection fraction). Leclerc et al., IEEE Transactions on Medical Imaging 2019. No CAMUS images are included in the app. Non-commercial research use; not validated on astronauts or for clinical use.',
  },
  {
    name: 'open-anatomy-3d — male and female anatomy models (v0.1.0)',
    license: 'Models CC BY 4.0; code MIT',
    url: 'https://github.com/MervinR07/open-anatomy-3d',
    usage: 'The rotatable 3D body with skeleton and muscles on the Crew Triage page. The model files are unmodified; when showing them the app colours the body, leaves out the organs, vessels and nerves, and smooths the skin for modesty. Credit: Anatomy: BodyParts3D © The Database Center for Life Science (CC BY 4.0); female organs: Human Reference Atlas 3D Reference Organs, HuBMAP (CC BY 4.0); female body: MakeHuman (CC0). Modified by open-anatomy-3d, CC BY 4.0. For education and visualisation, not diagnosis.',
  },
  {
    name: '3D Male Base Mesh (orange-juice-games; GitHub reupload by BoQsc)',
    license: 'CC0 1.0 Universal (Public Domain)',
    url: 'https://github.com/BoQsc/Godot-3D-Male-Base-Mesh',
    usage: 'The simpler 3D body shown on the Crew Triage page if the anatomy models cannot load. Unmodified; the app only colours its regions.',
  },
  {
    name: 'three.js',
    license: 'MIT',
    url: 'https://threejs.org/',
    usage: 'Renders and rotates the 3D body and finds which region was clicked.',
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

interface Citation {name:string;url:string;source?:string;license?:string;usage?:string}
const normalized=(url:string)=>url.replace('www.','').replace('asc-csa.gc.ca','csa-asc.gc.ca').replace(/\/$/,'').toLowerCase()
const existing=new Set([...NASA_CITATIONS,...SOFTWARE_CITATIONS].map(c=>normalized(c.url)))
const research=RESEARCH_CITATIONS.filter((c,i,all)=>!existing.has(normalized(c.url))&&all.findIndex(other=>normalized(other.url)===normalized(c.url))===i)
function SourceList({rows}:{rows:Citation[]}){
 return <ul className="citations-list">{rows.map(c=><li key={c.url+c.name}><a href={c.url} target="_blank" rel="noreferrer">{c.name} ↗</a>{c.source?<small>{c.source}</small>:null}{c.license?<details className="citation-details"><summary>Credit &amp; license</summary><p>{c.license}</p></details>:null}</li>)}</ul>
}
export function CitationsPage() {
 const [query,setQuery]=useState('')
 const match=(text:string)=>text.toLowerCase().includes(query.trim().toLowerCase())
 const groups=[{title:'NASA data & health references',rows:NASA_CITATIONS},{title:'Added research & equipment sources',rows:research},{title:'Software & image credits',rows:SOFTWARE_CITATIONS}]
 const names=NAMED_REFERENCES.filter(match)
 return <div className="citations-page">
  <header><h1>Sources &amp; citations</h1><p>References for Guardian’s graphs, health information and equipment tips.</p></header>
  <label className="citations-search">Find a source<input type="search" placeholder="Search NASA, sleep, equipment…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  {groups.map(group=>{const rows=group.rows.filter(c=>match(c.name+' '+('source' in c?c.source:'')));return rows.length?<Card key={group.title} title={group.title} actions={<span className="badge">{rows.length} sources</span>}><SourceList rows={rows}/></Card>:null})}
  {names.length?<Card title="More references named in your notes"><details className="citations-named" open={query.trim()?true:undefined}><summary>{names.length} named references</summary><p>These titles were supplied without exact publication links. They are kept here for reference.</p><ul>{names.map(name=><li key={name}>{name}</li>)}</ul></details></Card>:null}
  {!groups.some(g=>g.rows.some(c=>match(c.name+' '+('source' in c?c.source:''))))&&!names.length?<p role="status">No matching sources. Try another word.</p>:null}
  <Card title="AI assistance"><p className="citations-note">Codex and Claude helped build Guardian. Qwen3-8B and the ultrasound models produce AI estimates. Synthetic examples stay separate from recorded measurements. Image credits follow their original sources; some media credits still need team confirmation.</p><a href="/si-provenance.json" target="_blank" rel="noreferrer">AI, data and media credits</a></Card>
  <p className="citations-note">Research references are not automatically training datasets. The original source sets its access and reuse rules. User vitals come from your saved cards; NASA graphs describe the environment. Guardian is an educational prototype, not a medical device.</p>
 </div>
}
