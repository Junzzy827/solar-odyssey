import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { create } from 'zustand'
import { blurGrid, buildFields, CELL, type Field, heightAt, N, SIZE, slopeGrid } from './heightfield'
import { groundLabMaterial, labUniforms, rockLabMaterial } from './labMaterial'
import { labRockGeometry, type Rock, rockContact, ruleRocks, scatterRocks } from './rocks'
import './terrainLab.css'

// 地形ラボ（URL の末尾に #terrain-lab）。地形 1 枚で、地面の作り方を 1 つずつ切り替えて見比べる試作ページ。
// ふだんの画面には出ない。良かった設定は、あとで着陸地表（components/surface）に移す。

type Tri = 0 | 1
type Blend = 0 | 1 | 2
type RockMode = 0 | 1 | 2
type View = 0 | 1 | 2
type Cam = 'rover' | 'cliff' | 'oblique' | 'top' | 'free'

type LabState = {
  tri: Tri
  blend: Blend
  erode: boolean
  rocks: RockMode
  view: View
  cam: Cam
  sunEl: number
  sunAz: number
  photo: number | null
  set: (p: Partial<Omit<LabState, 'set'>>) => void
}

const ALL_ON = { tri: 1 as Tri, blend: 2 as Blend, erode: true, rocks: 2 as RockMode }
const OLD = { tri: 0 as Tri, blend: 1 as Blend, erode: false, rocks: 1 as RockMode }

export const useTerrainLab = create<LabState>((set) => ({
  ...ALL_ON,
  view: 0,
  cam: 'rover',
  sunEl: 22,
  sunAz: 235,
  photo: null,
  set: (p) => set(p),
}))

const PHOTOS = [
  { src: 'terrain-lab/ref-dingo-gap.jpg', name: 'ディンゴ・ギャップ（砂の谷と、崖のふもとの岩）', id: 'PIA17931' },
  { src: 'terrain-lab/ref-buttes.jpg', name: 'シャープ山のふもとの丘（斜面の岩肌と砂）', id: 'PIA19912' },
  { src: 'terrain-lab/ref-kimberley.jpg', name: 'キンバリー（砂に半分埋まった板状の岩）', id: 'PIA19839' },
]

const SKY = new THREE.Color('#cdb4a0')
const NO_ROCKS: Rock[] = []

// ---- 地形・岩を作る ---------------------------------------------------------------------------

type Built = { raw: Field; eroded: Field; ms: number; spot: { x: number; z: number; dx: number; dz: number } }

/**
 * ローバー目線のカメラを置く場所：崖らしい所の候補をいくつか選び、まわり 24 方向から
 * 「足もとが平ら」「崖まで見通せる（手前の丘で隠れない）」「太陽の側から見る（崖が日に照らされる）」
 * をいちばん満たす向きを選ぶ
 */
function findSpot(f: Field) {
  const sl = slopeGrid(f)
  const steep = new Float32Array(N * N)
  for (let k = 0; k < N * N; k++) steep[k] = sl[k] > 0.15 ? 1 : 0
  const mass = blurGrid(steep, 8)
  const half = SIZE / 2
  const slopeAt = (x: number, z: number) => {
    const i = Math.round((x + half) / CELL)
    const j = Math.round((z + half) / CELL)
    if (i < 0 || j < 0 || i >= N || j >= N) return 1
    return sl[j * N + i]
  }
  // 候補：崖の多い所を、互いに 25 m 以上離して 24 か所
  const cands: { x: number; z: number; v: number }[] = []
  for (let j = 0; j < N; j += 4)
    for (let i = 0; i < N; i += 4) {
      const x = i * CELL - half
      const z = j * CELL - half
      if (Math.hypot(x, z) > 110) continue
      cands.push({ x, z, v: mass[j * N + i] })
    }
  cands.sort((p, q) => q.v - p.v)
  const picks: typeof cands = []
  for (const c of cands) {
    if (picks.length >= 24) break
    if (picks.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 25)) picks.push(c)
  }
  const sunX = Math.sin((235 * Math.PI) / 180)
  const sunZ = Math.cos((235 * Math.PI) / 180)
  /** 目の高さ 1.9 m から、崖の 2 m 上まで見通せる割合 */
  const sight = (px: number, pz: number, tx: number, tz: number) => {
    const y0 = heightAt(f, px, pz) + 1.9
    const y1 = heightAt(f, tx, tz) + 2
    let ok = 0
    for (let k = 1; k < 20; k++) {
      const t = k / 20
      const y = heightAt(f, px + (tx - px) * t, pz + (tz - pz) * t)
      if (y < y0 + (y1 - y0) * t - 0.3) ok++
    }
    return ok / 19
  }
  let best = { x: 0, z: 0, dx: 1, dz: 0 }
  let top = -Infinity
  for (const c of picks)
    for (let a = 0; a < 24; a++) {
      const dx = Math.cos((a / 24) * Math.PI * 2)
      const dz = Math.sin((a / 24) * Math.PI * 2)
      const px = c.x + dx * 40
      const pz = c.z + dz * 40
      const qx = c.x + dx * 14 + dz * 4
      const qz = c.z + dz * 14 - dx * 4
      if (Math.abs(px) > half - 20 || Math.abs(pz) > half - 20) continue
      let flat = 0
      for (let k = 0; k < 8; k++) flat += slopeAt(px + Math.cos(k) * 5, pz + Math.sin(k) * 5)
      const score = c.v * 2 + sight(px, pz, c.x, c.z) * 3 + sight(qx, qz, c.x, c.z) * 2 - flat * 3 + (dx * sunX + dz * sunZ) * 1.2 - (heightAt(f, px, pz) - heightAt(f, c.x, c.z)) * 0.15
      if (score > top) {
        top = score
        best = { x: c.x, z: c.z, dx, dz }
      }
    }
  return best
}

