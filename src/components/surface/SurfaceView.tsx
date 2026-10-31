import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { surfaceFor, type SurfaceDef } from '../../data/surfaces'
import { textureUrl } from '../../data/textures'
import { PLANETS } from '../../data/bodies'
import { useOptionalTexture } from '../../hooks/useOptionalTexture'
import { haloTexture } from '../ship/ShipModel'
import { ASCENT, DESCENT, FADE, landingNow, skipDescent, startTakeoff, useLanding } from '../../state/landing'
import { LANDER_POS, Terrain, grainTexture, rockGeometry, seeded } from './terrain'
import { named, t, useLang } from '../../i18n/lang'

// 着陸した天体の地表の場面。宇宙の場面とは別の Canvas で描く（そのあいだ宇宙の場面は止める）。
// 立つ場所は 1 か所に決めて、まわりを 360° 見回せる。着陸船は少し先に降りてくる。

const SKY_R = 9000
const EYE = 1.7
const LANDER_M = 24
const DESCENT_FROM = 260
const LANDER_YAW = 1.25

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

/** 方位（度。0 が正面の -Z、時計回り）と高度（度）からの向き */
function dirFrom(azDeg: number, elDeg: number) {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
}

function bodyName(id: string) {
  for (const p of PLANETS) {
    if (p.id === id) return named(p)
    const m = p.moons.find((x) => x.id === id)
    if (m) return named(m)
  }
  return id
}

// ---- 空 -------------------------------------------------------------------------

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const skyFragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uGlow;
  uniform float uAir;
  uniform float uHaze;
  uniform float uStars;
  uniform sampler2D uStarMap;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float el = d.y;
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(el, 0.0, 1.0), 0.45));
    sky = mix(sky, uHorizon * 0.6, smoothstep(0.0, -0.25, el));
    float s = max(dot(d, uSunDir), 0.0);
    sky += uGlow * (pow(s, 12.0) * 0.6 + pow(s, 3.0) * 0.15 * uHaze);
    vec3 col = sky * uAir;
    // 星（天の川の写真）：大気が無いほど、はっきり
    vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415926 + 0.5);
    vec3 stars = texture2D(uStarMap, uv).rgb;
    col += stars * stars * uStars * 1.6;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Sky({ def, sunDir }: { def: SurfaceDef; sunDir: THREE.Vector3 }) {
  const stars = useOptionalTexture(textureUrl('milkyWay'))
  const mat = useMemo(() => {
    const air = def.sky ? 1 : 0
    const glow = def.id === 'mars' ? new THREE.Color('#7fa6d6') : new THREE.Color(def.sky ? def.sky.horizon : '#000000')
    return new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(def.sky?.zenith ?? '#000000') },
        uHorizon: { value: new THREE.Color(def.sky?.horizon ?? '#000000') },
        uSunDir: { value: sunDir },
        uGlow: { value: glow },
        uAir: { value: air },
        uHaze: { value: def.haze },
        uStars: { value: 0 },
        uStarMap: { value: null },
      },
    })
  }, [def, sunDir])
  useEffect(() => {
    mat.uniforms.uStarMap.value = stars
    mat.uniforms.uStars.value = stars ? def.stars : 0
  }, [mat, stars, def.stars])
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[SKY_R, 48, 24]} />
    </mesh>
  )
}

function SunDisc({ def, sunDir }: { def: SurfaceDef; sunDir: THREE.Vector3 }) {
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color(1.6, 1.5, 1.35), transparent: true, depthWrite: false, fog: false, toneMapped: false }),
    [],
  )
  if (def.sunHidden) return null
  const angle = 0.533 / def.au
  // 光のにじみを含めて、少し大きめに（遠い星でも点として見えるように下限をつける）
  const size = Math.max(2 * SKY_R * Math.tan(((angle * Math.PI) / 180) / 2) * 7, 60)
  const p = sunDir.clone().multiplyScalar(SKY_R * 0.95)
  return <sprite material={mat} position={p} scale={[size, size, 1]} renderOrder={-9} />
}

