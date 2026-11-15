import { BODY_REGIONS, type BodyRegionId } from '@astrovitals/shared'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { bodyPartForBone, regionForPoint } from './bodyRegions'
import { loopSubdivide, weld } from './subdivide'

const MODEL_URL = '/models/male_base_mesh.glb'

// Colours follow the Still palette in styles.css: a pale neutral body, sage for the selected
// region, a lighter sage on hover, and coral for logged pain, deeper as the severity rises.
const COLOR = {
  body: new THREE.Color('#e6eeec'),
  hover: new THREE.Color('#b4cdc8'),
  selected: new THREE.Color('#3a655e'),
  painMild: new THREE.Color('#f1c4ae'),
  painSevere: new THREE.Color('#c9532c'),
}

/** Where the camera sits for each named view, as an angle around the figure (0 = facing it). */
const VIEWS = [
  { label: 'Front', azimuth: 0 },
  { label: 'Left side', azimuth: Math.PI / 2 },
  { label: 'Back', azimuth: Math.PI },
  { label: 'Right side', azimuth: -Math.PI / 2 },
] as const

interface Props {
  selected: BodyRegionId
  /** Logged pain per region, 1–10. Regions without pain are absent. */
  pain: Partial<Record<BodyRegionId, number>>
  onSelect: (region: BodyRegionId) => void
  /** Called when WebGL or the model cannot load, so the page can fall back to the 2D diagram. */
  onUnavailable: () => void
}

/**
 * A rotatable 3D body. Drag to turn it, or use the view buttons; click a region to select it.
 * Clicking the figure needs a pointer, so the region buttons under it give keyboard and
 * screen-reader users the same choices.
 */
