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
}

// The chest, back and shoulder muscles are left out: they run from the trunk onto the arm, so they
// would blur the line between the two.
const ARM_PARTS = /^(humerus|forearm|hand|upper_arm_muscles|forearm_muscles|hand_muscles)_[lr]$/
const TRUNK_PARTS = /^((ribs|femur|gluteal|quadriceps|hamstrings|adductors)_[lr]|sternum|spine_thoracic|spine_lumbar|pelvis|abdominal_muscles)$/
const SAMPLES_PER_PART = 160

/** Whether `skinLandmarks` reads this structure, so the caller can skip the rest. */
export function isSkinLandmarkPart(key: string): boolean {
  return ARM_PARTS.test(key) || TRUNK_PARTS.test(key) || /^(mandible|eye_[lr])$/.test(key)
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

/**
 * Decides the region for a point on the skin of the anatomy models. Coordinates are in metres:
 * y is height (feet at 0), +z is the front of the body and x is side to side.
 *
 * A point is on an arm when a bone or muscle of the arm is nearer to it than any bone or muscle of
 * the trunk or thighs. That follows the arm all the way down, including a hand hanging beside the
 * thigh. The rest is divided by height, with a strip down the middle of the back for the spine.
 */
export function regionForSkinPoint(x: number, y: number, z: number, marks: SkinLandmarks): BodyRegionId {
  const side = Math.abs(x)
  if (y >= marks.headBase) {
    const { eyes } = marks
    return z > eyes.zMin && side < eyes.halfWidth && y >= eyes.yMin && y <= eyes.yMax ? 'eyes_sans' : 'head_neuro'
  }
  if (side > marks.armReach && y > marks.armFloor && nearest(marks.armParts, x, y, z) < nearest(marks.trunkParts, x, y, z)) return 'upper_limbs'
  if (y < marks.legTop) return 'lower_limbs'
  if (z < marks.spineDepth && side < 0.04) return 'spine_bone'
  return y >= marks.chestBase ? 'chest_cardio' : 'abdomen_nutrition'
}
