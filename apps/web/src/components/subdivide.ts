/**
 * Geometry helpers for the 3D body: the source model is low-poly (about 1,200 vertices), so it is
 * welded and then Loop-subdivided to get a smooth surface. Each vertex carries a label (its body
 * region) that survives both steps.
 */
export interface LabelledMesh<L> {
  /** x, y, z per vertex. */
  positions: Float32Array
  /** Three vertex indices per triangle. */
  index: Uint32Array
  /** One label per vertex. */
  labels: L[]
}

/**
 * Merges vertices that share a position. Model files duplicate vertices along texture seams; left
 * alone, those duplicates drift apart when the surface is smoothed and open cracks in it.
 */
export function weld<L>(mesh: LabelledMesh<L>): LabelledMesh<L> {
  const seen = new Map<string, number>()
  const remap = new Uint32Array(mesh.positions.length / 3)
  const positions: number[] = []
  const labels: L[] = []
  for (let i = 0; i < remap.length; i++) {
    const x = mesh.positions[i * 3]!
    const y = mesh.positions[i * 3 + 1]!
    const z = mesh.positions[i * 3 + 2]!
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`
    let merged = seen.get(key)
    if (merged === undefined) {
      merged = labels.length
      seen.set(key, merged)
      positions.push(x, y, z)
      labels.push(mesh.labels[i]!)
    }
    remap[i] = merged
  }
  const index: number[] = []
  for (let t = 0; t < mesh.index.length; t += 3) {
    const a = remap[mesh.index[t]!]!
    const b = remap[mesh.index[t + 1]!]!
    const c = remap[mesh.index[t + 2]!]!
    if (a !== b && b !== c && c !== a) index.push(a, b, c) // drop triangles the weld collapsed
  }
  return { positions: new Float32Array(positions), index: new Uint32Array(index), labels }
}

/**
 * One pass of Loop subdivision: every triangle becomes four and the surface is smoothed with the
 * standard Loop weights. Edges with only one triangle (an open border) use the border rules, and
 * edges shared by more than two triangles are simply split at the midpoint. A new vertex on an
 * edge takes the label of that edge's lower-numbered end.
 */
export function loopSubdivide<L>(mesh: LabelledMesh<L>): LabelledMesh<L> {
  const { positions: src, index } = mesh
  const vertexCount = src.length / 3
  interface Edge {
    a: number
    b: number
    opposite: number[]
    vertex: number
  }
  const edges = new Map<number, Edge>()
  const edgeOf = (p: number, q: number, opposite: number): Edge => {
    const a = Math.min(p, q)
    const b = Math.max(p, q)
    const key = a * vertexCount + b
    let edge = edges.get(key)
    if (!edge) {
      edge = { a, b, opposite: [], vertex: vertexCount + edges.size }
      edges.set(key, edge)
    }
    edge.opposite.push(opposite)
    return edge
  }
  const triangleEdges: [Edge, Edge, Edge][] = []
  for (let t = 0; t < index.length; t += 3) {
    const i0 = index[t]!
    const i1 = index[t + 1]!
    const i2 = index[t + 2]!
    triangleEdges.push([edgeOf(i0, i1, i2), edgeOf(i1, i2, i0), edgeOf(i2, i0, i1)])
  }

  const neighbours: number[][] = Array.from({ length: vertexCount }, () => [])
  const borderNeighbours: number[][] = Array.from({ length: vertexCount }, () => [])
  for (const edge of edges.values()) {
    neighbours[edge.a]!.push(edge.b)
    neighbours[edge.b]!.push(edge.a)
    if (edge.opposite.length === 1) {
      borderNeighbours[edge.a]!.push(edge.b)
      borderNeighbours[edge.b]!.push(edge.a)
    }
  }

  const positions = new Float32Array((vertexCount + edges.size) * 3)
  const labels: L[] = mesh.labels.slice()
  for (let v = 0; v < vertexCount; v++) {
    const border = borderNeighbours[v]!
    const around = border.length === 2 ? border : neighbours[v]!
    const n = around.length
    // Border vertices: 3/4 self + 1/8 each border neighbour. Interior: Loop's beta weights.
    const beta = border.length === 2 ? 1 / 8 : n === 0 ? 0 : n === 3 ? 3 / 16 : 3 / (8 * n)
    for (let k = 0; k < 3; k++) {
      let sum = 0
      for (const u of around) sum += src[u * 3 + k]!
      positions[v * 3 + k] = (1 - n * beta) * src[v * 3 + k]! + beta * sum
    }
  }
  for (const edge of edges.values()) {
    const smooth = edge.opposite.length === 2
    for (let k = 0; k < 3; k++) {
      const ends = src[edge.a * 3 + k]! + src[edge.b * 3 + k]!
      positions[edge.vertex * 3 + k] = smooth ? (3 / 8) * ends + (1 / 8) * (src[edge.opposite[0]! * 3 + k]! + src[edge.opposite[1]! * 3 + k]!) : ends / 2
    }
    labels[edge.vertex] = mesh.labels[edge.a]!
  }

  const next = new Uint32Array(index.length * 4)
  triangleEdges.forEach(([e01, e12, e20], i) => {
    const t = i * 3
    next.set([index[t]!, e01.vertex, e20.vertex, index[t + 1]!, e12.vertex, e01.vertex, index[t + 2]!, e20.vertex, e12.vertex, e01.vertex, e12.vertex, e20.vertex], i * 12)
  })
  return { positions, index: next, labels }
}
