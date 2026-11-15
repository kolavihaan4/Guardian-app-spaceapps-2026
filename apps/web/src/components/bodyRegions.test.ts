import { describe, expect, it } from 'vitest'
import { ANATOMY_STRUCTURES } from './anatomyStructures'
import { bodyPartForBone, regionForPoint, regionForSkinPoint, regionForStructure, skinLandmarks, zoneForSkinPoint, zoneLabel, regionForZone, BODY_ZONES } from './bodyRegions'

describe('bodyPartForBone', () => {
  it('names the part for each bone, with or without dots in the name', () => {
    expect(bodyPartForBone('spine.005')).toBe('head')
    expect(bodyPartForBone('spine005')).toBe('head')
    expect(bodyPartForBone('upper_arm.L')).toBe('arm')
    expect(bodyPartForBone('f_index01R')).toBe('arm')
    expect(bodyPartForBone('shoulderL')).toBe('arm')
    expect(bodyPartForBone('thigh.R')).toBe('leg')
    expect(bodyPartForBone('heel02L')).toBe('leg')
    expect(bodyPartForBone('spine')).toBe('torso')
    expect(bodyPartForBone('spine003')).toBe('torso')
    expect(bodyPartForBone('pelvisL')).toBe('torso')
  })
})

describe('regionForPoint', () => {
  it('treats each arm and leg as one region wherever the point is', () => {
    expect(regionForPoint('arm', 0, 0.45, -0.3)).toBe('upper_limbs')
    expect(regionForPoint('leg', 0.02, -0.2, 0.1)).toBe('lower_limbs')
  })

  it('puts the eyes in a band across the front of the head only', () => {
    expect(regionForPoint('head', 0.08, 0.81, 0.03)).toBe('eyes_sans')
    expect(regionForPoint('head', -0.08, 0.81, 0.03)).toBe('head_neuro') // back of the head
    expect(regionForPoint('head', 0.08, 0.93, 0)).toBe('head_neuro') // forehead
    expect(regionForPoint('head', 0.08, 0.74, 0)).toBe('head_neuro') // jaw
  })

  it('splits the torso into chest, abdomen and a spine strip down the back', () => {
    expect(regionForPoint('torso', 0.1, 0.55, 0.05)).toBe('chest_cardio')
    expect(regionForPoint('torso', 0.12, 0.15, 0.05)).toBe('abdomen_nutrition')
    expect(regionForPoint('torso', 0.1, 0, -0.08)).toBe('abdomen_nutrition')
    expect(regionForPoint('torso', -0.08, 0.4, 0.02)).toBe('spine_bone')
    expect(regionForPoint('torso', -0.09, 0, 0)).toBe('spine_bone')
    expect(regionForPoint('torso', -0.08, 0.4, 0.15)).toBe('chest_cardio') // back, but off the midline
    expect(regionForPoint('torso', -0.08, 0.64, 0)).toBe('chest_cardio') // above the strip, at the base of the neck
    expect(regionForPoint('torso', -0.08, -0.06, 0)).toBe('abdomen_nutrition') // below the strip
  })
})

describe('regionForStructure', () => {
  it('maps anatomy structures to the app regions', () => {
    expect(regionForStructure('eye_l')).toBe('eyes_sans')
    expect(regionForStructure('brain')).toBe('head_neuro')
    expect(regionForStructure('carotid_r')).toBe('head_neuro')
    expect(regionForStructure('heart')).toBe('chest_cardio')
    expect(regionForStructure('veins_thorax')).toBe('chest_cardio')
    expect(regionForStructure('breast_l')).toBe('chest_cardio')
    expect(regionForStructure('kidney_l')).toBe('abdomen_nutrition')
    expect(regionForStructure('uterus')).toBe('abdomen_nutrition')
    expect(regionForStructure('arteries_pelvis')).toBe('abdomen_nutrition')
    expect(regionForStructure('spine_lumbar')).toBe('spine_bone')
    expect(regionForStructure('pelvis')).toBe('spine_bone')
    expect(regionForStructure('forearm_muscles_l')).toBe('upper_limbs')
    expect(regionForStructure('veins_arm_r')).toBe('upper_limbs')
    expect(regionForStructure('shoulder_l')).toBe('upper_limbs')
    expect(regionForStructure('femur_r')).toBe('lower_limbs')
    expect(regionForStructure('arteries_leg_l')).toBe('lower_limbs')
    expect(regionForStructure('knee_l')).toBe('lower_limbs')
  })

  it('gives every structure in the catalogue a region, with each region used', () => {
    const used = new Set(Object.keys(ANATOMY_STRUCTURES).map(regionForStructure))
    expect([...used].sort()).toEqual(['abdomen_nutrition', 'chest_cardio', 'eyes_sans', 'head_neuro', 'lower_limbs', 'spine_bone', 'upper_limbs'])
  })
})

