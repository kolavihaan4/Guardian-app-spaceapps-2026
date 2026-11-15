import { BODY_REGIONS, type BodyRegionId } from '@astrovitals/shared'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ANATOMY_STRUCTURES, type AnatomySystem } from './anatomyStructures'
import { regionForSkinPoint, regionForStructure } from './bodyRegions'

export type AnatomySex = 'male' | 'female'

// Skin colours follow the Still palette in styles.css, as on the simpler 3D figure.
const COLOR = {
  body: new THREE.Color('#e6eeec'),
  hover: new THREE.Color('#b4cdc8'),
  selected: new THREE.Color('#4f7d76'),
  painMild: new THREE.Color('#f1c4ae'),
  painSevere: new THREE.Color('#c9532c'),
  glowSelected: new THREE.Color('#3f8f84'),
  faded: new THREE.Color('#dde5e6'),
  glowPain: new THREE.Color('#c9532c'),
}

const VIEWS = [
  { label: 'Front', azimuth: 0 },
  { label: 'Left side', azimuth: Math.PI / 2 },
  { label: 'Back', azimuth: Math.PI },
  { label: 'Right side', azimuth: -Math.PI / 2 },
] as const

/** The layers a person can show or hide. Organs include the vessels and nerves. */
const LAYERS = [
  { id: 'skin', label: 'Skin', systems: ['skin'] },
  { id: 'muscles', label: 'Muscles', systems: ['muscles'] },
  { id: 'skeleton', label: 'Skeleton', systems: ['skeleton'] },
  { id: 'organs', label: 'Organs', systems: ['organs', 'vessels', 'nerves'] },
] as const satisfies readonly { id: string; label: string; systems: readonly AnatomySystem[] }[]
type LayerId = (typeof LAYERS)[number]['id']

interface Props {
  sex: AnatomySex
  selected: BodyRegionId
  /** Logged pain per region, 1–10. Regions without pain are absent. */
  pain: Partial<Record<BodyRegionId, number>>
  onSelect: (region: BodyRegionId) => void
  /** Called when WebGL or the model cannot load, so the page can fall back to the simpler figure. */
  onUnavailable: () => void
}

/** Zoom steps: the whole figure, then closer views centred on the selected region. */
const ZOOMS = [1, 1.6, 2.4] as const

/** Surface finish per layer: bone is matt, organs and vessels have a soft wet sheen. */
const FINISH: Record<'muscles' | 'skeleton' | 'organs', THREE.MeshPhysicalMaterialParameters> = {
  skeleton: { roughness: 0.72, metalness: 0, clearcoat: 0.05 },
  muscles: { roughness: 0.5, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.5 },
  organs: { roughness: 0.4, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35 },
}

interface Part {
  mesh: THREE.Mesh
  material: THREE.MeshPhysicalMaterial
  /** The structure's own colour, kept so it can be faded and restored. */
  base: THREE.Color
  region: BodyRegionId
  label: string
  layer: LayerId
}

/**
 * A rotatable 3D body with the organs, skeleton and muscles inside it (open-anatomy-3d models).
 * The skin is see-through, so the structures of the selected region glow through it. Drag to turn,
 * or use the view buttons; click to select a region. The region buttons under the figure give
 * keyboard and screen-reader users the same choices.
 */
