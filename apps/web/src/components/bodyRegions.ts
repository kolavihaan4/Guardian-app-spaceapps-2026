import type { BodyRegionId } from '@astrovitals/shared'

/** The coarse part of the body a vertex belongs to, taken from the bone that moves it most. */
export type BodyPart = 'head' | 'arm' | 'leg' | 'torso'

/**
 * Names the body part for a bone of the 3D model (public/models/male_base_mesh.glb). The model
 * loader strips dots from bone names ("spine.005" arrives as "spine005"), so both forms work.
 */
export function bodyPartForBone(boneName: string): BodyPart {
  const bone = boneName.replace(/\./g, '')
  if (bone === 'spine005' || bone === 'spine004') return 'head'
  if (/^(shoulder|upper_arm|forearm|hand|f_|thumb)/.test(bone)) return 'arm'
  if (/^(thigh|shin|foot|toe|heel)/.test(bone)) return 'leg'
  return 'torso' // spine, spine.001–003 and pelvis.*
}

/**
 * Decides which clickable region a point on the body is in. Arms and legs are whole regions. The
 * head and torso are divided by position, because the model's bones do not line up with the app's
 * regions: the eyes are a band across the front of the head; on the torso, a narrow strip down the
 * back is the spine, and the rest is chest above the lower ribs and abdomen below.
 *
 * This runs on the smoothed surface, so these boundaries come out as clean straight lines.
 * Coordinates are the model's own: +x is the front of the body, y is height (feet near -1, top of
 * the head near +0.95), z is side to side.
 */
export function regionForPoint(part: BodyPart, x: number, y: number, z: number): BodyRegionId {
  if (part === 'arm') return 'upper_limbs'
  if (part === 'leg') return 'lower_limbs'
  if (part === 'head') return x > 0.015 && y >= 0.775 && y <= 0.845 ? 'eyes_sans' : 'head_neuro'
  // The strip stops short of the neck and hips so its ends are straight, not the ragged edge of a bone's reach.
  if (x < 0 && Math.abs(z) < 0.05 && y >= -0.03 && y <= 0.62) return 'spine_bone'
  return y >= 0.27 ? 'chest_cardio' : 'abdomen_nutrition'
}

/**
 * Names the app region for a structure of the anatomy models (public/models/anatomy-*.glb), from
 * its key in anatomyStructures.ts. Arms include the shoulder girdle and legs include the hip
 * muscles, matching the region names "Shoulders, Arms" and "Legs, Hips". Anything not listed is
 * an abdominal or pelvic organ.
 */
export function regionForStructure(key: string): BodyRegionId {
  if (/^eye_/.test(key)) return 'eyes_sans'
  if (/^(brain|cerebellum|brainstem|pituitary|skull|mandible|teeth|tongue|salivary_glands|pharynx|cranial_nerves|arteries_head|carotid_|neck_muscles_)/.test(key)) return 'head_neuro'
  if (/^(spine_|spinal_cord|back_muscles_|pelvis$)/.test(key)) return 'spine_bone'
  if (/^(humerus|forearm|hand|scapula|clavicle|deltoid|trapezius|rotator_cuff|shoulder|upper_arm|elbow|wrist)_|_arm_/.test(key)) return 'upper_limbs'
  if (/^(femur|lower_leg|patella|foot|gluteal|quadriceps|hamstrings|adductors|calf|shin|hip|knee|ankle)_|_leg_/.test(key)) return 'lower_limbs'
  if (/^(heart|lung_|bronchi|trachea|thymus|esophagus|larynx|ribs_|sternum|aorta|coronary_arteries|pulmonary_vessels|vena_cava_superior|chest_muscles_|intercostals_|diaphragm|breast_)|_thorax$/.test(key)) return 'chest_cardio'
  return 'abdomen_nutrition'
}

/**
 * Where the regions of one anatomy model's skin begin and end, measured from that model's own
 * bones. The male and female models differ in height and build, so fixed numbers fit only one.
 */