/**
 * A stand-in for a model's structures: a few points per structure, placed where the male model has
 * them and then scaled, so a shorter figure can be tested with the same shape.
 */
function figure(scale: number): Record<string, Float32Array> {
  const at = (...points: number[]) => new Float32Array(points.map((n) => n * scale))
  const line = (x: number, top: number, bottom: number, z: number) => {
    const points: number[] = []
    for (let i = 0; i <= 10; i++) points.push(x, top + ((bottom - top) * i) / 10, z)
    return at(...points)
  }
  return {
    mandible: at(0, 1.5, 0.03, 0, 1.58, 0.07),
    eye_l: at(0.01, 1.566, 0.02, 0.049, 1.615, 0.066),
    eye_r: at(-0.049, 1.566, 0.02, -0.01, 1.615, 0.066),
    sternum: line(0, 1.4, 1.242, 0.1),
    ribs_l: line(0.13, 1.45, 1.086, 0),
    ribs_r: line(-0.13, 1.45, 1.086, 0),
    spine_thoracic: at(0, 1.45, -0.1, 0, 1.13, 0),
    pelvis: at(0.14, 0.95, 0, -0.14, 0.95, 0),
    femur_l: line(0.1, 0.912, 0.45, 0),
    femur_r: line(-0.1, 0.912, 0.45, 0),
    humerus_l: line(0.2, 1.41, 1.11, -0.02),
    humerus_r: line(-0.2, 1.41, 1.11, -0.02),
    forearm_l: line(0.25, 1.13, 0.88, 0),
    forearm_r: line(-0.25, 1.13, 0.88, 0),
    hand_l: line(0.28, 0.89, 0.73, 0.05),
    hand_r: line(-0.28, 0.89, 0.73, 0.05),
  }
}

describe('regionForSkinPoint', () => {
  const marks = skinLandmarks(figure(1))!

  it('divides the skin of the anatomy model by position', () => {
    expect(regionForSkinPoint(0.03, 1.59, 0.08, marks)).toBe('eyes_sans')
    expect(regionForSkinPoint(0, 1.7, 0, marks)).toBe('head_neuro')
    expect(regionForSkinPoint(0.03, 1.59, -0.08, marks)).toBe('head_neuro') // back of the head
    expect(regionForSkinPoint(0.1, 1.59, 0.05, marks)).toBe('head_neuro') // temple, beside the eyes
    expect(regionForSkinPoint(0.05, 1.3, 0.1, marks)).toBe('chest_cardio')
    expect(regionForSkinPoint(0.05, 1.05, 0.1, marks)).toBe('abdomen_nutrition')
    expect(regionForSkinPoint(0, 1.2, -0.1, marks)).toBe('spine_bone')
    expect(regionForSkinPoint(0.02, 1.4, -0.01, marks)).toBe('spine_bone') // behind the trunk's centre belongs to the back
    expect(regionForSkinPoint(0.09, 0.5, 0, marks)).toBe('lower_limbs')
  })

  it('follows the arm down to the hand beside the thigh', () => {
    expect(regionForSkinPoint(0.25, 1.3, 0, marks)).toBe('upper_limbs')
    expect(regionForSkinPoint(-0.27, 1.0, 0, marks)).toBe('upper_limbs')
    expect(regionForSkinPoint(0.29, 0.8, 0.05, marks)).toBe('upper_limbs') // hand, below the top of the legs
    expect(regionForSkinPoint(0.16, 0.8, 0, marks)).toBe('lower_limbs') // outside of the thigh, next to the hand
    expect(regionForSkinPoint(0.15, 1.3, 0.02, marks)).toBe('chest_cardio') // side of the chest, next to the arm
  })

  it('moves every boundary with the size of the figure', () => {
    const small = skinLandmarks(figure(0.9))!
    // The same places on a figure nine-tenths the size.
    expect(regionForSkinPoint(0.03 * 0.9, 1.59 * 0.9, 0.08 * 0.9, small)).toBe('eyes_sans')
    expect(regionForSkinPoint(0.03, 1.59, 0.08, small)).toBe('head_neuro') // where the larger figure's eyes are
    expect(regionForSkinPoint(0.05, 1.3 * 0.9, 0.09, small)).toBe('chest_cardio')
    expect(regionForSkinPoint(0.05, 1.05 * 0.9, 0.09, small)).toBe('abdomen_nutrition')
    expect(regionForSkinPoint(0.25 * 0.9, 1.3 * 0.9, 0, small)).toBe('upper_limbs')
    expect(regionForSkinPoint(0.09, 0.5 * 0.9, 0, small)).toBe('lower_limbs')
  })

  it('reports when the model lacks a structure it measures from', () => {
    const { mandible: _, ...rest } = figure(1)
    expect(skinLandmarks(rest)).toBeNull()
  })
})

