import type { BodyRegionId, HeartFrame, HeartScanResult, JugularScanResult, ScanLegendEntry, ScanQuality } from '@astrovitals/shared'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { useAsync } from './common'

/** One ultrasound check: which body region offers it and which frames its model needs. */
export interface UltrasoundCheck {
  id: 'heart' | 'jugular'
  region: BodyRegionId
  title: string
  summary: string
  measures: string[]
  frames: { id: string; label: string; hint: string }[]
  depthHint: string
  note: string
  /** A frame to try the check with, when one can be redistributed. */
  sample?: { frames: Record<string, string>; depthCm: string; credit: string }
}

export const ULTRASOUND_CHECKS: UltrasoundCheck[] = [
  {
    id: 'jugular',
    region: 'head_neuro',
    title: 'Neck vein scan',
    summary: 'Shows the outline and size of a large vein in the neck. In weightlessness, blood moves toward the head, and this vein may widen or drain more slowly.',
    measures: ['Size of the vein in the scan', 'Whether the scanner probe may be pressing too hard', 'Vein size compared with the nearby artery', 'Whether the image is clear enough to use'],
    frames: [{ id: 'transverse', label: 'Neck cross-section', hint: 'Probe across the neck, skin at the top of the image' }],
    depthHint: 'e.g. 4',
    sample: {
      frames: { transverse: '/samples/jugular-neck-sample.png' },
      depthCm: '5.4',
      credit: 'Sample frame: SegThy dataset, Technical University of Munich (CC BY 4.0). It is one of the scans the model learned from, so it shows the model at its best.',
    },
    note: 'Measures shape and size only. It does not show blood flow or clots.',
  },
  {
    id: 'heart',
    region: 'chest_cardio',
    title: 'Heart scan',
    summary: 'Uses four scan images to outline the heart’s main pumping chamber and estimate how much blood it pushes out with each beat.',
    measures: ['Outline of the heart’s main pumping chamber', 'Amount of blood before and after a beat', 'Share of blood pumped out with each beat'],
    frames: [
      { id: '2CH_ED', label: '2-chamber, full', hint: 'Two-chamber view at the end of filling' },
      { id: '2CH_ES', label: '2-chamber, emptied', hint: 'Two-chamber view at the end of the beat' },
      { id: '4CH_ED', label: '4-chamber, full', hint: 'Four-chamber view at the end of filling' },
      { id: '4CH_ES', label: '4-chamber, emptied', hint: 'Four-chamber view at the end of the beat' },
    ],
    depthHint: 'e.g. 16',
    note: 'An estimate from a research model, not a medical ultrasound report.',
  },
]

interface Frame {
  name: string
  url: string
  file: File
}

type Frames = Record<string, Frame | undefined>
type Result = { kind: 'jugular'; data: JugularScanResult } | { kind: 'heart'; data: HeartScanResult }

const MAX_BYTES = 10 * 1024 * 1024
const MAX_SIDE = 1024

/**
 * The frame as base64 PNG, shrunk to at most MAX_SIDE pixels on its longer side. Redrawing it also
 * drops anything stored inside the file besides the picture, such as a name written by the scanner.
 */
async function framePng(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * k))
  canvas.height = Math.max(1, Math.round(bitmap.height * k))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/png').split(',')[1]!
}