export interface SkinLandmarks {
  /** Points on the bones and muscles of the arms and hands: x, y, z per point. */
  armParts: Float32Array
  /** Points on the bones and muscles of the trunk and thighs, in the same form. */
  trunkParts: Float32Array
  /** No part of an arm is closer to the midline than `armReach` or lower than `armFloor`, so points beyond need no arm test. */
  armReach: number
  armFloor: number
  /** The middle of the backbone, front to back: the spine strip is the skin behind it. */
  spineDepth: number
  /** Just under the jaw: the head region is everything above. */
  headBase: number
  /** The band across the front of the face that holds the eyes. */
  eyes: { yMin: number; yMax: number; halfWidth: number; zMin: number }
  /** Half-way between the tip of the breastbone and the lowest ribs: chest above, abdomen below. */
  chestBase: number
  /** The top of the thigh bones: legs and hips below. */
  legTop: number
  /** +1 when the model's left side is at positive x, -1 when it is at negative x. */
  leftSign: number
  /** Measurements that divide the regions into smaller parts. Each is absent when the model lacks the structure it is taken from. */
  parts: PartMarks
}

/** The smaller parts of the body that can be picked on the 3D figure, inside the app's regions. */
const SIDED_KINDS = ['shoulder_front', 'shoulder_back', 'upper_arm_front', 'upper_arm_back', 'forearm_front', 'forearm_back', 'palm', 'hand_back', 'chest_upper', 'chest_lower', 'abdomen', 'upper_back', 'lower_back', 'glute', 'quad', 'hamstring', 'knee', 'shin', 'calf', 'foot'] as const
type SidedKind = (typeof SIDED_KINDS)[number]
export type BodyZoneId = 'head' | 'eyes' | 'neck' | 'spine' | `${SidedKind}_${'l' | 'r'}`

const KIND_INFO: Record<SidedKind | 'head' | 'eyes' | 'neck' | 'spine', { label: string; region: BodyRegionId }> = {
  head: { label: 'Head', region: 'head_neuro' },
  eyes: { label: 'Eyes', region: 'eyes_sans' },
  neck: { label: 'Neck', region: 'head_neuro' },
  spine: { label: 'Spine', region: 'spine_bone' },
  shoulder_front: { label: 'front shoulder', region: 'upper_limbs' },
  shoulder_back: { label: 'back shoulder', region: 'upper_limbs' },
  upper_arm_front: { label: 'upper arm (front)', region: 'upper_limbs' },
  upper_arm_back: { label: 'upper arm (back)', region: 'upper_limbs' },
  forearm_front: { label: 'forearm (front)', region: 'upper_limbs' },
  forearm_back: { label: 'forearm (back)', region: 'upper_limbs' },
  palm: { label: 'palm', region: 'upper_limbs' },
  hand_back: { label: 'back of hand', region: 'upper_limbs' },
  chest_upper: { label: 'upper chest', region: 'chest_cardio' },
  chest_lower: { label: 'lower chest', region: 'chest_cardio' },
  abdomen: { label: 'abdomen', region: 'abdomen_nutrition' },
  upper_back: { label: 'upper back', region: 'spine_bone' },
  lower_back: { label: 'lower back', region: 'spine_bone' },
  glute: { label: 'glute', region: 'lower_limbs' },
  quad: { label: 'front thigh (quads)', region: 'lower_limbs' },
  hamstring: { label: 'back thigh (hamstrings)', region: 'lower_limbs' },
  knee: { label: 'knee', region: 'lower_limbs' },
  shin: { label: 'shin', region: 'lower_limbs' },
  calf: { label: 'calf', region: 'lower_limbs' },
  foot: { label: 'foot', region: 'lower_limbs' },
}

const bothSides = (kinds: readonly SidedKind[]) => kinds.flatMap((k) => [`${k}_l`, `${k}_r`] as BodyZoneId[])

/** Every part, in head-to-foot order. */
export const BODY_ZONES: BodyZoneId[] = ['head', 'eyes', 'neck', ...bothSides(SIDED_KINDS.slice(0, 13)), 'spine', ...bothSides(SIDED_KINDS.slice(13))]

function kindOf(zone: BodyZoneId): keyof typeof KIND_INFO {
  return zone.replace(/_[lr]$/, '') as keyof typeof KIND_INFO
}

/** The app region a part belongs to. */
export function regionForZone(zone: BodyZoneId): BodyRegionId {
  return KIND_INFO[kindOf(zone)].region
}

/** A part's name for people, such as "Left shoulder". */
export function zoneLabel(zone: BodyZoneId): string {
  const { label } = KIND_INFO[kindOf(zone)]
  return zone.endsWith('_l') ? `Left ${label}` : zone.endsWith('_r') ? `Right ${label}` : label
}

type Point = [x: number, y: number, z: number]
/** A line in the side view: the depth (z) of a bone at two heights. */
type DepthLine = { y0: number; z0: number; y1: number; z1: number }

