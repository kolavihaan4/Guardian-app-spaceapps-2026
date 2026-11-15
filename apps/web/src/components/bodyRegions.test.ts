import { describe, expect, it } from 'vitest'
import { ANATOMY_STRUCTURES } from './anatomyStructures'
import { bodyPartForBone, regionForPoint, regionForSkinPoint, regionForStructure } from './bodyRegions'

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

describe('regionForSkinPoint', () => {
  it('divides the skin of the anatomy model by position', () => {
    expect(regionForSkinPoint(0.03, 1.59, 0.08)).toBe('eyes_sans')
    expect(regionForSkinPoint(0, 1.7, 0)).toBe('head_neuro')
    expect(regionForSkinPoint(0.03, 1.59, -0.08)).toBe('head_neuro')
    expect(regionForSkinPoint(0.05, 1.3, 0.1)).toBe('chest_cardio')
    expect(regionForSkinPoint(0.05, 1.05, 0.1)).toBe('abdomen_nutrition')
    expect(regionForSkinPoint(0, 1.2, -0.1)).toBe('spine_bone')
    expect(regionForSkinPoint(0.25, 1.0, 0)).toBe('upper_limbs')
    expect(regionForSkinPoint(-0.27, 0.8, 0.05)).toBe('upper_limbs')
    expect(regionForSkinPoint(0.09, 0.5, 0)).toBe('lower_limbs')
  })
})
