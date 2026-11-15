import { describe, expect, it } from 'vitest'
import { loopSubdivide, weld } from './subdivide'

// A tetrahedron: 4 vertices, 4 triangles, 6 edges, closed.
const tetra = () => ({
  positions: new Float32Array([1, 1, 1, 1, -1, -1, -1, 1, -1, -1, -1, 1]),
  index: new Uint32Array([0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2]),
  labels: ['a', 'b', 'c', 'd'],
})

describe('weld', () => {
  it('merges vertices at the same position and keeps the first label', () => {
    const m = weld({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, /* duplicate of vertex 0 */ 0, 0, 0, 1, 1, 0]),
      index: new Uint32Array([0, 1, 2, 3, 4, 1]),
      labels: ['p', 'q', 'r', 'seam', 's'],
    })
    expect(m.positions.length / 3).toBe(4)
    expect(m.labels).toEqual(['p', 'q', 'r', 's'])
    expect(Array.from(m.index)).toEqual([0, 1, 2, 0, 3, 1])
  })
})

describe('loopSubdivide', () => {
  it('turns every triangle into four and adds one vertex per edge', () => {
    const m = loopSubdivide(tetra())
    expect(m.positions.length / 3).toBe(4 + 6)
    expect(m.index.length / 3).toBe(16)
    expect(m.labels).toHaveLength(10)
    expect(Math.max(...m.index)).toBe(9)
  })

  it('keeps a closed surface closed: every edge is still shared by exactly two triangles', () => {
    const m = loopSubdivide(loopSubdivide(tetra()))
    const uses = new Map<string, number>()
    for (let t = 0; t < m.index.length; t += 3) {
      const tri = [m.index[t]!, m.index[t + 1]!, m.index[t + 2]!]
      for (let k = 0; k < 3; k++) {
        const key = [tri[k]!, tri[(k + 1) % 3]!].sort((x, y) => x - y).join('-')
        uses.set(key, (uses.get(key) ?? 0) + 1)
      }
    }
    expect([...uses.values()].every((n) => n === 2)).toBe(true)
  })

  it('smooths: the shape pulls inward and stays centred', () => {
    const m = loopSubdivide(tetra())
    const radius = (i: number) => Math.hypot(m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!)
    for (let i = 0; i < 10; i++) expect(radius(i)).toBeLessThan(Math.sqrt(3))
    const centre = [0, 1, 2].map((k) => Array.from({ length: 10 }, (_, i) => m.positions[i * 3 + k]!).reduce((a, b) => a + b, 0) / 10)
    centre.forEach((c) => expect(Math.abs(c)).toBeLessThan(1e-6))
  })

  it('gives a new edge vertex the label of the lower-numbered end', () => {
    const m = loopSubdivide(tetra())
    expect(m.labels.slice(0, 4)).toEqual(['a', 'b', 'c', 'd'])
    expect(m.labels.slice(4).every((l) => ['a', 'b', 'c'].includes(l))).toBe(true)
  })
})