export default function Body3D({ selected, pain, onSelect, onUnavailable }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<BodyRegionId | null>(null)
  const [ready, setReady] = useState(false)
  // The render loop and pointer handlers live in one long-lived effect; they read the latest
  // props through this ref instead of being torn down on every selection.
  const live = useRef({ selected, pain, hovered, onSelect, onUnavailable, repaint: () => {}, turnTo: (_azimuth: number) => {} })
  live.current.selected = selected
  live.current.pain = pain
  live.current.hovered = hovered
  live.current.onSelect = onSelect
  live.current.onUnavailable = onUnavailable

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      live.current.onUnavailable()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    const DISTANCE = 4.2
    camera.position.set(0, 0, DISTANCE)
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9c9d6', 1.45))
    // The key light rides with the camera, so the side facing the viewer is always lit; a cool
    // light from behind picks out the silhouette.
    const key = new THREE.DirectionalLight('#ffffff', 1.55)
    key.position.set(1.2, 1.6, 2)
    camera.add(key)
    const rim = new THREE.DirectionalLight('#d5e6f0', 1.1)
    rim.position.set(-1.5, 1, -2.5)
    camera.add(rim)
    scene.add(camera)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableZoom = false
    controls.enableDamping = true
    controls.target.set(0, 0, 0)
    // Turn the figure left and right only; tilting it adds nothing and loses the regions.
    controls.minPolarAngle = Math.PI / 2 - 0.2
    controls.maxPolarAngle = Math.PI / 2 + 0.2

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let turnTarget: number | null = null
    const setAzimuth = (azimuth: number) => {
      const polar = controls.getPolarAngle()
      camera.position.setFromSphericalCoords(DISTANCE, polar, azimuth)
      camera.lookAt(controls.target)
    }
    live.current.turnTo = (azimuth) => {
      if (reduceMotion) setAzimuth(azimuth)
      else turnTarget = azimuth
    }

    let body: THREE.Mesh | null = null
    let regions: BodyRegionId[] = []
    let disposed = false
    let frame = 0
    const loop = () => {
      frame = requestAnimationFrame(loop)
      if (turnTarget !== null) {
        const now = controls.getAzimuthalAngle()
        // Shortest way round.
        const diff = Math.atan2(Math.sin(turnTarget - now), Math.cos(turnTarget - now))
        if (Math.abs(diff) < 0.01) {
          setAzimuth(turnTarget)
          turnTarget = null
        } else {
          setAzimuth(now + diff * 0.16)
        }
      }
      controls.update()
      renderer.render(scene, camera)
    }

    const tint = new THREE.Color()
    const repaint = () => {
      if (!body) return
      const { selected: sel, pain: hurt, hovered: hov } = live.current
      const colors = body.geometry.getAttribute('color') as THREE.BufferAttribute
      const byRegion = new Map<BodyRegionId, THREE.Color>()
      const colorFor = (region: BodyRegionId) => {
        let c = byRegion.get(region)
        if (!c) {
          const severity = hurt[region] ?? 0
          c = new THREE.Color()
          if (severity > 0) c.lerpColors(COLOR.painMild, COLOR.painSevere, Math.min(severity, 10) / 10)
          else c.copy(region === sel ? COLOR.selected : region === hov ? COLOR.hover : COLOR.body)
          // A selected region that also has pain keeps its coral, darkened so the selection still shows.
          if (severity > 0 && region === sel) c.lerp(tint.set('#5b2a1a'), 0.35)
          else if (severity > 0 && region === hov) c.lerp(tint.set('#ffffff'), 0.2)
          byRegion.set(region, c)
        }
        return c
      }
      regions.forEach((region, i) => {
        const c = colorFor(region)
        colors.setXYZ(i, c.r, c.g, c.b)
      })
      colors.needsUpdate = true
    }
    live.current.repaint = repaint

    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return
        let skinned: THREE.SkinnedMesh | null = null
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.SkinnedMesh) skinned = o
        })
        const source = skinned as THREE.SkinnedMesh | null
        const sourceIndex = source?.geometry.getIndex()
        if (!source || !sourceIndex) {
          live.current.onUnavailable()
          return
        }
        // The skeleton is only needed to name each vertex's body part; the figure is shown in its rest pose.
        const position = source.geometry.getAttribute('position')
        const skinIndex = source.geometry.getAttribute('skinIndex')
        const skinWeight = source.geometry.getAttribute('skinWeight')
        const labels = Array.from({ length: position.count }, (_, i) => {
          let best = 0
          for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best)) best = k
          return bodyPartForBone(source.skeleton.bones[skinIndex.getComponent(i, best)]?.name ?? '')
        })
        // Weld the seams, then smooth the low-poly model with two rounds of Loop subdivision.
        let mesh = weld({ positions: Float32Array.from(position.array as ArrayLike<number>), index: Uint32Array.from(sourceIndex.array as ArrayLike<number>), labels })
        mesh = loopSubdivide(loopSubdivide(mesh))
        // Regions are decided on the smoothed surface, so the eye band and spine strip have clean edges.
        const smooth = mesh.positions
        regions = mesh.labels.map((part, i) => regionForPoint(part, smooth[i * 3]!, smooth[i * 3 + 1]!, smooth[i * 3 + 2]!))

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(mesh.positions.length), 3))
        geometry.setIndex(new THREE.BufferAttribute(mesh.index, 1))
        geometry.computeVertexNormals()
        body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.02 }))
        // The model faces +x; turn it to face the camera, and centre it on its own height.
        body.rotation.y = -Math.PI / 2
        geometry.computeBoundingBox()
        const box = geometry.boundingBox as THREE.Box3
        body.position.y = -(box.min.y + box.max.y) / 2
        scene.add(body)
        repaint()
        setReady(true)
      },
      undefined,
      () => live.current.onUnavailable(),
    )

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const regionAt = (e: PointerEvent): BodyRegionId | null => {
      if (!body) return null
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(body)[0]
      if (!hit?.face) return null
      // Take the corner of the triangle nearest the hit point.
      const local = body.worldToLocal(hit.point.clone())
      const pos = body.geometry.getAttribute('position')
      const v = new THREE.Vector3()
      let nearest = hit.face.a
      let best = Infinity
      for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
        const d = v.fromBufferAttribute(pos, i).distanceToSquared(local)
        if (d < best) [best, nearest] = [d, i]
      }
      return regions[nearest] ?? null
    }

    let downAt: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
      turnTarget = null // the person has taken over
    }
    const onUp = (e: PointerEvent) => {
      // A drag turns the figure; only a press that barely moved counts as a click.
      const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 0
      downAt = null
      if (moved > 5) return
      const region = regionAt(e)
      if (region) live.current.onSelect(region)
    }
    const onMove = (e: PointerEvent) => {
      const region = downAt ? null : regionAt(e)
      renderer.domElement.style.cursor = region ? 'pointer' : 'grab'
      setHovered((prev) => (prev === region ? prev : region))
    }
    const onLeave = () => setHovered(null)
    const el = renderer.domElement
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()
    loop()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      controls.dispose()
      body?.geometry.dispose()
      ;(body?.material as THREE.Material | undefined)?.dispose()
      renderer.dispose()
      el.remove()
    }
  }, [])

  // Recolour whenever the selection, pain or hover changes.
  const painKey = JSON.stringify(pain)
  useEffect(() => {
    live.current.repaint()
  }, [selected, painKey, hovered, ready])

  return (
    <div className="body-3d">
      <div
        ref={mountRef}
        className="body-3d-canvas"
        role="img"
        aria-label={`Rotatable 3D body. Selected region: ${BODY_REGIONS[selected].name}. Use the region buttons below to choose a region with the keyboard.`}
      />
      <p className="body-3d-hint" aria-live="polite">
        {!ready ? 'Loading 3D body…' : hovered ? BODY_REGIONS[hovered].name : 'Drag to turn · click a region'}
      </p>
      <div className="body-3d-views" role="group" aria-label="Turn the body to a view">
        {VIEWS.map((view) => (
          <button key={view.label} type="button" className="zone-btn" onClick={() => live.current.turnTo(view.azimuth)} disabled={!ready}>
            {view.label}
          </button>
        ))}
      </div>
    </div>
  )
}
