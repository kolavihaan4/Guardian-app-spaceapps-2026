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
 * Decides the region for a point on the skin of the anatomy models. Coordinates are in metres:
 * y is height (feet at 0, top of the head near 1.7), +z is the front of the body and x is side
 * to side. The arms hang slightly away from the trunk, so anything wider than the trunk is arm.
 */
export function regionForSkinPoint(x: number, y: number, z: number): BodyRegionId {
  const side = Math.abs(x)
  if (y >= 1.47) return z > 0.03 && y >= 1.565 && y <= 1.615 ? 'eyes_sans' : 'head_neuro'
  // The trunk narrows from the shoulders (about 0.2 m from the midline) to the waist.
  if (side > (y >= 1.3 ? 0.2 : 0.17) && y > 0.7) return 'upper_limbs'
  if (y < 0.9) return 'lower_limbs'
  if (z < 0 && side < 0.04) return 'spine_bone'
  return y >= 1.17 ? 'chest_cardio' : 'abdomen_nutrition'
}