// Asymmetric points verify anatomical left/right and independent front/back selection.
describe('detailed body zones', () => {
  const m = skinLandmarks(figure(1))!
  m.parts.neckBase = 1.44
  m.parts.knee = { yMin: 0.42, yMax: 0.50 }
  m.parts.footTop = 0.08
  m.parts.thighMid = { y0: 0.9, y1: 0.45, z0: 0, z1: 0 }
  m.parts.lowerLegMid = { y0: 0.42, y1: 0.08, z0: 0, z1: 0 }
  m.parts.glute = { yMin: 0.78, yMax: 1.0 }
  it('separates all four chest quadrants from the back', () => {
    expect(zoneForSkinPoint(0.06, 1.36, 0.1, m)).toBe('chest_upper_l')
    expect(zoneForSkinPoint(-0.06, 1.36, 0.1, m)).toBe('chest_upper_r')
    expect(zoneForSkinPoint(0.06, 1.20, 0.1, m)).toBe('chest_lower_l')
    expect(zoneForSkinPoint(-0.06, 1.20, 0.1, m)).toBe('chest_lower_r')
    expect(zoneForSkinPoint(0.06, 1.20, -0.1, m)).toBe('upper_back_l')
  })
  it('separates quads, hamstrings, glutes, knees, shins, calves and feet', () => {
    for (const [y, z, part] of [[0.65, 0.08, 'quad'], [0.65, -0.08, 'hamstring'], [0.85, -0.08, 'glute'], [0.46, 0.08, 'knee'], [0.3, 0.08, 'shin'], [0.3, -0.08, 'calf'], [0.04, 0.08, 'foot']] as const) {
      expect(zoneForSkinPoint(0.09, y, z, m)).toBe(part + '_l')
      expect(zoneForSkinPoint(-0.09, y, z, m)).toBe(part + '_r')
    }
  })
  it('separates the forearm faces and palms from the back of the hand', () => {
    expect(zoneForSkinPoint(0.25, 1.0, 0.06, m)).toBe('forearm_front_l')
    expect(zoneForSkinPoint(0.25, 1.0, -0.06, m)).toBe('forearm_back_l')
    expect(zoneForSkinPoint(0.29, 0.8, 0.06, m)).toBe('palm_l')
    expect(zoneForSkinPoint(0.29, 0.8, -0.06, m)).toBe('hand_back_l')
  })
  it('gives every selectable zone a unique name and a supported body system', () => {
    expect(new Set(BODY_ZONES.map(zoneLabel)).size).toBe(BODY_ZONES.length)
    for (const z of BODY_ZONES) expect(regionForZone(z)).toBeTruthy()
  })
})
