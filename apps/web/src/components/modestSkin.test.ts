import { describe, expect, it } from 'vitest'
import { HIDDEN_STRUCTURES, smoothModestSkin } from './modestSkin'

/** A flat sheet of skin facing forward at z = 0.06, with one vertex pulled out towards the viewer. */
function sheet(centreY: number, spike: number) {
  const size = 21
  const step = 0.01
  const positions = new Float32Array(size * size * 3)
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      positions.set([(col - 10) * step, centreY + (row - 10) * step, 0.06], (row * size + col) * 3)
    }
  }
  const middle = 10 * size + 10
  positions[middle * 3 + 2] = 0.06 + spike
  const index: number[] = []
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const a = row * size + col
      index.push(a, a + 1, a + size, a + 1, a + size + 1, a + size)
    }
  }
  return { positions, index, middle }
}

describe('smoothModestSkin', () => {
  it('flattens a part that sticks out at the groin', () => {
    const { positions, index, middle } = sheet(0.82, 0.05)
    expect(smoothModestSkin(positions, index, 'male')).toBeGreaterThan(0)
    expect(positions[middle * 3 + 2]).toBeCloseTo(0.06, 4)
  })

  it('leaves the skin outside its zones untouched', () => {
    const { positions, index } = sheet(0.4, 0.05)
    const before = positions.slice()
    expect(smoothModestSkin(positions, index, 'male')).toBe(0)
    expect(positions).toEqual(before)
  })

  it('flattens the tip of each side of the female chest', () => {
    const { positions, index, middle } = sheet(1.19, 0.008)
    // Move the sheet onto one side of the chest.
    for (let i = 0; i < positions.length; i += 3) positions[i] = positions[i]! + 0.1
    smoothModestSkin(positions, index, 'female')
    expect(positions[middle * 3 + 2]).toBeCloseTo(0.06, 4)
  })

  it('hides the breasts and the reproductive organs', () => {
    for (const name of ['reproductive', 'prostate', 'vagina', 'uterus', 'ovary_l', 'ovary_r', 'fallopian_tubes', 'breast_l', 'breast_r']) expect(HIDDEN_STRUCTURES.has(name)).toBe(true)
    expect(HIDDEN_STRUCTURES.has('heart')).toBe(false)
  })
})
