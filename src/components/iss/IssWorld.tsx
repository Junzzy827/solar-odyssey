import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { lowMemory } from '../../state/quality'
import { isTouchDevice } from '../../state/input'
import { enterModule, issDebug, issInput, playSpot, SPOT_MODULE, useIss } from '../../state/iss'
import { TexPool, texPoolRef } from './texManager'
import { FloatController, type FloatFunnel } from './floatControl'
import { IssEarth, type IssWindow } from './IssEarth'
import { WaterBall } from './WaterBall'
import { Drifters } from './Drifters'
import { setIssAmbience } from './issAudio'
import { setAnchor, spotAnchors } from './anchors'
import { loadModule, type LoadedModule } from './moduleLoader'
import { ModuleStreamer, type StreamPlan } from './moduleStreamer'
import { loadStation, setStationNow, type Station, type StationModule, type Vec3 } from './station'
import { filmPose, type FilmPath, makeFilmPath } from './film'

// ISS の中。座標は m、原点はノード 1 の真ん中、+Y が天頂、−Z が前（tools/iss/README.md）。
// 段階 2：12 の部屋（モジュール）を、いる部屋とその近くだけ読む（moduleStreamer.ts が決め、moduleLoader.ts が読む）。
// - まだ読めていない部屋への口には、暗い幕（さわると止まる）を置く。読めたら幕を外して部屋を出す（穴は見せない）
// - 当たり判定は、見えている部屋の形を全部使う（口をまたいで、となりの部屋の壁へそのまま滑って移る）
// - 部屋は Blender で焼いた光（ライトマップ）× 色の絵だけで描く（MeshBasic、照明の計算なし）
// - 窓の外の地球は別のシーンで、窓の形の型（ステンシル）の中だけに描く（IssEarth.tsx）

/**
 * デスティニーの印の場所（three の座標、m）。本物の窓は WORF のくぼみの底（y −2.1）にあるが、くぼみの中は焼いた光が届かず真っ黒で、
 * 部屋からは手前の金具に隠れて地球が見えない。そこで地球を見せる型は、床の穴（床の面 y −1.10〜−1.13、穴の半径 約 0.3 m）の
 * すぐ下に置く。型は穴より大きくてよい（穴の外は床が手前にあって隠す）
 */
export const WINDOW_AT = new THREE.Vector3(0.02, -1.145, -6.85)
export const WINDOW_R = 0.45
const WATER_AT = new THREE.Vector3(0.25, 0.15, -4.3)
/** 自転車に乗ったときの目：クランクの軸から（上へ 0.8 m、後ろ +Z へ 0.3 m）と、見おろす角 */
const RIDE_EYE = new THREE.Vector3(0, 0.8, 0.3)
const RIDE_PITCH = -1.0
/** デスティニーに入ったときの場所と向き（後ろのハッチの前から、前を見る） */
const LAB_START: [number, number, number, number, number] = [0, 0.05, -2.75, 0, 0]

/** 漂う小物の場所（部屋の通り道のまん中あたり） */
const DRIFT_SPOTS: Record<string, [number, number, number][]> = {
  us_lab: [
    [-0.35, 0.35, -3.6],
    [0.45, -0.25, -5.2],
    [-0.2, 0.55, -6.2],
    [0.3, 0.4, -7.9],
    [-0.45, -0.3, -8.8],
    [0.15, -0.5, -9.6],
  ],
  node2: [
    [0.3, 0.3, -12.7],
    [-0.3, -0.2, -13.6],
    [0.25, 0.4, -14.3],
    [-0.2, 0.15, -15.7],
  ],
  jpm: [
    [-4.6, 0.4, -15.2],
    [-6.8, -0.2, -14.8],
    [-8.6, 0.5, -15.3],
  ],
}

type Entry = { id: string; mod: LoadedModule | null; shown: boolean; cancel: boolean; failed: boolean }
/** 読めなかった部屋は、しばらく読み直さない（秒） */
const RETRY_AFTER = 20

const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _ray = new THREE.Ray()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')