export default function Anatomy3D({ sex, selected, pain, onSelect, onUnavailable }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<{ region: BodyRegionId; label?: string } | null>(null)
  const [ready, setReady] = useState(false)
  const [zoom, setZoom] = useState(0)
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({ skin: true, muscles: false, skeleton: true, organs: true })
  // One long-lived effect owns the scene; it reads the latest props through this ref.
  const live = useRef({ selected, pain, hovered, layers, zoom, onSelect, onUnavailable, repaint: () => {}, turnTo: (_azimuth: number) => {} })
  live.current.selected = selected
  live.current.pain = pain
  live.current.hovered = hovered
  live.current.layers = layers
  live.current.zoom = zoom
  live.current.onSelect = onSelect
  live.current.onUnavailable = onUnavailable

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    setReady(false)
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
    // A soft studio environment gives the organs and bones gentle reflections instead of flat colour.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environment
    scene.environmentIntensity = 0.3
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    const DISTANCE = 4.2
    camera.position.set(0, 0, DISTANCE)
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9c9d6', 1.1))
    // The key light rides with the camera, so the side facing the viewer is always lit.
    const key = new THREE.DirectionalLight('#ffffff', 1.5)
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
    controls.minPolarAngle = Math.PI / 2 - 0.2
    controls.maxPolarAngle = Math.PI / 2 + 0.2

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let turnTarget: number | null = null
    const offset = new THREE.Vector3()
    const setAzimuth = (azimuth: number) => {
      const radius = camera.position.distanceTo(controls.target)
      camera.position.copy(controls.target).add(offset.setFromSphericalCoords(radius, controls.getPolarAngle(), azimuth))
      camera.lookAt(controls.target)
    }
    // Height of each region's centre, for zooming in on the selected one.
    const regionHeight: Partial<Record<BodyRegionId, number>> = {}
    live.current.turnTo = (azimuth) => {
      if (reduceMotion) setAzimuth(azimuth)
      else turnTarget = azimuth
    }

    const parts: Part[] = []
    let skin: THREE.Mesh | null = null
    let figure: THREE.Object3D | null = null
    let skinRegions: BodyRegionId[] = []
    let disposed = false
    let frame = 0
    const loop = () => {
      frame = requestAnimationFrame(loop)
      if (turnTarget !== null) {
        const now = controls.getAzimuthalAngle()
        const diff = Math.atan2(Math.sin(turnTarget - now), Math.cos(turnTarget - now))
        if (Math.abs(diff) < 0.01) {
          setAzimuth(turnTarget)
          turnTarget = null
        } else {
          setAzimuth(now + diff * 0.16)
        }
      }
      // Ease the camera towards the chosen zoom, centred on the selected region when zoomed in.
      const zoomBy = ZOOMS[live.current.zoom] ?? 1
      const wantRadius = DISTANCE / zoomBy
      const wantY = zoomBy > 1 ? (regionHeight[live.current.selected] ?? 0) : 0
      const ease = reduceMotion ? 1 : 0.12
      offset.copy(camera.position).sub(controls.target)
      const radius = offset.length()
      if (Math.abs(wantRadius - radius) > 0.001 || Math.abs(wantY - controls.target.y) > 0.001) {
        offset.setLength(radius + (wantRadius - radius) * ease)
        controls.target.y += (wantY - controls.target.y) * ease
        camera.position.copy(controls.target).add(offset)
      }
      controls.update()
      renderer.render(scene, camera)
    }

    const tint = new THREE.Color()
    const repaint = () => {
      const { selected: sel, pain: hurt, hovered: hov, layers: shown } = live.current
      for (const part of parts) {
        part.mesh.visible = shown[part.layer]
        const severity = hurt[part.region] ?? 0
        // The selected region keeps its full colour and the rest is faded back, so it stands out.
        // Structures of a region with pain glow coral.
        const inFocus = part.region === sel || part.region === hov?.region || severity > 0
        part.material.color.copy(part.base)
        if (!inFocus) part.material.color.lerp(COLOR.faded, 0.25)
        if (severity > 0) part.material.emissive.copy(COLOR.glowPain).multiplyScalar(0.25 + 0.45 * (Math.min(severity, 10) / 10))
        else if (part.region === sel) part.material.emissive.copy(part.base).multiplyScalar(0.22)
        else part.material.emissive.setScalar(0)
      }
      if (!skin) return
      skin.visible = shown.skin
      const colors = skin.geometry.getAttribute('color') as THREE.BufferAttribute
      const byRegion = new Map<BodyRegionId, THREE.Color>()
      skinRegions.forEach((region, i) => {
        let c = byRegion.get(region)
        if (!c) {
          const severity = hurt[region] ?? 0
          c = new THREE.Color()
          if (severity > 0) c.lerpColors(COLOR.painMild, COLOR.painSevere, Math.min(severity, 10) / 10)
          else c.copy(region === sel ? COLOR.selected : region === hov?.region ? COLOR.hover : COLOR.body)
          if (severity > 0 && region === sel) c.lerp(tint.set('#5b2a1a'), 0.35)
          byRegion.set(region, c)
        }
        colors.setXYZ(i, c.r, c.g, c.b)
      })
      colors.needsUpdate = true
    }
    live.current.repaint = repaint

    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
      `/models/anatomy-${sex}.glb`,
      (gltf) => {
        if (disposed) return
        const root = gltf.scene
        root.updateMatrixWorld(true)
        const point = new THREE.Vector3()
        root.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return
          // The loader renames a mesh that shares its group's name ("skin" inside "skin" becomes "skin_1").
          const name = ANATOMY_STRUCTURES[o.name] ? o.name : o.name.replace(/_\d+$/, '')
          const info = ANATOMY_STRUCTURES[name]
          if (!info) {
            o.visible = false
            return
          }
          if (!o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals()
          if (info.system === 'skin') {
            // Colour the skin per vertex by region, using each vertex's place on the body.
            const position = o.geometry.getAttribute('position')
            skinRegions = Array.from({ length: position.count }, (_, i) => {
              point.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld)
              return regionForSkinPoint(point.x, point.y, point.z)
            })
            o.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(position.count * 3), 3))
            // See-through, and drawn after everything inside it.
            const skinMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, roughness: 0.45, metalness: 0, envMapIntensity: 0.4 })
            // Glass-like shell: nearly clear where it faces the viewer, denser at the silhouette,
            // so the outline of the body reads clearly without hiding what is inside.
            // A region that is selected, hovered or has pain is tinted, and shows more solidly.
            skinMaterial.onBeforeCompile = (shader) => {
              shader.uniforms.plainSkin = { value: COLOR.body }
              shader.fragmentShader = shader.fragmentShader
                .replace('void main() {', 'uniform vec3 plainSkin;\nvoid main() {')
                .replace(
                  '#include <dithering_fragment>',
                  '#include <dithering_fragment>\n  float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));\n  float tinted = clamp(distance(vColor.rgb, plainSkin) * 4.0, 0.0, 1.0);\n  gl_FragColor.a = max(mix(0.1, 0.8, pow(rim, 2.4)), 0.2 * tinted);',
                )
            }
            o.material = skinMaterial
            o.renderOrder = 1
            skin = o
            return
          }
          const layer = LAYERS.find((l) => (l.systems as readonly AnatomySystem[]).includes(info.system))
          if (!layer || layer.id === 'skin') return
          const material = new THREE.MeshPhysicalMaterial({ color: info.color, ...FINISH[layer.id] })
          o.material = material
          parts.push({ mesh: o, material, base: new THREE.Color(info.color), region: regionForStructure(name), label: info.label, layer: layer.id })
        })
        if (!skin) {
          live.current.onUnavailable()
          return
        }
        // Centre the figure on its own height and scale it to fill the view.
        const box = new THREE.Box3().setFromObject(skin)
        const height = box.max.y - box.min.y
        const scale = 1.95 / height
        root.scale.setScalar(scale)
        root.position.y = -((box.min.y + box.max.y) / 2) * scale
        scene.add(root)
        figure = root
        root.updateMatrixWorld(true)
        const centre = new THREE.Vector3()
        const sums: Partial<Record<BodyRegionId, { y: number; n: number }>> = {}
        for (const part of parts) {
          new THREE.Box3().setFromObject(part.mesh).getCenter(centre)
          const sum = (sums[part.region] ??= { y: 0, n: 0 })
          sum.y += centre.y
          sum.n += 1
        }
        for (const [region, sum] of Object.entries(sums)) regionHeight[region as BodyRegionId] = sum.y / sum.n
        repaint()
        setReady(true)
      },
      undefined,
      () => live.current.onUnavailable(),
    )

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const local = new THREE.Vector3()
    const hitAt = (e: PointerEvent): { region: BodyRegionId; label?: string } | null => {
      if (!skin) return null
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      // With the skin on, the region comes from where the skin was touched; with it off, from
      // the structure under the pointer.
      if (skin.visible) {
        const hit = raycaster.intersectObject(skin)[0]
        if (!hit) return null
        // Back to the model's own metres, undoing the scene's scale and centring.
        if (!figure) return null
        figure.worldToLocal(local.copy(hit.point))
        return { region: regionForSkinPoint(local.x, local.y, local.z) }
      }
      const hit = raycaster.intersectObjects(parts.filter((p) => p.mesh.visible).map((p) => p.mesh))[0]
      const part = hit && parts.find((p) => p.mesh === hit.object)
      return part ? { region: part.region, label: part.label } : null
    }

    let downAt: { x: number; y: number } | null = null
    let lastHover = 0
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
      turnTarget = null // the person has taken over
    }
    const onUp = (e: PointerEvent) => {
      const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 0
      downAt = null
      if (moved > 5) return // a drag turns the figure
      const hit = hitAt(e)
      if (hit) live.current.onSelect(hit.region)
    }
    const onMove = (e: PointerEvent) => {
      // The models are detailed, so look under the pointer at most about 12 times a second.
      if (downAt || e.timeStamp - lastHover < 80) return
      lastHover = e.timeStamp
      const hit = hitAt(e)
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab'
      setHovered((prev) => (prev?.region === hit?.region && prev?.label === hit?.label ? prev : hit))
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
      environment.dispose()
      pmrem.dispose()
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        o.geometry.dispose()
        ;(o.material as THREE.Material).dispose()
      })
      renderer.dispose()
      el.remove()
    }
  }, [sex])

  // Recolour whenever the selection, pain, hover or visible layers change.
  const painKey = JSON.stringify(pain)
  useEffect(() => {
    live.current.repaint()
  }, [selected, painKey, hovered, layers, ready])

  return (
    <div className="body-3d">
      <div
        ref={mountRef}
        className={`body-3d-canvas tall ${zoom > 0 ? 'zoomed' : ''}`}
        role="img"
        aria-label={`Rotatable 3D ${sex} body with organs and skeleton. Selected region: ${BODY_REGIONS[selected].name}. Use the region buttons below to choose a region with the keyboard.`}
      />
      <p className="body-3d-hint" aria-live="polite">
        {!ready ? 'Loading 3D body…' : hovered ? (hovered.label ? `${hovered.label} · ${BODY_REGIONS[hovered.region].name}` : BODY_REGIONS[hovered.region].name) : 'Drag to turn · click a region'}
      </p>
      <div className="body-3d-views" role="group" aria-label="Turn the body to a view">
        {VIEWS.map((view) => (
          <button key={view.label} type="button" className="zone-btn" onClick={() => live.current.turnTo(view.azimuth)} disabled={!ready}>
            {view.label}
          </button>
        ))}
      </div>
      <div className="body-3d-views" role="group" aria-label="Zoom">
        <button type="button" className="zone-btn" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={!ready || zoom === 0} aria-label="Zoom out">
          − Zoom out
        </button>
        <button type="button" className="zone-btn" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={!ready || zoom === ZOOMS.length - 1} aria-label="Zoom in on the selected region">
          + Zoom in
        </button>
      </div>
      <div className="body-3d-views" role="group" aria-label="Show or hide body layers">
        {LAYERS.map((layer) => (
          <button
            key={layer.id}
            type="button"
            className={`zone-btn ${layers[layer.id] ? 'active' : ''}`}
            aria-pressed={layers[layer.id]}
            onClick={() => setLayers((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))}
            disabled={!ready}
          >
            {layer.label}
          </button>
        ))}
      </div>
    </div>
  )
}