/** 空に浮かぶ母惑星（または衛星）。太陽の光で満ち欠けする */
function SkyPlanet({ def }: { def: SurfaceDef }) {
  const sb = def.skyBody!
  const map = useOptionalTexture(textureUrl(sb.id))
  const ringMap = useOptionalTexture(sb.ringOpen !== undefined ? textureUrl('saturnRing') : undefined)
  const dist = SKY_R * 0.8
  const r = dist * Math.tan(((sb.angle * Math.PI) / 180) / 2)
  const dir = useMemo(() => dirFrom(sb.az, sb.el), [sb.az, sb.el])
  const pos = useMemo(() => dir.clone().multiplyScalar(dist), [dir, dist])
  const fade = Math.max(0.08, 1 - def.haze * 1.15)
  const ring = useMemo(() => {
    if (sb.ringOpen === undefined) return null
    const planet = PLANETS.find((p) => p.id === sb.id)!.ring!
    const geo = new THREE.RingGeometry(r * planet.inner, r * planet.outer, 128, 1)
    const uv = geo.attributes.uv as THREE.BufferAttribute
    const p = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const d = Math.hypot(p.getX(i), p.getY(i))
      uv.setXY(i, (d - r * planet.inner) / (r * (planet.outer - planet.inner)), 0.5)
    }
    // 輪の面：見る向き f と、その横 r を含む面を、ringOpen だけ開く。赤道の傾きの分だけ少しひねる
    const f = dir.clone()
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, f).normalize()
    const open = ((sb.ringOpen ?? 0) * Math.PI) / 180
    const n = up.clone().multiplyScalar(Math.cos(open)).addScaledVector(f, -Math.sin(open)).normalize()
    n.applyAxisAngle(f, 0.35)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
    return { geo, q }
  }, [sb.ringOpen, sb.id, r, dir])
  return (
    <group position={pos}>
      <mesh rotation={[0.4, 2.2, 0.2]}>
        <sphereGeometry args={[r, 64, 32]} />
        <meshStandardMaterial
          key={map ? 'map' : 'color'}
          map={map}
          color={map ? '#ffffff' : sb.color}
          roughness={1}
          metalness={0}
          fog={false}
          transparent={fade < 1}
          opacity={fade}
        />
      </mesh>
      {ring && (
        <mesh geometry={ring.geo} quaternion={ring.q}>
          <meshStandardMaterial key={ringMap ? 'map' : 'none'} map={ringMap} alphaMap={ringMap} color="#e8dcc0" transparent opacity={0.9 * fade} side={THREE.DoubleSide} depthWrite={false} fog={false} />
        </mesh>
      )}
    </group>
  )
}

/** 噴き出す柱（エンケラドゥスの氷の噴水・イオの火山・トリトンの間欠泉） */
function Plumes({ def }: { def: SurfaceDef }) {
  const items = useMemo(() => {
    const out: { pos: THREE.Vector3; scale: number; color: THREE.Color; opacity: number }[] = []
    const rnd = seeded(31)
    const add = (az: number, dist: number, height: number, width: number, color: string, opacity: number, umbrella = false, lean = 0) => {
      const base = dirFrom(az, 0).multiplyScalar(dist)
      const n = 26
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1)
        const p = base.clone()
        p.y = u * height
        p.x += lean * u * u * height
        const w = umbrella ? width * (0.4 + 2.2 * u ** 3) : width * (0.6 + 0.8 * u)
        out.push({ pos: p.add(new THREE.Vector3((rnd() - 0.5) * w * 0.3, 0, (rnd() - 0.5) * w * 0.3)), scale: w, color: new THREE.Color(color), opacity: opacity * (1 - 0.6 * u) })
      }
    }
    for (const x of def.extras ?? []) {
      if (x === 'plumes') {
        add(-70, 2600, 2400, 260, '#dfeaff', 0.16)
        add(-55, 3100, 3000, 300, '#dfeaff', 0.13)
        add(-85, 2900, 2000, 220, '#dfeaff', 0.12)
      } else if (x === 'volcano') add(60, 2900, 2200, 380, '#f2e6a8', 0.2, true)
      else if (x === 'geysers') {
        add(-60, 2400, 2600, 70, '#2a2420', 0.35, false, 0.25)
        add(70, 3000, 2200, 60, '#2a2420', 0.3, false, 0.25)
      }
    }
    return out
  }, [def])
  const mats = useMemo(() => items.map((it) => new THREE.SpriteMaterial({ map: haloTexture(), color: it.color, transparent: true, opacity: it.opacity, depthWrite: false, fog: false })), [items])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])
  return (
    <>
      {items.map((it, i) => (
        <sprite key={i} material={mats[i]} position={it.pos} scale={[it.scale, it.scale, 1]} />
      ))}
    </>
  )
}

