/**
 * Makes the anatomy models' skin modest, like a shop mannequin: the skin meshes are modelled with
 * external genitals and nipples, and this smooths those away when the model loads. The model files
 * themselves stay unmodified (see public/models/README.md).
 *
 * It works by relaxing the vertices inside a few small zones: each one is moved to the average of
 * its neighbours, over and over, while everything outside the zone stays put. A part that sticks out
 * is pulled flat into a smooth patch that spans the zone's edge, with no holes or seams.
 */
import type { AnatomySex } from './Anatomy3D'

/**
 * Structures that are not drawn at all: the breasts and the reproductive organs, inside and out.
 * The app has no body region for them, so they could not be selected. Each key is a mesh name in
 * the model files.
 */
export const HIDDEN_STRUCTURES: ReadonlySet<string> = new Set(['reproductive', 'prostate', 'vagina', 'uterus', 'ovary_l', 'ovary_r', 'fallopian_tubes', 'breast_l', 'breast_r'])

type Zone = (x: number, y: number, z: number) => boolean

/** Zones in the models' own metres: x to the figure's left, y up from the floor, z to the front. */
const box = (halfWidth: number, yMin: number, yMax: number, zMin: number): Zone => (x, y, z) => Math.abs(x) < halfWidth && y > yMin && y < yMax && z > zMin
const ball = (cx: number, cy: number, cz: number, radius: number): Zone => (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) < radius

const GROIN: Record<AnatomySex, Zone> = {
  male: box(0.046, 0.755, 0.9, 0.03),
  female: box(0.034, 0.75, 0.84, 0),
}
/** Where to look for each nipple on the female skin: the point furthest forward on each side of the chest. */
const CHEST = { yMin: 1.13, yMax: 1.26, xMin: 0.05, xMax: 0.17, radius: 0.016 }

const PASSES = 400

/**
 * Smooths the skin in place. `positions` holds x, y, z per vertex in the model's world space and
 * `index` the triangle corners (or null when every three vertices form a triangle).
 * Returns how many vertices moved.
 */
export function smoothModestSkin(positions: Float32Array, index: ArrayLike<number> | null, sex: AnatomySex): number {
  const count = positions.length / 3
  const zones: Zone[] = [GROIN[sex]]
  if (sex === 'female') {
    for (const side of [-1, 1]) {
      let tip = -1
      for (let i = 0; i < count; i++) {
        const x = positions[i * 3]! * side
        const y = positions[i * 3 + 1]!
        if (x < CHEST.xMin || x > CHEST.xMax || y < CHEST.yMin || y > CHEST.yMax) continue
        if (tip < 0 || positions[i * 3 + 2]! > positions[tip * 3 + 2]!) tip = i
      }
      if (tip >= 0) zones.push(ball(positions[tip * 3]!, positions[tip * 3 + 1]!, positions[tip * 3 + 2]!, CHEST.radius))
    }
  }

  // Vertices that share a position (split for shading) are treated as one point, so they stay together.
  const pointOf = new Int32Array(count)
  const byPlace = new Map<string, number>()
  const members: number[][] = []
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(positions[i * 3]! * 1e5)},${Math.round(positions[i * 3 + 1]! * 1e5)},${Math.round(positions[i * 3 + 2]! * 1e5)}`
    let point = byPlace.get(key)
    if (point === undefined) {
      point = members.length
      byPlace.set(key, point)
      members.push([])
    }
    pointOf[i] = point
    members[point]!.push(i)
  }

  const loose = new Uint8Array(members.length)
  let any = false
  members.forEach((vertices, point) => {
    const i = vertices[0]! * 3
    if (zones.some((zone) => zone(positions[i]!, positions[i + 1]!, positions[i + 2]!))) {
      loose[point] = 1
      any = true
    }
  })
  if (!any) return 0

  const neighbours = new Map<number, Set<number>>()
  const corners = index ? index.length : count
  const link = (a: number, b: number) => {
    if (a === b || !loose[a]) return
    let set = neighbours.get(a)
    if (!set) neighbours.set(a, (set = new Set()))
    set.add(b)
  }
  for (let t = 0; t + 2 < corners; t += 3) {
    const a = pointOf[index ? index[t]! : t]!
    const b = pointOf[index ? index[t + 1]! : t + 1]!
    const c = pointOf[index ? index[t + 2]! : t + 2]!
    link(a, b)
    link(a, c)
    link(b, a)
    link(b, c)
    link(c, a)
    link(c, b)
  }

  // Work on one position per point, then copy the result back to every vertex of that point.
  const place = new Float64Array(members.length * 3)
  members.forEach((vertices, point) => {
    const i = vertices[0]! * 3
    place.set([positions[i]!, positions[i + 1]!, positions[i + 2]!], point * 3)
  })
  const lists = [...neighbours].map(([point, set]) => [point, [...set]] as const)
  for (let pass = 0; pass < PASSES; pass++) {
    for (const [point, around] of lists) {
      let x = 0
      let y = 0
      let z = 0
      for (const other of around) {
        x += place[other * 3]!
        y += place[other * 3 + 1]!
        z += place[other * 3 + 2]!
      }
      place[point * 3] = x / around.length
      place[point * 3 + 1] = y / around.length
      place[point * 3 + 2] = z / around.length
    }
  }

  let moved = 0
  for (const [point] of lists) {
    for (const vertex of members[point]!) {
      positions[vertex * 3] = place[point * 3]!
      positions[vertex * 3 + 1] = place[point * 3 + 1]!
      positions[vertex * 3 + 2] = place[point * 3 + 2]!
      moved++
    }
  }
  return moved
}