function Ground({ field, rocks }: { field: Field; rocks: Rock[] }) {
  const material = useMemo(() => groundLabMaterial(), [])
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, N - 1, N - 1)
    g.rotateX(-Math.PI / 2)
    g.setAttribute('aFill', new THREE.Float32BufferAttribute(new Float32Array(N * N), 1))
    g.setAttribute('aRock', new THREE.Float32BufferAttribute(new Float32Array(N * N * 2), 2))
    return g
  }, [])
  useEffect(() => {
    const p = geo.attributes.position as THREE.BufferAttribute
    for (let k = 0; k < N * N; k++) p.setY(k, field.h[k])
    p.needsUpdate = true
    const a = geo.attributes.aFill as THREE.BufferAttribute
    ;(a.array as Float32Array).set(field.fill)
    a.needsUpdate = true
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
  }, [field, geo])
  useEffect(() => {
    // 岩の根元の暗さと、風下の砂の尾
    const { occ, tail } = rockContact(rocks)
    const r = geo.attributes.aRock as THREE.BufferAttribute
    const arr = r.array as Float32Array
    for (let k = 0; k < N * N; k++) {
      arr[k * 2] = occ[k]
      arr[k * 2 + 1] = tail[k]
    }
    r.needsUpdate = true
  }, [rocks, geo])
  return <mesh geometry={geo} material={material} receiveShadow castShadow />
}