interface PartMarks {
  /** The top of the collarbones: the neck is above. */
  neckBase?: number
  /** The shoulder is the cap outside `inner` (distance from the midline) and above `yMin`. */
  shoulder?: { inner: number; yMin: number }
  /** Each arm's elbow and wrist, and the direction from one to the other. */
  arms: Partial<Record<'l' | 'r', { elbow: Point; wrist: Point; along: Point }>>
  /** The middle of the trunk, thigh and lower leg from front to back: front parts are ahead of it. */
  trunkMid?: DepthLine
  thighMid?: DepthLine
  lowerLegMid?: DepthLine
  /** The heights the gluteal muscles span. */
  glute?: { yMin: number; yMax: number }
  /** The band of height around the kneecaps, and the top of the foot bones. */
  knee?: { yMin: number; yMax: number }
  footTop?: number
}

const PART_STRUCTURES = /^((clavicle|deltoid|humerus|forearm|lower_leg|gluteal|patella|foot|ribs|femur)_[lr]|pelvis)$/

// The chest, back and shoulder muscles are left out: they run from the trunk onto the arm, so they
// would blur the line between the two.
const ARM_PARTS = /^(humerus|forearm|hand|upper_arm_muscles|forearm_muscles|hand_muscles)_[lr]$/
const TRUNK_PARTS = /^((ribs|femur|gluteal|quadriceps|hamstrings|adductors)_[lr]|sternum|spine_thoracic|spine_lumbar|pelvis|abdominal_muscles)$/
const SAMPLES_PER_PART = 160

/** Whether `skinLandmarks` reads this structure, so the caller can skip the rest. */
export function isSkinLandmarkPart(key: string): boolean {
  return ARM_PARTS.test(key) || TRUNK_PARTS.test(key) || PART_STRUCTURES.test(key) || /^(mandible|eye_[lr])$/.test(key)
}

function extent(points: Float32Array, axis: 0 | 1 | 2): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (let i = axis; i < points.length; i += 3) {
    if (points[i]! < min) min = points[i]!
    if (points[i]! > max) max = points[i]!
  }
  return { min, max }
}

/**
 * Measures the landmarks from a model's structures: each key is a name in anatomyStructures.ts and
 * each value is that structure's vertices (x, y, z per vertex, in the model's world metres).
 * Returns null when a structure it needs is missing.
 */
export function skinLandmarks(structures: Record<string, Float32Array | undefined>): SkinLandmarks | null {
  const { mandible, sternum, eye_l: eyeL, eye_r: eyeR, spine_thoracic: spine } = structures
  const ribs = structures.ribs_l
  const femur = structures.femur_l
  if (!mandible || !sternum || !eyeL || !eyeR || !ribs || !femur || !spine) return null

  const sample = (pattern: RegExp) => {
    const points: number[] = []
    for (const [key, vertices] of Object.entries(structures)) {
      if (!vertices || !pattern.test(key)) continue
      const stride = Math.max(1, Math.ceil(vertices.length / 3 / SAMPLES_PER_PART))
      for (let i = 0; i + 2 < vertices.length; i += stride * 3) points.push(vertices[i]!, vertices[i + 1]!, vertices[i + 2]!)
    }
    return new Float32Array(points)
  }
  const armParts = sample(ARM_PARTS)
  const trunkParts = sample(TRUNK_PARTS)
  if (!armParts.length || !trunkParts.length) return null
  let armReach = Infinity
  for (let i = 0; i < armParts.length; i += 3) armReach = Math.min(armReach, Math.abs(armParts[i]!))
  const spineZ = extent(spine, 2)

  const eyeY = { min: Math.min(extent(eyeL, 1).min, extent(eyeR, 1).min), max: Math.max(extent(eyeL, 1).max, extent(eyeR, 1).max) }
  const eyeX = Math.max(extent(eyeL, 0).max, -extent(eyeR, 0).min)
  // The eye structures include the nerve behind each eye, so the front of the eye is their front edge.
  const eyeFront = Math.max(extent(eyeL, 2).max, extent(eyeR, 2).max)
  return {
    armParts,
    trunkParts,
    armReach: armReach - 0.05,
    armFloor: extent(armParts, 1).min - 0.05,
    spineDepth: (spineZ.min + spineZ.max) / 2,
    headBase: extent(mandible, 1).min - 0.03,
    eyes: { yMin: eyeY.min - 0.004, yMax: eyeY.max + 0.004, halfWidth: eyeX + 0.02, zMin: eyeFront - 0.035 },
    chestBase: (extent(sternum, 1).min + extent(ribs, 1).min) / 2,
    legTop: extent(femur, 1).max - 0.012,
    leftSign: (extent(femur, 0).min + extent(femur, 0).max) / 2 >= 0 ? 1 : -1,
    parts: partMarks(structures),
  }
}

