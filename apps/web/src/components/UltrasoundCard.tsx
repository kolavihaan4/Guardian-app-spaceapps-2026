import type { BodyRegionId } from '@astrovitals/shared'
import { useEffect, useRef, useState } from 'react'

/** One ultrasound check: which body region offers it and which frames its model needs. */
export interface UltrasoundCheck {
  id: 'heart' | 'jugular'
  region: BodyRegionId
  title: string
  summary: string
  measures: string[]
  frames: { id: string; label: string; hint: string }[]
  note: string
}

export const ULTRASOUND_CHECKS: UltrasoundCheck[] = [
  {
    id: 'jugular',
    region: 'head_neuro',
    title: 'Neck vein scan',
    summary: 'Shows the outline and size of a large vein in the neck. In weightlessness, blood moves toward the head, and this vein may widen or drain more slowly.',
    measures: ['Size of the vein in the scan', 'Whether the scanner probe may be pressing too hard', 'Vein size compared with the nearby artery', 'Whether the image is clear enough to use'],
    frames: [{ id: 'transverse', label: 'Neck cross-section', hint: 'Probe across the neck, skin at the top of the image' }],
    note: 'Measures shape and size only. It does not show blood flow or clots.',
  },
  {
    id: 'heart',
    region: 'chest_cardio',
    title: 'Heart scan',
    summary: 'Uses four scan images to outline the heart’s main pumping chamber and estimate how much blood it pushes out with each beat.',
    measures: ['Outline of the heart’s main pumping chamber', 'Amount of blood before and after a beat', 'Share of blood pumped out with each beat'],
    frames: [
      { id: '2ch_ed', label: '2-chamber, full', hint: 'Two-chamber view at the end of filling' },
      { id: '2ch_es', label: '2-chamber, emptied', hint: 'Two-chamber view at the end of the beat' },
      { id: '4ch_ed', label: '4-chamber, full', hint: 'Four-chamber view at the end of filling' },
      { id: '4ch_es', label: '4-chamber, emptied', hint: 'Four-chamber view at the end of the beat' },
    ],
    note: 'An estimate from a research model, not a medical ultrasound report.',
  },
]

interface Frame {
  name: string
  url: string
}

type Frames = Record<string, Frame | undefined>

const MAX_BYTES = 10 * 1024 * 1024

function FrameSlot({ label, hint, frame, onPick, onClear }: { label: string; hint: string; frame?: Frame; onPick: (file: File) => void; onClear: () => void }) {
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
        {frame ? <img src={frame.url} alt={`${label} ultrasound frame`} /> : <span className="us-drop-empty">Choose or drop an image</span>}
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

/**
 * Ultrasound upload for the selected body region: the heart check on the chest, the jugular vein
 * check on the head and neck. The frames stay in the browser until the analysis service exists.
 */
export function UltrasoundCard({ region }: { region: BodyRegionId }) {
  const [frames, setFrames] = useState<Record<string, Frames>>({})
  const [depth, setDepth] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>()
  const urls = useRef(new Set<string>())

  useEffect(() => {
    const made = urls.current
    return () => made.forEach((u) => URL.revokeObjectURL(u))
  }, [])
  useEffect(() => setError(undefined), [region])

  const check = ULTRASOUND_CHECKS.find((c) => c.region === region)
  if (!check) return null

  const mine = frames[check.id] ?? {}
  const set = (slot: string, frame?: Frame) => {
    const old = mine[slot]
    if (old) {
      URL.revokeObjectURL(old.url)
      urls.current.delete(old.url)
    }
    setFrames((all) => ({ ...all, [check.id]: { ...all[check.id], [slot]: frame } }))
  }
  const pick = (slot: string, file: File) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError('Use a PNG or JPEG image.')
    if (file.size > MAX_BYTES) return setError('That image is larger than 10 MB.')
    setError(undefined)
    const url = URL.createObjectURL(file)
    urls.current.add(url)
    set(slot, { name: file.name, url })
  }

  const filled = check.frames.filter((f) => mine[f.id]).length
  const depthCm = Number(depth[check.id])
  const depthOk = Number.isFinite(depthCm) && depthCm >= 1 && depthCm <= 30
  const ready = filled === check.frames.length && depthOk

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
          <FrameSlot key={f.id} label={f.label} hint={f.hint} frame={mine[f.id]} onPick={(file) => pick(f.id, file)} onClear={() => set(f.id)} />
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
          placeholder="e.g. 4"
          value={depth[check.id] ?? ''}
          onChange={(e) => setDepth((d) => ({ ...d, [check.id]: e.target.value }))}
        />
        <small>Needed to turn pixels into real sizes.</small>
      </label>

      {error ? <div className="banner error" role="alert">{error}</div> : null}

      <div>
        <small>What the scan check measures:</small>
        <ul className="compact-list">
          {check.measures.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>

      <div className="us-actions">
        <button type="button" className="primary" disabled>Check these images</button>
        <small role="status">
          {ready ? 'Frames are ready. ' : ''}The analysis service is not connected yet, so scans cannot be analysed. Images stay on this device.
        </small>
      </div>
      <small>{check.note} Research prototype, not a diagnostic tool.</small>
    </section>
  )
}