function Rocks({ rocks }: { rocks: Rock[] }) {
  const material = useMemo(() => rockLabMaterial(), [])
  const geos = useMemo(() => [0, 1, 2, 3].map((i) => labRockGeometry(31 + i * 17, i === 1)), [])
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  const groups = useMemo(() => [0, 1, 2, 3].map((v) => rocks.filter((r) => r.v === v)), [rocks])
  useEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const qy = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const n = new THREE.Vector3()
    const c = new THREE.Color()
    const base = new THREE.Color('#4e423b')
    const slab = new THREE.Color('#b09478')
    groups.forEach((list, v) => {
      const mesh = refs.current[v]
      if (!mesh) return
      list.forEach((r, i) => {
        n.set(r.nx, 1, r.nz).normalize()
        q.setFromUnitVectors(up, n)
        qy.setFromAxisAngle(up, r.yaw)
        q.multiply(qy)
        m.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(r.s, r.s * r.sy, r.s * (0.8 + 0.2 * r.tone)))
        mesh.setMatrixAt(i, m)
        mesh.setColorAt(i, c.copy(r.kind === 1 ? slab : base).multiplyScalar(r.tone))
      })
      mesh.count = list.length
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    })
  }, [groups])
  return (
    <>
      {groups.map((list, v) => (
        <instancedMesh
          key={`${v}-${list.length}`}
          ref={(el) => {
            refs.current[v] = el
          }}
          args={[geos[v], material, Math.max(1, list.length)]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  )
}

// ---- 光とカメラ -----------------------------------------------------------------------------

function Sun({ target }: { target: React.RefObject<OrbitControlsImpl | null> }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const el = useTerrainLab((s) => s.sunEl)
  const az = useTerrainLab((s) => s.sunAz)
  useFrame(({ camera }) => {
    const l = light.current
    if (!l) return
    // 影はカメラの見ている辺りだけ（細かく）
    const t = target.current?.target ?? new THREE.Vector3()
    const focus = new THREE.Vector3().copy(t).lerp(camera.position, 0.35)
    const e = (el * Math.PI) / 180
    const a = (az * Math.PI) / 180
    const dir = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a))
    l.position.copy(focus).addScaledVector(dir, 300)
    l.target.position.copy(focus)
    l.target.updateMatrixWorld()
  })
  useEffect(() => {
    const l = light.current
    if (!l) return
    const c = l.shadow.camera
    c.left = -90
    c.right = 90
    c.top = 90
    c.bottom = -90
    c.near = 10
    c.far = 700
    c.updateProjectionMatrix()
    l.shadow.bias = -0.0004
    l.shadow.normalBias = 0.25
  }, [])
  return (
    <>
      <directionalLight ref={light} intensity={3.1} color="#fff1de" castShadow shadow-mapSize={[2048, 2048]} />
      <hemisphereLight args={['#d9b597', '#5a3a28', 0.8]} />
    </>
  )
}

function CameraRig({ built, field, controls }: { built: Built; field: Field; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const cam = useTerrainLab((s) => s.cam)
  const { camera } = useThree()
  useEffect(() => {
    const c = controls.current
    if (!c || cam === 'free') return
    const { x, z, dx, dz } = built.spot
    if (cam === 'rover') {
      const px = x + dx * 40
      const pz = z + dz * 40
      camera.position.set(px, heightAt(field, px, pz) + 1.9, pz)
      c.target.set(x, heightAt(field, x, z) + 2, z)
    } else if (cam === 'cliff') {
      const px = x + dx * 14 + dz * 4
      const pz = z + dz * 14 - dx * 4
      camera.position.set(px, heightAt(field, px, pz) + 1.7, pz)
      c.target.set(x, heightAt(field, x, z) + 3, z)
    } else if (cam === 'oblique') {
      const px = x + dx * 120 + dz * 50
      const pz = z + dz * 120 - dx * 50
      camera.position.set(px, heightAt(field, px, pz) + 55, pz)
      c.target.set(x, heightAt(field, x, z), z)
    } else {
      camera.position.set(x + 0.01, heightAt(field, x, z) + 230, z)
      c.target.set(x, heightAt(field, x, z), z)
    }
    c.update()
  }, [cam, built, field, camera, controls])
  return null
}

function Fps({ onFps }: { onFps: (v: number) => void }) {
  const acc = useRef({ t: 0, n: 0 })
  useFrame((_, dt) => {
    acc.current.t += dt
    acc.current.n++
    if (acc.current.t > 1) {
      onFps(Math.round(acc.current.n / acc.current.t))
      acc.current = { t: 0, n: 0 }
    }
  })
  return null
}

function Scene({ built, setFps }: { built: Built; setFps: (v: number) => void }) {
  const st = useTerrainLab()
  const controls = useRef<OrbitControlsImpl>(null)
  const field = st.erode ? built.eroded : built.raw
  const rocks = useMemo(() => {
    const { x, z, dx, dz } = built.spot
    const avoid = [
      { x: x + dx * 40, z: z + dz * 40 },
      { x: x + dx * 14 + dz * 4, z: z + dz * 14 - dx * 4 },
    ]
    return st.rocks === 0 ? [] : st.rocks === 1 ? scatterRocks(field, avoid) : ruleRocks(field, avoid)
  }, [st.rocks, field, built])
  useEffect(() => {
    labUniforms.uTri.value = st.tri
    labUniforms.uBlend.value = st.blend
    labUniforms.uView.value = st.view
    labUniforms.uDustTop.value = st.rocks === 2 ? 1 : 0
  }, [st.tri, st.blend, st.view, st.rocks])
  const { scene } = useThree()
  useEffect(() => {
    scene.background = SKY
    scene.fog = new THREE.Fog(SKY, 140, 420)
  }, [scene])
  return (
    <>
      <Sun target={controls} />
      <Ground field={field} rocks={st.rocks === 2 ? rocks : NO_ROCKS} />
      <Rocks rocks={rocks} />
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.495} onStart={() => useTerrainLab.getState().cam !== 'free' && useTerrainLab.setState({ cam: 'free' })} />
      <CameraRig built={built} field={field} controls={controls} />
      <Fps onFps={setFps} />
    </>
  )
}

// ---- 画面 -------------------------------------------------------------------------------

function Seg<T extends string | number | boolean>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="tl-row">
      <span className="tl-label">{label}</span>
      <div className="tl-seg">
        {options.map(([v, text]) => (
          <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function Panel({ fps, ms }: { fps: number; ms: number }) {
  const st = useTerrainLab()
  const [open, setOpen] = useState(true)
  const isOld = st.tri === OLD.tri && st.blend === OLD.blend && st.erode === OLD.erode && st.rocks === OLD.rocks
  const isNew = st.tri === ALL_ON.tri && st.blend === ALL_ON.blend && st.erode === ALL_ON.erode && st.rocks === ALL_ON.rocks
  return (
    <div className={`tl-panel${open ? '' : ' closed'}`}>
      <div className="tl-head">
        <b>地形ラボ</b>
        <span className="tl-muted">
          {fps || '—'} fps · 地形 {ms} ms
        </span>
        <button className="tl-fold" onClick={() => setOpen(!open)}>
          {open ? '閉じる' : '開く'}
        </button>
      </div>
      {open && (
        <>
          <div className="tl-row tl-quick">
            <button className={isOld ? 'on' : ''} onClick={() => st.set(OLD)}>
              よくある作り方
            </button>
            <button className={isNew ? 'on' : ''} onClick={() => st.set(ALL_ON)}>
              全部オン
            </button>
          </div>
          <Seg label="斜面の貼り方" value={st.tri} options={[[0, '上から'], [1, 'トライプラナー']]} onChange={(tri) => st.set({ tri })} />
          <Seg label="塗り分け" value={st.blend} options={[[0, 'なし'], [1, 'ぼかし'], [2, '高さで切替']]} onChange={(blend) => st.set({ blend })} />
          <Seg label="浸食" value={st.erode} options={[[false, 'なし'], [true, 'あり']]} onChange={(erode) => st.set({ erode })} />
          <Seg label="岩の置き方" value={st.rocks} options={[[0, 'なし'], [1, 'ばらまき'], [2, '決まりどおり']]} onChange={(rocks) => st.set({ rocks })} />
          <Seg label="表示" value={st.view} options={[[0, '通常'], [1, '傾き白黒'], [2, '塗り分け色']]} onChange={(view) => st.set({ view })} />
          <Seg label="視点" value={st.cam} options={[['rover', 'ローバー目線'], ['cliff', '崖に寄る'], ['oblique', '見下ろし'], ['top', '真上']]} onChange={(cam) => st.set({ cam })} />
          <label className="tl-row">
            <span className="tl-label">太陽の高さ</span>
            <input type="range" min={3} max={80} step={1} value={st.sunEl} onChange={(e) => st.set({ sunEl: Number(e.target.value) })} />
            <b>{st.sunEl}°</b>
          </label>
          <label className="tl-row">
            <span className="tl-label">太陽の方位</span>
            <input type="range" min={0} max={360} step={1} value={st.sunAz} onChange={(e) => st.set({ sunAz: Number(e.target.value) })} />
            <b>{st.sunAz}°</b>
          </label>
          <div className="tl-row">
            <span className="tl-label">実写と比べる</span>
            <div className="tl-thumbs">
              {PHOTOS.map((p, i) => (
                <button key={p.src} className={st.photo === i ? 'on' : ''} onClick={() => st.set({ photo: st.photo === i ? null : i })} title={p.name}>
                  <img src={p.src} alt={p.name} />
                </button>
              ))}
            </div>
          </div>
          {st.view === 1 && <div className="tl-note">黒＝平ら、白＝60°以上。赤い線（約 32°）から上が岩肌、オレンジは岩。岩が崖と崖のふもとに集まっていれば正しい置き方です。</div>}
        </>
      )}
    </div>
  )
}

function Photo() {
  const photo = useTerrainLab((s) => s.photo)
  if (photo === null) return null
  const p = PHOTOS[photo]
  return (
    <div className="tl-photo" onClick={() => useTerrainLab.setState({ photo: null })}>
      <img src={p.src} alt={p.name} />
      <div>
        {p.name} · NASA/JPL-Caltech/MSSS（{p.id}）
      </div>
    </div>
  )
}

export default function TerrainLab() {
  const [built, setBuilt] = useState<Built | null>(null)
  const [fps, setFps] = useState(0)
  useEffect(() => {
    document.getElementById('boot')?.remove()
    // 画面に「計算中」を出してから、地形と浸食を計算する
    const t = window.setTimeout(() => {
      const f = buildFields()
      setBuilt({ ...f, spot: findSpot(f.eroded) })
    }, 60)
    return () => window.clearTimeout(t)
  }, [])
  useEffect(() => {
    // 確認・撮影用
    ;(window as unknown as { __terrainLab?: unknown }).__terrainLab = {
      set: (p: Partial<LabState>) => useTerrainLab.getState().set(p),
      ready: () => built !== null,
    }
  }, [built])
  return (
    <div className="tl-root">
      {built ? (
        <Canvas shadows dpr={[1, 2]} camera={{ fov: 55, near: 0.1, far: 2000, position: [60, 40, 60] }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <Scene built={built} setFps={setFps} />
        </Canvas>
      ) : (
        <div className="tl-loading">地形と浸食を計算中…</div>
      )}
      {built && <Panel fps={fps} ms={built.ms} />}
      <Photo />
    </div>
  )
}