// ---- 地面と岩 ---------------------------------------------------------------------

function Ground({ terrain }: { terrain: Terrain }) {
  const def = terrain.def
  const geo = useMemo(() => terrain.geometry(), [terrain])
  const rocks = useMemo(() => terrain.rocks(Math.round(def.relief.rocks * 1400)), [terrain, def.relief.rocks])
  const round = def.id === 'titan'
  const rockGeos = useMemo(() => [0, 1, 2].map((k) => rockGeometry(terrain.seed + k * 17, round)), [terrain.seed, round])
  const grain = grainTexture()
  const groundMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, map: grain, bumpMap: grain, bumpScale: 0.8 })
    return m
  }, [grain])
  const rockMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: def.rock, roughness: round ? 0.7 : 0.92, metalness: 0, map: grain, bumpMap: grain, bumpScale: 1.5 }),
    [def.rock, grain, round],
  )
  const inst = useRef<(THREE.InstancedMesh | null)[]>([])
  useEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    const counts = [0, 0, 0]
    for (const r of rocks) {
      const mesh = inst.current[r.v]
      if (!mesh) continue
      e.set(r.tilt, r.rot, r.tilt * 0.5)
      q.setFromEuler(e)
      s.set(r.s, r.s * r.sy, r.s * (0.7 + 0.3 * r.sy))
      p.set(r.x, r.y, r.z)
      m.compose(p, q, s)
      mesh.setMatrixAt(counts[r.v]++, m)
    }
    inst.current.forEach((mesh, i) => {
      if (!mesh) return
      mesh.count = counts[i]
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    })
  }, [rocks])
  useEffect(
    () => () => {
      geo.dispose()
      rockGeos.forEach((g) => g.dispose())
      groundMat.dispose()
      rockMat.dispose()
    },
    [geo, rockGeos, groundMat, rockMat],
  )
  return (
    <>
      <mesh geometry={geo} material={groundMat} receiveShadow />
      {rockGeos.map((g, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            inst.current[i] = el
          }}
          args={[g, rockMat, rocks.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  )
}

// ---- 着陸船 -------------------------------------------------------------------------

/** 着陸船の腹の下の噴射口（glb の座標。1 = 24 m） */
const BELLY: [number, number, number][] = [
  [-0.11, 0.075, -0.2],
  [0.11, 0.075, -0.2],
  [-0.13, 0.08, 0.22],
  [0.13, 0.08, 0.22],
]

function Lander({ terrain, dustColor }: { terrain: Terrain; dustColor: string }) {
  const { scene } = useGLTF(url('ship-lander.glb'))
  const group = useRef<THREE.Group>(null)
  const ground = useMemo(() => terrain.height(LANDER_POS.x, LANDER_POS.y), [terrain])
  const built = useMemo(() => {
    const model = scene.clone(true)
    const owned: THREE.Material[] = []
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 2), toneMapped: false })
    owned.push(glow)
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      // 自分の影を受けると、細かい面に影のしま模様が出るので受けない
      mesh.receiveShadow = false
      const src = mesh.material as THREE.MeshStandardMaterial
      if (src.name === 'Glow') mesh.material = glow
      else if (src.name === 'NavRed' || src.name === 'NavGreen') {
        const m = new THREE.MeshBasicMaterial({ color: src.name === 'NavRed' ? new THREE.Color(1.3, 0.04, 0.04) : new THREE.Color(0.04, 1.3, 0.15), toneMapped: false })
        owned.push(m)
        mesh.material = m
      } else {
        const m = src.clone()
        m.emissive.setRGB(1, 1, 1)
        m.emissiveIntensity = 1
        m.envMapIntensity = 0.4
        owned.push(m)
        mesh.material = m
      }
    })
    // 腹の噴射：下へ伸びる光の粒の列
    const flameMat = new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color(0.8, 1.1, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    owned.push(flameMat)
    const flames: THREE.Sprite[] = []
    for (const p of BELLY) {
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Sprite(flameMat)
        sp.position.set(p[0], p[1] - 0.02 - k * 0.035, p[2])
        sp.userData.k = k
        model.add(sp)
        flames.push(sp)
      }
    }
    return { model, owned, flames, flameMat }
  }, [scene])
  useEffect(() => () => built.owned.forEach((m) => m.dispose()), [built])

  // 砂ぼこり：降りる・飛び立つときに、着陸船の下から外へ広がる
  const DUST = 260
  const dust = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(DUST * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ map: haloTexture(), color: dustColor, size: 6, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true })
    const vel = Array.from({ length: DUST }, () => new THREE.Vector3())
    const life = new Float32Array(DUST).fill(99)
    return { geo, mat, vel, life, next: 0 }
  }, [dustColor])
  useEffect(() => () => {
    dust.geo.dispose()
    dust.mat.dispose()
  }, [dust])

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const { phase, since } = useLanding.getState()
    const T = landingNow() - since
    let alt = 0
    let thrust = 0
    let wobble = 0
    if (phase === 'descent') {
      const u = Math.min(1, T / DESCENT)
      // はじめは速く、最後はゆっくり降りる
      alt = DESCENT_FROM * (1 - u) ** 2.6
      thrust = u < 0.97 ? 0.5 + 0.5 * u : Math.max(0, 1 - (u - 0.97) / 0.03)
      wobble = (1 - u) * 0.06
    } else if (phase === 'ascent' || phase === 'fadeOut') {
      const s = phase === 'ascent' ? T : ASCENT
      alt = s < 1 ? 0.6 * s * s : 0.6 + 5 * (s - 1) ** 2.2
      thrust = s < 0.4 ? s / 0.4 : 1
      wobble = Math.min(1, s / 3) * 0.05
    }
    g.position.set(LANDER_POS.x, ground + alt, LANDER_POS.y)
    const tm = landingNow()
    g.rotation.set(Math.sin(tm * 0.9) * wobble, LANDER_YAW + Math.sin(tm * 0.5) * wobble * 0.5, Math.sin(tm * 1.3) * wobble)
    const flick = 0.85 + 0.15 * Math.sin(tm * 41)
    built.flameMat.opacity = Math.min(1, thrust * 1.2)
    built.flames.forEach((sp) => {
      const k = sp.userData.k as number
      sp.scale.setScalar(thrust * (0.07 - k * 0.012) * flick)
      sp.visible = thrust > 0.02
    })
    // 砂ぼこり
    const near = thrust > 0.1 && alt < 35
    const pos = dust.geo.attributes.position as THREE.BufferAttribute
    if (near && terrain.def.dust) {
      const spawn = Math.ceil(dt * 160 * (1 - alt / 35))
      for (let i = 0; i < spawn; i++) {
        const j = dust.next++ % DUST
        const a = Math.random() * Math.PI * 2
        const sp = 8 + Math.random() * 18
        pos.setXYZ(j, LANDER_POS.x + Math.cos(a) * 3, ground + 0.5, LANDER_POS.y + Math.sin(a) * 3)
        dust.vel[j].set(Math.cos(a) * sp, 0.5 + Math.random() * 2.5, Math.sin(a) * sp)
        dust.life[j] = 0
      }
    }
    let alive = 0
    for (let j = 0; j < DUST; j++) {
      if (dust.life[j] > 3) {
        pos.setXYZ(j, 0, -1000, 0)
        continue
      }
      alive++
      dust.life[j] += dt
      // 大気が無いと、ほこりは弧を描いてすぐ落ちる。大気があると、ゆっくりただよう
      const drag = terrain.def.sky ? 1.2 : 0.1
      const v = dust.vel[j]
      v.multiplyScalar(Math.max(0, 1 - drag * dt))
      v.y -= 9.8 * terrain.def.gravity * dt
      pos.setXYZ(j, pos.getX(j) + v.x * dt, Math.max(ground + 0.1, pos.getY(j) + v.y * dt), pos.getZ(j) + v.z * dt)
    }
    pos.needsUpdate = true
    dust.mat.opacity = alive ? 0.35 : 0
  })

  return (
    <>
      <group ref={group} scale={LANDER_M} name="surface-lander">
        <primitive object={built.model} />
      </group>
      <points geometry={dust.geo} material={dust.mat} frustumCulled={false} />
    </>
  )
}