function nearest(points: Float32Array, x: number, y: number, z: number): number {
  let best = Infinity
  for (let i = 0; i < points.length; i += 3) {
    const dx = points[i]! - x
    const dy = points[i + 1]! - y
    const dz = points[i + 2]! - z
    const d = dx * dx + dy * dy + dz * dz
    if (d < best) best = d
  }
  return best
}

/** The middle of the vertices in the lowest or highest `share` of a structure's height. */
function endOf(points: Float32Array, end: 'low' | 'high', share = 0.1): Point {
  const { min, max } = extent(points, 1)
  const edge = end === 'low' ? min + (max - min) * share : max - (max - min) * share
  const sum: Point = [0, 0, 0]
  let n = 0
  for (let i = 0; i < points.length; i += 3) {
    if (end === 'low' ? points[i + 1]! > edge : points[i + 1]! < edge) continue
    sum[0] += points[i]!
    sum[1] += points[i + 1]!
    sum[2] += points[i + 2]!
    n++
  }
  return [sum[0] / n, sum[1] / n, sum[2] / n]
}

function depthLine(top: Point, bottom: Point): DepthLine {
  return { y0: top[1], z0: top[2], y1: bottom[1], z1: bottom[2] }
}

/** The depth of a line at a height, holding its end values beyond its ends. */
function depthAt(line: DepthLine, y: number): number {
  const t = Math.min(1, Math.max(0, (y - line.y0) / (line.y1 - line.y0 || 1)))
  return line.z0 + (line.z1 - line.z0) * t
}

function partMarks(structures: Record<string, Float32Array | undefined>): PartMarks {
  const { clavicle_l: clavicle, deltoid_l: deltoid, humerus_l: humerus, ribs_l: ribs, pelvis, femur_l: femur, lower_leg_l: lowerLeg, gluteal_l: gluteal, patella_l: patella, foot_l: foot } = structures
  const arms: PartMarks['arms'] = {}
  for (const s of ['l', 'r'] as const) {
    const upper = structures[`humerus_${s}`]
    const lower = structures[`forearm_${s}`]
    if (!upper || !lower) continue
    const elbow = endOf(upper, 'low', 0.04)
    const wrist = endOf(lower, 'low', 0.04)
    const d: Point = [wrist[0] - elbow[0], wrist[1] - elbow[1], wrist[2] - elbow[2]]
    const length = Math.hypot(...d) || 1
    arms[s] = { elbow, wrist, along: [d[0] / length, d[1] / length, d[2] / length] }
  }
  const mid = (points: Float32Array): Point => {
    const [x, y, z] = [extent(points, 0), extent(points, 1), extent(points, 2)]
    return [(x.min + x.max) / 2, (y.min + y.max) / 2, (z.min + z.max) / 2]
  }
  // The knee is the kneecap and a little above and below it, all the way round the leg.
  const kneecap = patella ? extent(patella, 1) : undefined
  const kneePad = kneecap ? (kneecap.max - kneecap.min) * 0.45 : 0
  const cap = deltoid ? extent(deltoid, 1) : undefined
  return {
    neckBase: clavicle ? extent(clavicle, 1).max : undefined,
    shoulder: cap && humerus ? { inner: Math.min(Math.abs(extent(humerus, 0).min), Math.abs(extent(humerus, 0).max)) - 0.01, yMin: cap.min + (cap.max - cap.min) * 0.35 } : undefined,
    arms,
    trunkMid: ribs && pelvis ? depthLine(mid(ribs), mid(pelvis)) : undefined,
    thighMid: femur ? depthLine(endOf(femur, 'high'), endOf(femur, 'low')) : undefined,
    lowerLegMid: lowerLeg ? depthLine(endOf(lowerLeg, 'high'), endOf(lowerLeg, 'low')) : undefined,
    // Some source glute meshes extend far down the thigh; stop the selectable glute at the upper quarter of the femur.
    glute: gluteal ? { yMin: Math.max(extent(gluteal, 1).min, femur ? extent(femur, 1).max - (extent(femur, 1).max - extent(femur, 1).min) * 0.25 : -Infinity), yMax: extent(gluteal, 1).max } : undefined,
    knee: kneecap ? { yMin: kneecap.min - kneePad, yMax: kneecap.max + kneePad } : undefined,
    footTop: foot ? extent(foot, 1).max : undefined,
  }
}