/** 名札を画面に置く：カメラの後ろ・遠すぎ・壁のかげは隠す */
function placeAnchors(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, bvhs: MeshBVH[]) {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  for (const a of spotAnchors.values()) {
    if (!a.el) continue
    const d = a.pos.distanceTo(camera.position)
    _v.copy(a.pos).project(camera)
    let hide = _v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05 || d > a.range
    if (!hide) {
      _ray.origin.copy(camera.position)
      _ray.direction.copy(a.pos).sub(camera.position).normalize()
      for (const bvh of bvhs) {
        const hit = bvh.raycastFirst(_ray, THREE.DoubleSide)
        if (hit && hit.distance < d - 0.12) {
          hide = true
          break
        }
      }
    }
    a.el.style.visibility = hide ? 'hidden' : 'visible'
    if (!hide) a.el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px)`
  }
}

/** 部屋に入ったときの場所と向き [x, y, z, yaw, pitch]：真ん中から、入ってきた口と反対の向きを見る */
export function startPose(station: Station, id: string): [number, number, number, number, number] {
  if (id === 'us_lab') return LAB_START
  const m = station.modules.find((x) => x.id === id)
  if (!m) return LAB_START
  const s = new ModuleStreamer(station.modules, id)
  const r = s.route('node1', id)
  const c = m.center
  // 入ってきた口（ノード 1 からの道の最後の口）→ 真ん中 の向き。ノード 1 は前（デスティニー）を見る
  const from = r.via.length ? r.via[r.via.length - 1] : ([c[0], c[1], c[2] + 1] as Vec3)
  const dx = c[0] - from[0]
  const dz = c[2] - from[2]
  const yaw = Math.hypot(dx, dz) > 0.3 ? Math.atan2(-dx, -dz) : 0
  return [c[0], c[1], c[2], yaw, 0]
}

/** まだ読めていない部屋への口に置く幕（暗いグラデーションの角の丸い板） */
function makeCurtainMaterial() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 34)
  grad.addColorStop(0, '#3a4350')
  grad.addColorStop(1, '#151a21')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return { mat: new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, toneMapped: false }), tex: t }
}

function roundedSquare(size: number, r: number) {
  const s = size / 2
  const sh = new THREE.Shape()
  sh.moveTo(-s + r, -s)
  sh.lineTo(s - r, -s)
  sh.quadraticCurveTo(s, -s, s, -s + r)
  sh.lineTo(s, s - r)
  sh.quadraticCurveTo(s, s, s - r, s)
  sh.lineTo(-s + r, s)
  sh.quadraticCurveTo(-s, s, -s, s - r)
  sh.lineTo(-s, -s + r)
  sh.quadraticCurveTo(-s, -s, -s + r, -s)
  return new THREE.ShapeGeometry(sh, 4)
}

type Curtain = { key: string; mesh: THREE.Mesh; bvh: MeshBVH }

export function IssWorld() {
  const flips = useIss((s) => s.flips)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const [station, setStation] = useState<Station | null>(null)
  const [shown, setShown] = useState<LoadedModule[]>([])
  const phone = useMemo(() => lowMemory() || isTouchDevice(), [])
  const pool = useMemo(() => new TexPool(phone ? 2 : Math.min(8, gl.capabilities.getMaxAnisotropy())), [gl, phone])
  const ctrl = useMemo(() => new FloatController({ radius: 0.3 }), [])
  const world = useMemo(
    () => ({
      entries: new Map<string, Entry>(),
      group: new THREE.Group(),
      curtains: new Map<string, Curtain>(),
      curtainMat: makeCurtainMaterial(),
      curtainGeo: roundedSquare(1.36, 0.22),
      streamer: null as ModuleStreamer | null,
      plan: null as StreamPlan | null,
      nextPlan: 0,
      loading: false,
      lastFrame: 0,
      lastT: 0,
      busyUntil: 0,
      film: null as FilmPath | null,
      route: [] as THREE.Vector3[],
      routeFor: null as string | null,
      settledFrames: 0,
      filmT: -1,
      failedAt: new Map<string, number>(),
      /** 自転車に乗った時刻（乗っていないとき −1） */
      rideAt: -1,
    }),
    [],
  )

  // 全体の地図を読み、はじめの部屋の場所へ
  useEffect(() => {
    texPoolRef.current = pool
    let alive = true
    loadStation()
      .then((s) => {
        if (!alive) return
        setStationNow(s)
        const start = useIss.getState().start
        world.streamer = new ModuleStreamer(s.modules, start, phone ? { maxLoaded: 6 } : {})
        const [x, y, z, yaw, pitch] = startPose(s, start)
        ctrl.teleport(new THREE.Vector3(x, y, z))
        ctrl.yaw = yaw
        ctrl.pitch = pitch
        setStation(s)
      })
      .catch((e) => {
        console.error('[iss] station failed', e)
        if (alive) useIss.setState({ phase: 'none' })
      })
    return () => {
      alive = false
    }
  }, [pool, ctrl, world, phone])

  // 場面を閉じる：全部捨てる
  useEffect(
    () => () => {
      for (const e of world.entries.values()) {
        e.cancel = true
        e.mod?.dispose()
      }
      world.entries.clear()
      for (const c of world.curtains.values()) c.bvh.geometry.dispose()
      world.curtains.clear()
      world.curtainMat.mat.dispose()
      world.curtainMat.tex.dispose()
      world.curtainGeo.dispose()
      pool.dispose()
      if (texPoolRef.current === pool) texPoolRef.current = null
    },
    [world, pool],
  )

  // 宙返り
  useEffect(() => {
    if (flips > 0) ctrl.flip()
  }, [flips, ctrl])

  // はじめの部屋が見えたら、中へ（ひと呼吸おいて、絵が GPU に載ってから幕を上げる）
  const startShown = shown.some((m) => m.id === useIss.getState().start)
  useEffect(() => {
    if (!startShown) return
    const t = setTimeout(() => {
      useIss.setState({ phase: 'inside' })
      issDebug.loaded = true
    }, 300)
    setIssAmbience(true)
    return () => {
      clearTimeout(t)
      setIssAmbience(false)
    }
  }, [startShown])

  /** 見えている部屋が変わった：当たり判定・動ける範囲・口の手助け・幕 */
  const refresh = () => {
    const mods = [...world.entries.values()].filter((e) => e.shown && e.mod).map((e) => e.mod!)
    const ready = new Set(mods.map((m) => m.id))
    // 幕：見えている部屋の口のうち、先の部屋がまだのもの（2 つの部屋の口は同じ所なので、組で 1 枚）
    const need = new Map<string, { m: StationModule; h: StationModule['hatches'][number] }>()
    for (const m of mods) {
      for (const h of m.info.hatches) {
        if (!h.to || ready.has(h.to)) continue
        need.set([m.id, h.to].sort().join('|'), { m: m.info, h })
      }
    }
    for (const [key, c] of world.curtains) {
      if (need.has(key)) continue
      world.group.remove(c.mesh)
      c.bvh.geometry.dispose()
      world.curtains.delete(key)
    }
    for (const [key, { h }] of need) {
      if (world.curtains.has(key)) continue
      const mesh = new THREE.Mesh(world.curtainGeo, world.curtainMat.mat)
      const n = new THREE.Vector3(...h.normal)
      mesh.position.set(...h.center)
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
      mesh.name = `iss-curtain-${key}`
      mesh.updateMatrixWorld(true)
      world.group.add(mesh)
      const g = world.curtainGeo.clone().applyMatrix4(mesh.matrixWorld)
      world.curtains.set(key, { key, mesh, bvh: new MeshBVH(g) })
    }
    ctrl.setColliders([...mods.map((m) => ({ bvh: m.bvh })), ...[...world.curtains.values()].map((c) => ({ bvh: c.bvh }))])
    // 動ける範囲：見えている部屋の箱のあつまり（模型のすきまから外へ出ない）
    ctrl.setRegions(mods.map((m) => new THREE.Box3(new THREE.Vector3(...m.info.bboxMin), new THREE.Vector3(...m.info.bboxMax))))
    // 口の手助け：両がわの部屋が見えている口
    const funnels: FloatFunnel[] = []
    const seen = new Set<string>()
    for (const m of mods) {
      for (const h of m.info.hatches) {
        if (!h.to || !ready.has(h.to)) continue
        const key = [m.id, h.to].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        funnels.push({ center: new THREE.Vector3(...h.center), axis: new THREE.Vector3(...h.normal), r: 0.55, depth: 0.9 })
      }
    }
    ctrl.funnels = funnels
    setShown(mods)
    useIss.setState({ loaded: mods.map((m) => m.id) })
  }

  /** 読む・捨てる・段を変える（0.25 秒ごと） */
  const stream = (now: number) => {
    const s = world.streamer
    if (!s || !station) return
    const p = ctrl.pos
    const plan = s.update([p.x, p.y, p.z], now, world.entries.keys())
    world.plan = plan
    let changed = false
    for (const id of plan.drop) {
      const e = world.entries.get(id)
      if (!e) continue
      world.entries.delete(id)
      issDebug.stream.drops++
      if (e.mod) {
        if (e.shown) world.group.remove(e.mod.root)
        e.mod.dispose()
        changed = true
      } else e.cancel = true
    }
    for (const e of world.entries.values()) e.mod?.setTier(e.id === plan.current ? 0 : 1)
    // 1 つずつ読む（形・当たり判定。絵は TexPool が並べて読む）
    if (!world.loading) {
      // いる部屋が見えるまでは、となりを読みはじめない（はじめの部屋・飛んだ先の部屋を早く出す。読む量も少なく）
      const cur = world.entries.get(plan.current)
      const curShown = !!cur && (cur.shown || cur.failed)
      const next = (curShown ? plan.want : [plan.current]).find((id) => !world.entries.has(id) && !(now - (world.failedAt.get(id) ?? -1e9) < RETRY_AFTER))
      if (next) {
        const e: Entry = { id: next, mod: null, shown: false, cancel: false, failed: false }
        world.entries.set(next, e)
        world.loading = true
        world.busyUntil = now + 2
        issDebug.stream.loads++
        loadModule(station, next, pool, phone, next === plan.current ? 0 : 1)
          .then((m) => {
            if (e.cancel) m.dispose()
            else e.mod = m
          })
          .catch((err) => {
            console.error('[iss] module failed', next, err)
            e.failed = true
            world.failedAt.set(next, world.lastT)
          })
          .finally(() => {
            world.loading = false
          })
      }
    }
    if (changed) refresh()
    const st = useIss.getState()
    if (st.phase === 'inside' && plan.current !== st.module) enterModule(plan.current)
  }

  const crank = useRef<THREE.Group>(null)
  const pedalAngle = useRef(0)

  useFrame((state, dt) => {
    const nowMs = performance.now()
    const s = useIss.getState()
    const t = state.clock.elapsedTime
    world.lastT = t
    pool.tick(gl)
    issDebug.stream.maxUploadMs = Math.max(issDebug.stream.maxUploadMs, pool.maxUploadMs)
    // 読めた部屋を出す（絵が全部そろってから）
    let changed = false
    for (const e of world.entries.values()) {
      if (e.mod && !e.shown && e.mod.ready()) {
        e.shown = true
        world.group.add(e.mod.root)
        changed = true
        world.busyUntil = t + 1.5
      }
    }
    if (changed) refresh()
    if (t >= world.nextPlan) {
      world.nextPlan = t + 0.25
      stream(t)
    }
    // 部屋を読んでいるあいだの、いちばん長いコマ（はじめの部屋が出たあと）
    if (world.lastFrame && s.phase === 'inside' && (t < world.busyUntil || world.loading || pool.busy() > 0)) {
      issDebug.stream.maxFrameMs = Math.max(issDebug.stream.maxFrameMs, nowMs - world.lastFrame)
    }
    world.lastFrame = nowMs
    if (!station) return

    // 撮影：道にそって決めた時刻の場所・向き（当たり判定なし）
    const film = issDebug.film
    if (film && film.t >= 0) {
      if (!world.film) {
        world.film = makeFilmPath(station)
        issDebug.filmLength = { seconds: world.film.duration, meters: world.film.length }
      }
      if (film.t !== world.filmT) {
        world.filmT = film.t
        world.settledFrames = 0
      }
      const pose = filmPose(world.film, film.t)
      ctrl.teleport(pose.pos)
      ctrl.yaw = pose.yaw
      ctrl.pitch = pose.pitch
    } else {
      // 操作：キー（x・z・上下）とスティックを足す
      if (issDebug.goto) {
        const g = issDebug.goto
        issDebug.goto = null
        if (typeof g === 'string') {
          // その部屋の真ん中まで、口の手前・向こうを通って浮かんで行く
          const st = world.streamer
          const r = st?.route(st.current, g)
          const m = station.modules.find((x) => x.id === g)
          if (st && r && m && (r.rooms.length || g === st.current)) {
            const pts: THREE.Vector3[] = []
            let from = st.current
            for (let i = 0; i < r.via.length; i++) {
              const h = station.modules.find((x) => x.id === from)!.hatches.find((x) => x.to === r.rooms[i + 1])!
              const c = new THREE.Vector3(...h.center)
              const n = new THREE.Vector3(...h.normal)
              pts.push(c.clone().addScaledVector(n, -0.9), c.clone().addScaledVector(n, 0.9))
              from = r.rooms[i + 1]
            }
            pts.push(new THREE.Vector3(...m.center))
            world.route = pts
            world.routeFor = g
          }
        } else {
          const [x, y, z, yaw, pitch] = g
          ctrl.teleport(new THREE.Vector3(x, y, z))
          ctrl.yaw = yaw
          ctrl.pitch = pitch
          world.route = []
        }
        if (!s.moved) useIss.setState({ moved: true })
      }
      const dbg = issDebug.move
      const busy = s.spot === 'bike'
      let move = dbg
        ? { x: dbg[0], y: dbg[1], z: dbg[2] }
        : {
            x: THREE.MathUtils.clamp(issInput.x + issInput.stickX, -1, 1),
            y: (issInput.up ? 1 : 0) - (issInput.down ? 1 : 0),
            z: THREE.MathUtils.clamp(issInput.z - issInput.stickY, -1, 1),
          }
      const pushing = Math.abs(move.x) + Math.abs(move.y) + Math.abs(move.z) > 0.05
      if (pushing && !s.moved) useIss.setState({ moved: true })
      // 自分で動かしたら、自動の道はやめる
      if (pushing && !dbg) world.route = []
      if (world.route.length) {
        const target = world.route[0]
        const last = world.route.length === 1
        _v.copy(target).sub(ctrl.pos)
        const d = _v.length()
        if (d < (last ? 0.15 : 0.35)) {
          world.route.shift()
          if (!world.route.length) world.routeFor = null
        } else {
          // 向きを道へ向け、速さを直に合わせる（押すだけだと、宇宙ではすべって行きすぎる）。最後は近づくとゆるめる
          const yaw = Math.atan2(-_v.x, -_v.z)
          const pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z))
          const k = 1 - Math.exp(-dt * 4)
          ctrl.yaw += THREE.MathUtils.euclideanModulo(yaw - ctrl.yaw + Math.PI, Math.PI * 2) * k - Math.PI * k
          ctrl.pitch += (THREE.MathUtils.clamp(pitch, -1.4, 1.4) - ctrl.pitch) * k
          const sp = last ? Math.min(1, d * 0.9) : 1
          ctrl.vel.lerp(_w.copy(_v).multiplyScalar(sp / d), 1 - Math.exp(-dt * 3))
          move = { x: 0, y: 0, z: 0 }
        }
      }
      ctrl.look(issInput.lookX, issInput.lookY)
      issInput.lookX = 0
      issInput.lookY = 0
      const lab = world.entries.get(SPOT_MODULE)?.mod
      if (busy && lab) {
        // 自転車に乗っている：クランクの真上の少し後ろ（前 −Z を向いてこぐ）へ寄って、ペダルに合わせて少しゆれる。
        // 目は軸から 0.8 m 上（ひざを曲げて浮いている人の目の高さ。CEVIS には座る所がない）
        const c = lab.bikeCrank
        const b = lab.bikeBox
        const seat = c ? c.hub.clone().add(RIDE_EYE) : b.isEmpty() ? new THREE.Vector3(-0.3, -0.1, -7.4) : new THREE.Vector3(b.max.x + 0.32, b.max.y + 0.42, (b.min.z + b.max.z) / 2 + 0.05)
        pedalAngle.current += dt * Math.PI * 2 * 1.1
        seat.y += Math.sin(pedalAngle.current * 2) * 0.012
        ctrl.pos.lerp(seat, 1 - Math.exp(-dt * 3))
        ctrl.vel.set(0, 0, 0)
        if (world.rideAt < 0) world.rideAt = t
        if (c && t - world.rideAt < 1.5) {
          // 乗ったはじめだけ、前の下のペダルを見る向きへ（そのあとは自由に見回せる）
          const k = 1 - Math.exp(-dt * 4)
          ctrl.yaw += (THREE.MathUtils.euclideanModulo(-ctrl.yaw + Math.PI, Math.PI * 2) - Math.PI) * k
          ctrl.pitch += (RIDE_PITCH - ctrl.pitch) * k
        }
      } else {
        world.rideAt = -1
        if (s.spot === 'window' && !pushing) {
          // 窓へ：くぼみの真上へ寄って、下を向く
          const above = WINDOW_AT.clone().setY(-0.55)
          ctrl.pos.lerp(above, 1 - Math.exp(-dt * 1.6))
          ctrl.vel.multiplyScalar(0.9)
          ctrl.pitch += (-1.4 - ctrl.pitch) * (1 - Math.exp(-dt * 2))
        }
        pedalAngle.current += dt * 0.3
        ctrl.update(dt, move)
      }
    }
    if (crank.current) crank.current.rotation.x = (world.entries.get(SPOT_MODULE)?.mod?.bikeCrank?.angle ?? 0) - pedalAngle.current
    ctrl.apply(camera)
    camera.updateMatrixWorld()
    const p = issDebug.pose
    _e.setFromQuaternion(ctrl.quaternion(_q), 'YXZ')
    p.x = ctrl.pos.x
    p.y = ctrl.pos.y
    p.z = ctrl.pos.z
    p.yaw = ctrl.yaw
    p.pitch = ctrl.pitch
    p.speed = ctrl.vel.length()
    // 撮影：読みたい部屋が全部見えて、絵も載せ終わってから 2 コマ
    const plan = world.plan
    const allIn = !!plan && plan.want.every((id) => world.entries.get(id)?.shown || world.entries.get(id)?.failed)
    world.settledFrames = allIn && pool.busy() === 0 && !world.loading ? world.settledFrames + 1 : 0
    issDebug.settled = world.settledFrames >= 2
    placeAnchors(
      camera,
      state.gl.domElement,
      shown.map((m) => m.bvh),
    )
  })

  const lab = shown.find((m) => m.id === SPOT_MODULE) ?? null
  const cupola = shown.find((m) => m.id === 'cupola') ?? null

  // 外への口の札（「この先はロシアの区画」など）：見えている部屋の閉じた口の少し手前
  useEffect(() => {
    const ids: string[] = []
    for (const m of shown) {
      for (const h of m.info.hatches) {
        if (h.to) continue
        const n = new THREE.Vector3(...h.normal)
        const at = new THREE.Vector3(...h.center).addScaledVector(n, -0.45)
        // 床・天井の口は少し離し、壁の口は少し上へ（札が口の真ん中をふさがない）
        if (Math.abs(n.y) > 0.5) at.addScaledVector(n, -0.15)
        else at.y += 0.25
        setAnchor(`outer:${h.id}`, at, 3.2)
        ids.push(`outer:${h.id}`)
      }
    }
    // 部屋を捨てたら、その札は隠す（遠くへ）
    return () => {
      for (const id of ids) setAnchor(id, new THREE.Vector3(0, -100, 0), 0)
    }
  }, [shown])

  // 窓：デスティニーの床の窓（丸い型）とキューポラのガラス
  const labMask = useMemo(() => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(WINDOW_R, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilZPass: THREE.ReplaceStencilOp,
        side: THREE.DoubleSide,
      }),
    )
    m.position.copy(WINDOW_AT)
    m.renderOrder = 100
    m.name = 'iss-window-mask'
    return m
  }, [])
  useEffect(
    () => () => {
      labMask.geometry.dispose()
      ;(labMask.material as THREE.Material).dispose()
    },
    [labMask],
  )
  const windows = useMemo(() => {
    const list: IssWindow[] = []
    if (lab) list.push({ id: 'us_lab', sphere: new THREE.Sphere(WINDOW_AT.clone(), WINDOW_R) })
    if (cupola && cupola.windows.length) {
      const box = new THREE.Box3()
      for (const w of cupola.windows) box.expandByObject(w)
      list.push({ id: 'cupola', sphere: box.getBoundingSphere(new THREE.Sphere()) })
    }
    return list
  }, [lab, cupola])

  return (
    <>
      <primitive object={world.group} />
      {lab && <primitive object={labMask} />}
      {lab && <LabSpots lab={lab} ctrl={ctrl} crank={crank} />}
      {shown
        .filter((m) => DRIFT_SPOTS[m.id])
        .map((m) => (
          <Drifters key={m.id} ctrl={ctrl} bvh={m.bvh} spots={DRIFT_SPOTS[m.id]} />
        ))}
      <IssEarth windows={windows} />
    </>
  )
}

/** デスティニーの印：自転車のペダル・水の玉、印の名札の場所 */
function LabSpots({ lab, ctrl, crank }: { lab: LoadedModule; ctrl: FloatController; crank: RefObject<THREE.Group> }) {
  useEffect(() => {
    const bikeTop = lab.bikeBox.isEmpty() ? new THREE.Vector3(-0.7, -0.5, -7.4) : lab.bikeBox.getCenter(new THREE.Vector3()).setY(lab.bikeBox.max.y + 0.12)
    setAnchor('bike', bikeTop, 5)
    setAnchor('window', WINDOW_AT.clone().setY(-0.95), 5)
    return () => {
      // 部屋を捨てたら、名札は隠す（遠くへ）
      setAnchor('bike', new THREE.Vector3(0, -100, 0), 0)
      setAnchor('window', new THREE.Vector3(0, -100, 0), 0)
      setAnchor('water', new THREE.Vector3(0, -100, 0), 0)
    }
  }, [lab])
  // 自転こぎのペダル（模型のペダルは止まった形なので、消して、回るものをここで足す）。軸の場所と腕の長さは模型から測ったもの
  const c = lab.bikeCrank
  return (
    <>
      {c && (
        <group ref={crank} position={c.hub}>
          <Crank radius={c.radius} />
        </group>
      )}
      <WaterBall at={WATER_AT} ctrl={ctrl} onPoke={() => playSpot('water')} />
    </>
  )
}

/** クランクとペダル：体の両わき（軸から 15 cm）に腕が 2 本（反対向き）、先に外へ出たペダル（模型と同じ所） */
function Crank({ radius }: { radius: number }) {
  const parts = useMemo(() => {
    const metal = new THREE.MeshBasicMaterial({ color: '#5b6068', toneMapped: false })
    const black = new THREE.MeshBasicMaterial({ color: '#1d1f22', toneMapped: false })
    const arm = new THREE.BoxGeometry(0.02, radius + 0.03, 0.035).translate(0, radius / 2, 0)
    const axle = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 16).rotateZ(Math.PI / 2)
    const pedal = new THREE.BoxGeometry(0.12, 0.035, 0.09)
    return { metal, black, arm, axle, pedal }
  }, [radius])
  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => p.dispose())
    },
    [parts],
  )
  return (
    <>
      <mesh geometry={parts.axle} material={parts.metal} />
      <group position={[0.15, 0, 0]}>
        <mesh geometry={parts.arm} material={parts.metal} />
        <mesh geometry={parts.pedal} material={parts.black} position={[0.075, radius, 0]} />
      </group>
      <group position={[-0.15, 0, 0]} rotation={[Math.PI, 0, 0]}>
        <mesh geometry={parts.arm} material={parts.metal} />
        <mesh geometry={parts.pedal} material={parts.black} position={[-0.075, radius, 0]} />
      </group>
    </>
  )
}
