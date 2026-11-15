import { compareToBaseline, type BaselineDatasetResponse, type LabPoint } from '@astrovitals/shared'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Vendored, unmodified NASA file (CC0-1.0); provenance and checksum in datasets/osd-575/README.md. */
export const OSD575_CSV = resolve(import.meta.dirname, '../../datasets/osd-575/LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv')

const NAMES: Record<string, string> = {
  albumin: 'Albumin',
  albumin_to_globulin_ratio: 'Albumin/globulin ratio',
  alkaline_phosphatase: 'Alkaline phosphatase',
  alt: 'ALT',
  ast: 'AST',
  total_bilirubin: 'Total bilirubin',
  bun_to_creatinine_ratio: 'BUN/creatinine ratio',
  calcium: 'Calcium',
  carbon_dioxide: 'Carbon dioxide (bicarbonate)',
  chloride: 'Chloride',
  creatinine: 'Creatinine',
  globulin: 'Globulin',
  glucose: 'Glucose',
  potassium: 'Potassium',
  total_protein: 'Total protein',
  sodium: 'Sodium',
  urea_nitrogen_bun: 'Urea nitrogen (BUN)',
}

const UNITS: Record<string, string> = {
  gram_per_deciliter: 'g/dL',
  milligram_per_deciliter: 'mg/dL',
  millimol_per_liter: 'mmol/L',
  units_per_liter: 'U/L',
}

/** Overview starts with these five (Vihaan's spec, 2026-10-11); the rest are available in the API. */
export const FEATURED = ['sodium', 'potassium', 'glucose', 'creatinine', 'albumin']

const EXCLUDED = [
  { id: 'egfr_african_american', reason: 'Race-based eGFR (2009 CKD-EPI), retired by labs in 2021. Creatinine, the measurement it is computed from, is shown instead.' },
  { id: 'egfr_non_african_american', reason: 'Race-based eGFR (2009 CKD-EPI), retired by labs in 2021. Creatinine, the measurement it is computed from, is shown instead.' },
]

/** Minimal RFC 4180 reader (quoted fields, embedded commas/quotes); the file is 8 KB. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((c) => c !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c !== '')) rows.push(row)
  return rows
}

const num = (v: string | undefined) => {
  const t = (v ?? '').trim()
  return t === '' || /^n\/?a$/i.test(t) || !Number.isFinite(Number(t)) ? null : Number(t)
}

/** "C001_serum_L-92" → crew C001, day -92; "R+45" → day +45. */
export function parseSampleName(name: string): { crew: string; timepoint: string; day: number } | null {
  const m = /^(C\d{3})_serum_([LR])([+-]\d+)$/.exec(name.trim())
  if (!m) return null
  return { crew: m[1]!, timepoint: `${m[2]}${m[3]}`, day: Number(m[3]) }
}

export function buildOsd575(csvText: string): BaselineDatasetResponse {
  const [header, ...body] = parseCsv(csvText)
  if (!header || header[0] !== 'Sample Name') throw new Error('OSD-575 CMP file: unexpected header')

  // Columns come in triples per analyte: <id>_value[_unit], <id>_range_min[_unit], <id>_(range_)max[_unit].
  const analyteCols = new Map<string, { value: number; min?: number; max?: number; unitKey: string }>()
  header.forEach((col, i) => {
    const v = /^(.+?)_value(?:_(.+))?$/.exec(col)
    if (v) { analyteCols.set(v[1]!, { ...analyteCols.get(v[1]!), value: i, unitKey: v[2] ?? '' }); return }
    const r = /^(.+?)_(?:range_)?(min|max)(?:_|$)/.exec(col)
    if (r && analyteCols.has(r[1]!)) analyteCols.get(r[1]!)![r[2] as 'min' | 'max'] = i
  })

  const samples = body.map((cells) => ({ id: parseSampleName(cells[0] ?? ''), cells })).filter((s) => s.id !== null) as { id: NonNullable<ReturnType<typeof parseSampleName>>; cells: string[] }[]
  const crew = [...new Set(samples.map((s) => s.id.crew))].sort()
  const timepoints = [...new Map(samples.map((s) => [s.id.timepoint, s.id.day])).entries()]
    .map(([label, day]) => ({ label, day, phase: (day < 0 ? 'pre' : 'post') as 'pre' | 'post' }))
    .sort((a, b) => (a.phase === b.phase ? a.day - b.day : a.phase === 'pre' ? -1 : 1))

  const excludedIds = new Set(EXCLUDED.map((e) => e.id))
  const analytes = [...analyteCols.entries()]
    .filter(([id]) => !excludedIds.has(id))
    .map(([id, c]) => ({
      id,
      name: NAMES[id] ?? id,
      unit: UNITS[c.unitKey] ?? (c.unitKey === '' ? 'ratio' : c.unitKey),
      byCrew: Object.fromEntries(
        crew.map((who) => [
          who,
          compareToBaseline(
            samples
              .filter((s) => s.id.crew === who)
              .map((s): LabPoint => ({
                timepoint: s.id.timepoint,
                day: s.id.day,
                value: num(s.cells[c.value]),
                refMin: c.min === undefined ? null : num(s.cells[c.min]),
                refMax: c.max === undefined ? null : num(s.cells[c.max]),
              })),
          ),
        ]),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    dataset: {
      id: 'OSD-575',
      title: 'SpaceX Inspiration4 Blood Serum Metabolic Panel (Comprehensive Metabolic Panel)',
      doi: '10.26030/mc5d-p710',
      license: 'CC0-1.0',
      url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
      mission: 'SpaceX Inspiration4 (September 2021, low Earth orbit)',
      missionDays: 3,
    },
    crew,
    timepoints,
    analytes,
    featured: FEATURED.filter((id) => analytes.some((a) => a.id === id)),
    excluded: EXCLUDED,
    caveats: [
      'Baseline = the median (middle value) of each person’s three preflight draws: L-92, L-44 and L-3 days before launch.',
      'Change = later reading − baseline, also shown as a percentage of the baseline. It describes the record; it is not a statistical test, a diagnosis or a health assessment.',
      'Whether a reading sits inside the source lab’s reference range is reported separately. That range is for a general population and varied between some draws.',
      'Amber marks a reading outside the lab’s reference range or a data-quality notice. The size of a change alone never turns a result amber.',
      'Inspiration4 was a 3-day mission in low Earth orbit, not a long-duration mission. This file has no in-flight draws and no illness labels: it is recorded data, not a live astronaut feed.',
      'A Reference Change Value would need verified analytical and within-subject variation for each assay; it is not used.',
    ],
  }
}

let cached: BaselineDatasetResponse | undefined
export function loadOsd575(): BaselineDatasetResponse {
  cached ??= buildOsd575(readFileSync(OSD575_CSV, 'utf8'))
  return cached
}