/**
 * Decides the part for a point on the skin of the anatomy models. Coordinates are in metres:
 * y is height (feet at 0), +z is the front of the body and x is side to side.
 *
 * A point is on an arm when a bone or muscle of the arm is nearer to it than any bone or muscle of
 * the trunk or thighs. That follows the arm all the way down, including a hand hanging beside the
 * thigh. The arm is cut across at the elbow and wrist. The trunk and legs are divided into front
 * and back at the bones in their middle, and by height: the neck above the collarbones, chest and
 * upper back above the lower ribs, the glutes where the gluteal muscles are, the knee around the
 * kneecap and the foot below the ankle. A strip down the middle of the back is the spine.
 */
export function zoneForSkinPoint(x: number, y: number, z: number, marks: SkinLandmarks): BodyZoneId {
  const side = Math.abs(x)
  const s = x * marks.leftSign >= 0 ? 'l' : 'r'
  if (y >= marks.headBase) {
    const { eyes } = marks
    return z > eyes.zMin && side < eyes.halfWidth && y >= eyes.yMin && y <= eyes.yMax ? 'eyes' : 'head'
  }
  const { parts } = marks
  const onShoulder = parts.shoulder !== undefined && side > parts.shoulder.inner && y > parts.shoulder.yMin
  if (side > marks.armReach && y > marks.armFloor && nearest(marks.armParts, x, y, z) < nearest(marks.trunkParts, x, y, z)) {
    const arm = parts.arms[s]
    if (!arm) return `upper_arm_front_${s}`
    const past = (from: Point) => (x - from[0]) * arm.along[0] + (y - from[1]) * arm.along[1] + (z - from[2]) * arm.along[2] > 0
    const t = Math.max(0, Math.min(1, (y - arm.elbow[1]) / (arm.wrist[1] - arm.elbow[1])))
    const front = z >= arm.elbow[2] + t * (arm.wrist[2] - arm.elbow[2])
    if (past(arm.wrist)) return `${front ? 'palm' : 'hand_back'}_${s}`
    if (past(arm.elbow)) return `forearm_${front ? 'front' : 'back'}_${s}`
    return `${onShoulder ? 'shoulder' : 'upper_arm'}_${front ? 'front' : 'back'}_${s}`
  }
  if (y < marks.legTop) {
    if (parts.footTop !== undefined && y < parts.footTop) return `foot_${s}`
    if (parts.knee && y >= parts.knee.yMin && y <= parts.knee.yMax) return `knee_${s}`
    if (parts.knee && y < parts.knee.yMin) return !parts.lowerLegMid || z >= depthAt(parts.lowerLegMid, y) ? `shin_${s}` : `calf_${s}`
    if (!parts.thighMid || z >= depthAt(parts.thighMid, y)) return `quad_${s}`
    return parts.glute && y >= parts.glute.yMin ? `glute_${s}` : `hamstring_${s}`
  }
  if (parts.neckBase !== undefined && y > parts.neckBase) return 'neck'
  if (z < marks.spineDepth && side < 0.04) return 'spine'
  if (onShoulder) return `shoulder_${z >= (parts.trunkMid ? depthAt(parts.trunkMid, y) : 0) ? 'front' : 'back'}_${s}`
  const upper = y >= marks.chestBase
  if (!parts.trunkMid || z >= depthAt(parts.trunkMid, y)) return `${upper ? (y >= (marks.chestBase + (parts.neckBase ?? marks.headBase)) / 2 ? 'chest_upper' : 'chest_lower') : 'abdomen'}_${s}`
  if (parts.glute && y <= parts.glute.yMax) return `glute_${s}`
  return `${upper ? 'upper_back' : 'lower_back'}_${s}`
}

/** The app region for a point on the skin of the anatomy models: the region of the part it is in. */
export function regionForSkinPoint(x: number, y: number, z: number, marks: SkinLandmarks): BodyRegionId {
  return regionForZone(zoneForSkinPoint(x, y, z, marks))
}