// ---- カメラ：立って見回す／着陸船のまわりを回る ---------------------------------------

function Look({ terrain }: { terrain: Terrain }) {
  const { camera, gl } = useThree()
  const cam = camera as THREE.PerspectiveCamera
  const view = useLanding((l) => l.view)
  const st = useRef({ yaw: -0.15, pitch: 0.12, fov: 60, orbitYaw: 0.9, orbitPitch: 0.22, orbitDist: 48 })
  const eyeY = useMemo(() => terrain.height(0, 0) + EYE, [terrain])
  const landerAt = useMemo(() => new THREE.Vector3(LANDER_POS.x, terrain.height(LANDER_POS.x, LANDER_POS.y) + 3, LANDER_POS.y), [terrain])

  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const canLook = () => useLanding.getState().phase === 'surface'
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!canLook()) return
      const s = st.current
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch) zoom(pinch / d)
        pinch = d
        return
      }
      const k = 0.0042 * (s.fov / 60)
      if (useLanding.getState().view === 'eye') {
        s.yaw += dx * k
        s.pitch = THREE.MathUtils.clamp(s.pitch + dy * k, -1.3, 1.45)
      } else {
        s.orbitYaw -= dx * 0.006
        s.orbitPitch = THREE.MathUtils.clamp(s.orbitPitch + dy * 0.004, 0.02, 1.3)
      }
    }
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = 0
    }
    const zoom = (f: number) => {
      const s = st.current
      if (useLanding.getState().view === 'eye') s.fov = THREE.MathUtils.clamp(s.fov * f, 12, 80)
      else s.orbitDist = THREE.MathUtils.clamp(s.orbitDist * f, 22, 160)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (canLook()) zoom(Math.exp(e.deltaY * 0.001))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  const look = useMemo(() => new THREE.Vector3(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  useFrame((state, dt) => {
    const s = st.current
    const { phase, since } = useLanding.getState()
    const T = landingNow() - since
    // 降下中と離陸中は、着陸船を目で追う
    if (phase === 'descent' || phase === 'ascent' || phase === 'fadeOut') {
      const lander = state.scene.getObjectByName('surface-lander')
      cam.position.set(0, eyeY, 0)
      if (lander) {
        lander.getWorldPosition(target)
        target.y += 4
        const dir = target.sub(cam.position).normalize()
        const yaw = Math.atan2(dir.x, -dir.z)
        const pitch = Math.asin(dir.y)
        // ゆっくり追いかける
        const k = phase === 'descent' && T < 0.1 ? 1 : 1 - Math.exp(-dt * 4)
        s.yaw += (yaw - s.yaw) * k
        s.pitch += (pitch - s.pitch) * k
      }
      s.fov += ((phase === 'descent' ? 50 : 55) - s.fov) * (1 - Math.exp(-dt * 2))
    }
    if (useLanding.getState().view === 'lander' && phase === 'surface') {
      const cp = Math.cos(s.orbitPitch)
      cam.position.set(
        landerAt.x + Math.sin(s.orbitYaw) * cp * s.orbitDist,
        landerAt.y + Math.sin(s.orbitPitch) * s.orbitDist,
        landerAt.z + Math.cos(s.orbitYaw) * cp * s.orbitDist,
      )
      const minY = terrain.height(cam.position.x, cam.position.z) + 1.2
      if (cam.position.y < minY) cam.position.y = minY
      cam.lookAt(landerAt)
      if (cam.fov !== 50) {
        cam.fov = 50
        cam.updateProjectionMatrix()
      }
      return
    }
    cam.position.set(0, eyeY, 0)
    look.set(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch)).add(cam.position)
    cam.lookAt(look)
    if (Math.abs(cam.fov - s.fov) > 0.01) {
      cam.fov = s.fov
      cam.updateProjectionMatrix()
    }
  })
  // 見方を変えたときの最初の向き
  useEffect(() => {
    if (view === 'lander') st.current.orbitYaw = Math.atan2(-LANDER_POS.x, -LANDER_POS.y) + 0.6
  }, [view])
  return null
}

// ---- 場面 ---------------------------------------------------------------------------

/** 空・地平線・地面の色を、まわりの景色として材質に映すための、ゆるいグラデーション */
function skyEnvTexture(def: SurfaceDef) {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 32)
  const zenith = def.sky ? def.sky.zenith : '#05060a'
  const horizon = def.sky ? def.sky.horizon : '#1a1c22'
  grad.addColorStop(0, zenith)
  grad.addColorStop(0.47, horizon)
  grad.addColorStop(0.53, def.ground)
  grad.addColorStop(1, def.ground2 ?? def.ground)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 32)
  const t = new THREE.CanvasTexture(c)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Scene({ def }: { def: SurfaceDef }) {
  const terrain = useMemo(() => new Terrain(def), [def])
  const sunDir = useMemo(() => dirFrom(def.sunAz, def.sunEl), [def.sunAz, def.sunEl])
  const { scene } = useThree()
  const sun = useRef<THREE.DirectionalLight>(null)
  // 遠い星ほど暗いが、目は慣れるので、明るさの落ち方はゆるめにする
  const sunPower = def.sunHidden ? 1.3 * def.au ** -0.3 : 2.8 * def.au ** -0.45
  const skyCol = def.sky ? new THREE.Color(def.sky.horizon) : new THREE.Color('#202430')
  useEffect(() => {
    scene.background = new THREE.Color('#000000')
    // 金属の面に映りこむまわりの景色（これが無いと、もやの星で金属の面が真っ黒になる）
    const env = skyEnvTexture(def)
    scene.environment = env
    scene.environmentIntensity = def.sunHidden ? 0.9 : def.sky ? 0.6 : 0.25
    // 動作確認用（#debug のとき）
    if (location.hash.includes('debug')) (window as unknown as { __surface: THREE.Scene }).__surface = scene
    return () => {
      scene.environment = null
      env.dispose()
    }
  }, [scene, def])
  useEffect(() => {
    const l = sun.current
    if (!l) return
    l.target.position.set(0, 0, -15)
    l.target.updateMatrixWorld()
  }, [])
  const sunPos = sunDir.clone().multiplyScalar(160).add(new THREE.Vector3(0, 0, -15))
  return (
    <>
      {/* もや：材質を作る前に置く（後から足すと、材質にもやが効かない） */}
      {def.haze > 0 && <fogExp2 attach="fog" args={[def.hazeColor, def.haze * 0.0011]} />}
      <Sky def={def} sunDir={sunDir} />
      <SunDisc def={def} sunDir={sunDir} />
      {def.skyBody && <SkyPlanet def={def} />}
      <Plumes def={def} />
      <directionalLight
        ref={sun}
        position={sunPos}
        intensity={sunPower}
        color={def.sunHidden ? def.hazeColor : '#fff6e8'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      {/* 空からの光と、地面の照り返し（大気の無い星では、影の側はほとんど真っ黒） */}
      <hemisphereLight args={[skyCol, new THREE.Color(def.ground), def.sunHidden ? 0.7 : def.sky ? 0.45 : 0.15]} />
      <Ground terrain={terrain} />
      <Suspense fallback={null}>
        <Lander terrain={terrain} dustColor={def.sky ? def.hazeColor : def.ground} />
      </Suspense>
      <Look terrain={terrain} />
    </>
  )
}

// ---- 画面の上の表示 -------------------------------------------------------------------

function SurfacePanel({ def }: { def: SurfaceDef }) {
  useLang()
  const phase = useLanding((l) => l.phase)
  const view = useLanding((l) => l.view)
  const setView = useLanding((l) => l.setView)
  // スマホの縦画面では、説明は畳んでおく（タップで開く）
  const [open, setOpen] = useState(() => window.innerWidth > 700)
  const name = bodyName(def.id)
  const weight = Math.max(0.01, 30 * def.gravity)
  const temp = def.temp[0] === def.temp[1] ? `${def.temp[0]}℃` : `${def.temp[0]}〜${def.temp[1]}℃`
  const skyName = def.skyBody ? bodyName(def.skyBody.id) : null
  return (
    <div className="surface-ui">
      {phase === 'descent' && (
        <div className="surface-caption">
          <div>{t(`${name}へ降下中…`, `Descending to ${name}…`)}</div>
          <button className="secondary" onClick={skipDescent}>
            {t('スキップ', 'Skip')}
          </button>
        </div>
      )}
      {phase === 'ascent' && <div className="surface-caption">{t('離陸！母船へもどります', 'Lift-off! Heading back to the ship')}</div>}
      {phase === 'surface' && (
        <>
          <div className={`surface-card${open ? '' : ' closed'}`}>
            <button className="surface-title" onClick={() => setOpen(!open)}>
              {t(`${name}に着陸`, `Landed on ${name}`)} <span className="muted">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
              <>
                <div className="surface-stats">
                  <span>
                    {t('重力', 'Gravity')} {def.gravity < 0.01 ? def.gravity.toFixed(4) : def.gravity.toFixed(2)} G
                  </span>
                  <span>
                    {t('気温', 'Temp.')} {temp}
                  </span>
                </div>
                <div className="surface-weight">
                  {t(`体重30kgの人は、ここでは${weight < 1 ? weight.toFixed(2) : weight.toFixed(1)}kgの重さに`, `Someone who weighs 30 kg on Earth would weigh ${weight < 1 ? weight.toFixed(2) : weight.toFixed(1)} kg here`)}
                </div>
                <p>{t(def.note[0], def.note[1])}</p>
                {def.skyNote && <p className="muted">{t(def.skyNote[0], def.skyNote[1])}</p>}
                {skyName && !def.skyNote && (
                  <p className="muted">
                    {t(`空に${skyName}が見えています（見かけの大きさ ${def.skyBody!.angle.toFixed(1)}°。満月は約0.5°）`, `${skyName} hangs in the sky (${def.skyBody!.angle.toFixed(1)}° across; the full Moon is about 0.5°)`)}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="surface-hint">
            {view === 'eye'
              ? t('ドラッグで見回す・ホイール／2本指でズーム', 'Drag to look around · scroll or pinch to zoom')
              : t('ドラッグで回る・ホイール／2本指で近づく', 'Drag to orbit · scroll or pinch to move closer')}
          </div>
          <div className="surface-buttons">
            <button className="secondary" onClick={() => setView(view === 'eye' ? 'lander' : 'eye')}>
              {view === 'eye' ? t('着陸船を眺める', 'View the lander') : t('地面に立って見回す', 'Stand and look around')}
            </button>
            <button className="primary" onClick={startTakeoff}>
              {t('離陸する', 'Take off')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function SurfaceView() {
  const phase = useLanding((l) => l.phase)
  const bodyId = useLanding((l) => l.bodyId)
  const since = useLanding((l) => l.since)
  const def = bodyId ? surfaceFor(bodyId) : null
  const scene3d = phase === 'descent' || phase === 'surface' || phase === 'ascent'
  // 暗転の幕：宇宙 → 地表、地表 → 宇宙
  const [, setTick] = useState(0)
  useEffect(() => {
    if (phase === 'idle' || phase === 'surface') return
    let raf = 0
    const loop = () => {
      setTick((n) => n + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase])
  if (phase === 'idle' || !def) return null
  const T = landingNow() - since
  let curtain = 0
  if (phase === 'fadeIn') curtain = Math.min(1, T / FADE)
  else if (phase === 'descent') curtain = Math.max(0, 1 - T / FADE)
  else if (phase === 'ascent') curtain = Math.max(0, (T - (ASCENT - FADE)) / FADE)
  else if (phase === 'fadeOut') curtain = Math.max(0, 1 - T / FADE)
  return (
    <div className="surface-view">
      {scene3d && (
        <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 60, near: 0.3, far: SKY_R * 1.2, position: [0, EYE, 0] }}>
          <Scene def={def} />
        </Canvas>
      )}
      <SurfacePanel def={def} />
      <div className="surface-curtain" style={{ opacity: curtain, pointerEvents: curtain > 0.5 ? 'auto' : 'none' }} />
    </div>
  )
}

// 宇宙の場面の外に置くので、glb は前もって読み込んでおく
useGLTF.preload(url('ship-lander.glb'))