function FrameSlot({ label, hint, frame, overlay, onPick, onClear }: { label: string; hint: string; frame?: Frame; overlay?: string; onPick: (file: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div className="us-slot">
      <button
        type="button"
        className={`us-drop${over ? ' over' : ''}${frame ? ' filled' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const file = e.dataTransfer.files[0]
          if (file) onPick(file)
        }}
        aria-label={frame ? `${label}: replace ${frame.name}` : `${label}: choose an image`}
      >
        {frame ? (
          // The outline is drawn to the frame's own size, so the two stay aligned at any width.
          <span className="us-frame">
            <img src={frame.url} alt={`${label} ultrasound frame`} />
            {overlay ? <img className="us-overlay" src={`data:image/png;base64,${overlay}`} alt="SI-generated segmentation overlay" /> : null}
          </span>
        ) : (
          <span className="us-drop-empty">Choose or drop an image</span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
      <div className="us-slot-foot">
        <span>
          <strong>{label}</strong>
          <small>{frame ? frame.name : hint}</small>
        </span>
        {frame ? <button type="button" className="us-clear" onClick={onClear}>Remove</button> : null}
      </div>
    </div>
  )
}

const fixed = (n: number | null, digits = 0) => (n === null ? 'not available' : n.toFixed(digits))

function Legend({ entries }: { entries: ScanLegendEntry[] }) {
  return (
    <div className="us-legend">
      {entries.map((e) => (
        <span key={e.label}>
          <i style={{ background: e.colour }} aria-hidden="true" />
          {e.label}
        </span>
      ))}
    </div>
  )
}

/** A scan-quality line, said in words so it never depends on colour alone. */
function Quality({ quality }: { quality: ScanQuality }) {
  return quality.accept ? (
    <p className="us-quality ok">Scan accepted: the outline passed the quality checks.</p>
  ) : (
    <p className="us-quality rescan">Rescan advised: {quality.reasons.join('; ') || 'the scan did not pass the quality checks'}.</p>
  )
}

function Results({ result }: { result: Result }) {
  const rows: [string, string][] =
    result.kind === 'jugular'
      ? result.data.measurements.veinFound
        ? [
            ['Vein cross-section area', `${fixed(result.data.measurements.areaMm2)} mm²`],
            ['Long × short axis', `${fixed(result.data.measurements.longAxisMm, 1)} × ${fixed(result.data.measurements.shortAxisMm, 1)} mm`],
            ['Flattening (short ÷ long)', fixed(result.data.measurements.flattening, 2)],
            ['Vein-to-artery ratio', fixed(result.data.measurements.veinToArtery, 2)],
          ]
        : []
      : [
          ['Ejection fraction', result.data.ejectionFraction === null ? 'not available' : `${fixed(result.data.ejectionFraction)}%`],
          ['Volume when full', `${fixed(result.data.endDiastolicVolumeMl)} mL`],
          ['Volume when emptied', `${fixed(result.data.endSystolicVolumeMl)} mL`],
          ['Ejection fraction from geometry alone', result.data.geometryEjectionFraction === null ? 'not available' : `${fixed(result.data.geometryEjectionFraction)}%`],
        ]
  return (
    <div className="us-results" role="status">
      <strong>Analysis</strong>
      <Quality quality={result.data.quality} />
      {rows.length ? (
        <dl>
          {rows.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <Legend entries={result.data.legend} />
    </div>
  )
}

/**
 * Ultrasound upload and analysis for the selected body region: the heart check on the chest, the
 * jugular vein check on the head and neck. Frames are sent to the server for analysis and are not
 * stored there.
 */
export function UltrasoundCard({ region }: { region: BodyRegionId }) {
  const [frames, setFrames] = useState<Record<string, Frames>>({})
  const [depth, setDepth] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, Result | undefined>>({})
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const urls = useRef(new Set<string>())
  const status = useAsync(() => api.ultrasoundStatus(), [])

  useEffect(() => {
    const made = urls.current
    return () => made.forEach((u) => URL.revokeObjectURL(u))
  }, [])
  useEffect(() => setError(undefined), [region])

  const check = ULTRASOUND_CHECKS.find((c) => c.region === region)
  if (!check) return null

  const mine = frames[check.id] ?? {}
  const result = results[check.id]
  // A result belongs to the frames and depth it was made from, so any change clears it.
  const clearResult = () => setResults((all) => ({ ...all, [check.id]: undefined }))
  const set = (slot: string, frame?: Frame) => {
    const old = mine[slot]
    if (old) {
      URL.revokeObjectURL(old.url)
      urls.current.delete(old.url)
    }
    setFrames((all) => ({ ...all, [check.id]: { ...all[check.id], [slot]: frame } }))
    clearResult()
  }
  const pick = (slot: string, file: File) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError('Use a PNG or JPEG image.')
    if (file.size > MAX_BYTES) return setError('That image is larger than 10 MB.')
    setError(undefined)
    const url = URL.createObjectURL(file)
    urls.current.add(url)
    set(slot, { name: file.name, url, file })
  }

  const loadSample = async () => {
    if (!check.sample) return
    setError(undefined)
    try {
      for (const [slot, path] of Object.entries(check.sample.frames)) {
        const blob = await (await fetch(path)).blob()
        pick(slot, new File([blob], path.split('/').pop()!, { type: 'image/png' }))
      }
      setDepth((d) => ({ ...d, [check.id]: check.sample!.depthCm }))
    } catch {
      setError('The sample scan could not be loaded.')
    }
  }

  const filled = check.frames.filter((f) => mine[f.id]).length
  const depthCm = Number(depth[check.id])
  const depthOk = depth[check.id] !== undefined && depth[check.id] !== '' && Number.isFinite(depthCm) && depthCm >= 1 && depthCm <= 30
  const ready = filled === check.frames.length && depthOk
  const available = status.data?.available === true

  const analyse = async () => {
    setBusy(true)
    setError(undefined)
    try {
      if (check.id === 'jugular') {
        const data = await api.analyseJugular(await framePng(mine.transverse!.file), depthCm)
        setResults((all) => ({ ...all, jugular: { kind: 'jugular', data } }))
      } else {
        const sent = Object.fromEntries(await Promise.all(check.frames.map(async (f) => [f.id, await framePng(mine[f.id]!.file)] as const))) as Record<HeartFrame, string>
        const data = await api.analyseHeart(sent, depthCm)
        setResults((all) => ({ ...all, heart: { kind: 'heart', data } }))
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) status.reload()
      setError(e instanceof ApiError ? e.message : 'That image could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const overlayFor = (slot: string) => (!result ? undefined : result.kind === 'jugular' ? result.data.overlayPng : result.data.overlays[slot as HeartFrame])
  const hint = !available
    ? status.loading
      ? 'Checking the analysis service…'
      : 'The analysis service is not running, so scans cannot be analysed right now.'
    : !ready
      ? `Add ${check.frames.length === 1 ? 'the frame' : `all ${check.frames.length} frames`} and the image depth to analyse.`
      : 'Frames are sent to the server for analysis and are not stored.'

  return (
    <section className="us-card" aria-labelledby={`us-${check.id}`}>
      <div className="us-head">
        <div>
          <span className="eyebrow">Ultrasound images</span>
          <h3 id={`us-${check.id}`}>{check.title}</h3>
        </div>
        <span className="badge">{filled} of {check.frames.length} {check.frames.length === 1 ? 'frame' : 'frames'}</span>
      </div>
      <p className="muted">{check.summary}</p>

      <div className={`us-slots${check.frames.length === 1 ? ' single' : ''}`}>
        {check.frames.map((f) => (
          <FrameSlot key={f.id} label={f.label} hint={f.hint} frame={mine[f.id]} overlay={overlayFor(f.id)} onPick={(file) => pick(f.id, file)} onClear={() => set(f.id)} />
        ))}
      </div>

      <label className="us-depth">
        Image depth shown on the scanner (cm)
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={30}
          step={0.5}
          placeholder={check.depthHint}
          value={depth[check.id] ?? ''}
          onChange={(e) => {
            setDepth((d) => ({ ...d, [check.id]: e.target.value }))
            clearResult()
          }}
        />
        <small>Needed to turn pixels into real sizes. The image should show only the scan, top to bottom.</small>
      </label>

      {error ? <div className="banner error" role="alert">{error}</div> : null}

      <div className="us-actions">
        <button type="button" className="primary" disabled={!ready || !available || busy} onClick={analyse}>
          {busy ? 'Analysing…' : result ? 'Check again' : 'Check these images'}
        </button>
        {check.sample ? <button type="button" onClick={loadSample} disabled={busy}>Try a sample scan</button> : null}
        <small>{hint}</small>
      </div>

      {result ? (
        <Results result={result} />
      ) : (
        <div>
          <small>What the scan check measures:</small>
          <ul className="compact-list">
            {check.measures.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {check.sample ? <small>{check.sample.credit}</small> : null}
      <small>{check.note} Research prototype, not a diagnostic tool. Outlines and derived measurements are SI-generated model outputs.</small>
    </section>
  )
}
