import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { Terrain } from './terrain'
import { ARM_STOW, WheelDust, applyPose, deployPose, type Rig } from './Rover'
import { PAINT_PARTS, paintUniforms, withPaint } from './paint'
import { windFor } from './landerFx'
import { RALLY_LINE } from '../../data/rallyCourse'
import { COUNT_SEC, RALLY_COLORS, loadBest, rallyNow, saveBest, setRallyPhase, useRally, type RallyEntry } from '../../state/rally'
import { roverCtl, roverInput, roverPose, useRover } from '../../state/rover'
import { lowMemory, useLevel } from '../../state/quality'
import { MAP_KEYS, shrinkTexture } from './shrinkTexture'

// 峡谷レースの場面：光の門、コンピューターが運転する 3 台のローバー、門の判定・順位・タイム。
// 自分のローバーは Rover.tsx がそのまま走らせ、ここからは roverCtl（置く・止める・色・押す）で動かす。

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

// ---- コース ---------------------------------------------------------------------------------

/** 門の数（最後がゴール） */
export const GATE_COUNT = 10
/** 門の幅の半分（m）。この内側を通ればくぐったことにする */
const GATE_HALF = 9
/** スタートの列：コースの何 m 先か、横の並び（m） */
const GRID_S = 45
const GRID_LANES = [-4.8, -1.6, 1.6, 4.8]
/** 自分は左から 2 番目 */
const PLAYER_SLOT = 1

export type Course = {
  /** 10 m ごとの点と、そこまでの道のり（m） */
  pts: THREE.Vector2[]
  len: number[]
  total: number
  /** 門：道のり、中心、進む向き */
  gates: { s: number; x: number; z: number; dx: number; dz: number }[]
  /** 点ごとの曲がり具合（1/m）と、左右どちらに曲がるか（+ は右） */
  curve: number[]
}

export function buildCourse(): Course {
  const pts = RALLY_LINE.map(([x, z]) => new THREE.Vector2(x, z))
  const len = [0]
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]))
  const total = len[len.length - 1]
  const curve = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 3)]
    const b = pts[i]
    const c = pts[Math.min(pts.length - 1, i + 3)]
    const ab = Math.atan2(b.y - a.y, b.x - a.x)
    const bc = Math.atan2(c.y - b.y, c.x - b.x)
    let d = bc - ab
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    const arc = Math.max(1, a.distanceTo(b) + b.distanceTo(c))
    return d / arc
  })
  const course: Course = { pts, len, total, gates: [], curve }
  for (let g = 1; g <= GATE_COUNT; g++) {
    // ゴールはコースの終わりの少し手前（地図の端に近すぎないように）
    const s = ((total - 15) * g) / GATE_COUNT
    const p = pointAt(course, s)
    course.gates.push({ s, x: p.x, z: p.z, dx: p.dx, dz: p.dz })
  }
  return course
}

const tmpP = { x: 0, z: 0, dx: 1, dz: 0, k: 0 }
/** 道のり s の点と向き（dx, dz：単位ベクトル）、曲がり具合 k */
export function pointAt(c: Course, s: number) {
  const n = c.pts.length
  const ss = THREE.MathUtils.clamp(s, 0, c.total)
  let i = Math.min(n - 2, Math.floor((ss / c.total) * (n - 1)))
  while (i > 0 && c.len[i] > ss) i--
  while (i < n - 2 && c.len[i + 1] < ss) i++
  const a = c.pts[i]
  const b = c.pts[i + 1]
  const seg = c.len[i + 1] - c.len[i] || 1
  const t = (ss - c.len[i]) / seg
  tmpP.x = a.x + (b.x - a.x) * t
  tmpP.z = a.y + (b.y - a.y) * t
  tmpP.dx = (b.x - a.x) / seg
  tmpP.dz = (b.y - a.y) / seg
  tmpP.k = c.curve[i] + (c.curve[i + 1] - c.curve[i]) * t
  return tmpP
}

/** (x, z) に近いコースの道のり。hint の近く（±300 m）だけ探す */
function progressOf(c: Course, x: number, z: number, hint: number) {
  const n = c.pts.length
  const i0 = Math.max(0, Math.floor(hint / 10) - 30)
  const i1 = Math.min(n - 2, Math.floor(hint / 10) + 30)
  let best = hint
  let bestD = Infinity
  for (let i = i0; i <= i1; i++) {
    const a = c.pts[i]
    const b = c.pts[i + 1]
    const ex = b.x - a.x
    const ez = b.y - a.y
    const l2 = ex * ex + ez * ez || 1
    const t = THREE.MathUtils.clamp(((x - a.x) * ex + (z - a.y) * ez) / l2, 0, 1)
    const px = a.x + ex * t - x
    const pz = a.y + ez * t - z
    const d = px * px + pz * pz
    if (d < bestD) {
      bestD = d
      best = c.len[i] + (c.len[i + 1] - c.len[i]) * t
    }
  }
  return { s: best, off: Math.sqrt(bestD) }
}

/** スタートの列の i 番目の場所と向き（heading） */
export function gridSlot(c: Course, i: number) {
  const p = pointAt(c, GRID_S)
  const lane = GRID_LANES[i]
  // 右手（進む向きを右に 90°）
  const x = p.x - p.dz * lane
  const z = p.z + p.dx * lane
  return { x, z, heading: Math.atan2(-p.dx, -p.dz) }
}

// ---- コンピューターのローバー ---------------------------------------------------------------

/** 性格：最高速（m/s）、曲がるときの横の加速度の上限（m/s²）、走る位置のくせ */
const TRAITS = [
  { top: 16.2, lat: 3.6, wide: 1, cut: 0, hop: 0 }, // 赤：直線は速いが、カーブで外にふくらむ
  { top: 15.0, lat: 5.2, wide: 0, cut: 0, hop: 0 }, // 青：慎重。カーブでも落とさない
  { top: 15.6, lat: 4.4, wide: 0, cut: 0, hop: 1 }, // 黄：よく跳ぶ（跳んでいるあいだは少し遅い）
  { top: 15.3, lat: 4.6, wide: 0, cut: 1, hop: 0 }, // 緑：カーブの内側を攻める
]
/** コンピューター全体の速さ（ふつう）。自分の最高速は 16.7 m/s */
const AI_SKILL = 0.93

type Bot = {
  color: number
  slot: number
  model: THREE.Object3D
  rig: Rig
  paint: ReturnType<typeof paintUniforms>
  s: number
  v: number
  lane: number
  laneGoal: number
  x: number
  z: number
  y: number
  vy: number
  heading: number
  pitch: number
  roll: number
  spin: number
  steer: number
  air: boolean
  hopT: number
  finish: number | null
}

export function Rally({ terrain, prepare, dustColor }: { terrain: Terrain; prepare: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial; dustColor: string }) {
  const phase = useRally((r) => r.phase)
  const color = useRally((r) => r.color)
  const roverPhase = useRover((r) => r.phase)
  const level = useLevel()
  const course = useMemo(() => buildCourse(), [])
  const g = 9.8 * terrain.def.gravity

  // 自分のローバーの色：このレース場では、いつも選んだ色に塗る
  useEffect(() => {
    roverCtl.paint = RALLY_COLORS[color].hex
    return () => {
      roverCtl.paint = null
    }
  }, [color])
  useEffect(() => {
    useRally.setState({ gates: GATE_COUNT })
    // 確認用（#debug）：次の門
    if (!location.hash.includes('debug')) return
    const w = window as unknown as { __rallyGate?: () => unknown; __rallyBots?: () => unknown }
    w.__rallyGate = () => course.gates[useRally.getState().gate]
    return () => {
      w.__rallyGate = undefined
    }
  }, [course])

  // ---- 門 ----
  const gateParts = useMemo(() => {
    const pillar = new THREE.CylinderGeometry(0.6, 0.6, 1, 12, 1, true)
    pillar.translate(0, 0.5, 0)
    const beam = new THREE.BoxGeometry(1, 0.8, 0.8)
    const mk = (c: THREE.Color, o: number) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    return {
      pillar,
      beam,
      next: mk(new THREE.Color(0.5, 1.6, 2.2), 0.75),
      later: mk(new THREE.Color(0.35, 0.7, 1.0), 0.4),
      goal: mk(new THREE.Color(2.2, 1.6, 0.5), 0.8),
      done: mk(new THREE.Color(0.4, 0.4, 0.4), 0.1),
    }
  }, [])
  useEffect(
    () => () => {
      gateParts.pillar.dispose()
      gateParts.beam.dispose()
      for (const m of [gateParts.next, gateParts.later, gateParts.goal, gateParts.done]) m.dispose()
    },
    [gateParts],
  )
  const gateObjs = useMemo(
    () =>
      course.gates.map((gt, i) => {
        const goal = i === course.gates.length - 1
        const H = goal ? 12 : 8
        const grp = new THREE.Group()
        // 左右の柱の足もと：それぞれの地面の高さに
        const rx = -gt.dz
        const rz = gt.dx
        const meshes: THREE.Mesh[] = []
        const yl = terrain.height(gt.x - rx * GATE_HALF, gt.z - rz * GATE_HALF)
        const yr = terrain.height(gt.x + rx * GATE_HALF, gt.z + rz * GATE_HALF)
        for (const [side, y] of [
          [-1, yl],
          [1, yr],
        ] as const) {
          const m = new THREE.Mesh(gateParts.pillar, gateParts.later)
          m.position.set(gt.x + rx * GATE_HALF * side, y - 1, gt.z + rz * GATE_HALF * side)
          m.scale.set(1, H + 1, 1)
          meshes.push(m)
          grp.add(m)
        }
        const top = Math.max(yl, yr) + H
        const b = new THREE.Mesh(gateParts.beam, gateParts.later)
        b.position.set(gt.x, top, gt.z)
        b.scale.set(GATE_HALF * 2 + 0.7, 1, 1)
        b.rotation.y = Math.atan2(-rz, rx)
        meshes.push(b)
        grp.add(b)
        for (const m of meshes) {
          m.renderOrder = 3
          m.frustumCulled = false
        }
        return { grp, meshes, goal }
      }),
    [course, terrain, gateParts],
  )

  // ---- コンピューターのローバー 3 台 ----
  const { scene } = useGLTF(url('rover-orv7.glb'))
  const bots = useMemo(() => {
    const owned: { dispose: () => void }[] = []
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.7), toneMapped: false })
    owned.push(lamp)
    const list: Bot[] = []
    let slot = 0
    for (let c = 0; c < RALLY_COLORS.length; c++) {
      if (c === color) continue
      if (slot === PLAYER_SLOT) slot++
      const model = scene.clone(true)
      const paint = paintUniforms(RALLY_COLORS[c].hex)
      const mats = new Map<string, THREE.Material>()
      model.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        // 影は自分のローバーだけ（軽くするため）。ほかの 3 台は影を受けるだけ
        mesh.castShadow = level === 'high'
        mesh.receiveShadow = true
        const src = mesh.material as THREE.MeshStandardMaterial
        const full = PAINT_PARTS.has(mesh.name)
        const mk = src.uuid + (full ? ':full' : '')
        if (!mats.has(mk)) {
          if (src.name === 'Lamp') mats.set(mk, lamp)
          else {
            const m = src.clone()
            m.envMapIntensity = 1.15
            if (lowMemory()) {
              for (const key of MAP_KEYS) {
                const tex = m[key]
                if (!tex) continue
                const small = shrinkTexture(tex, 512)
                if (small) {
                  m[key] = small
                  owned.push(small)
                }
              }
            }
            prepare(withPaint(m, paint, full))
            owned.push(m)
            mats.set(mk, m)
          }
        }
        mesh.material = mats.get(mk)!
      })
      const get = (n: string) => model.getObjectByName(n)!
      const rig: Rig = {
        body: get('Body'),
        legs: Object.fromEntries(['FR', 'MR', 'RR', 'FL', 'ML', 'RL'].map((k) => [k, get('Leg_' + k)])),
        wheels: Object.fromEntries(['FR', 'MR', 'RR', 'FL', 'ML', 'RL'].map((k) => [k, get('Wheel_' + k)])),
        links: [get('Link_R'), get('Link_L')],
        panelsL: [get('Panel_L1'), get('Panel_L2')],
        panelsR: [get('Panel_R1'), get('Panel_R2')],
        mast: get('Mast'),
        head: get('Head'),
        antennas: [get('Antenna1'), get('Antenna2')],
        arm: [get('ArmYaw'), get('ArmUpper'), get('ArmFore'), get('ArmHand')],
      }
      for (const w of Object.values(rig.wheels)) w.rotation.order = 'YXZ'
      const pose = deployPose(1)
      pose.arm = [...ARM_STOW]
      applyPose(rig, pose)
      list.push({
        color: c, slot, model, rig, paint, s: GRID_S, v: 0, lane: GRID_LANES[slot], laneGoal: GRID_LANES[slot],
        x: 0, z: 0, y: 0, vy: 0, heading: 0, pitch: 0, roll: 0, spin: 0, steer: 0, air: false, hopT: 3 + slot, finish: null,
      })
      slot++
    }
    return { list, owned }
  }, [scene, color, prepare, level])
  useEffect(() => () => bots.owned.forEach((m) => m.dispose()), [bots])

  const dust = useMemo(
    () => new WheelDust(level === 'high' ? 360 : level === 'medium' ? 220 : 90, new THREE.Color(dustColor), !!terrain.def.sky, terrain.def.gravity, windFor(terrain.def.id, !!terrain.def.sky)),
    [dustColor, level, terrain],
  )
  useEffect(() => () => dust.dispose(), [dust])

  // ---- レースの進み ----
  const run = useRef({ start: 0, prog: GRID_S, lastGate: -1, splits: [] as number[], hud: 0, placed: false })

  const placeBots = () => {
    for (const b of bots.list) {
      const p = gridSlot(course, b.slot)
      Object.assign(b, { s: GRID_S, v: 0, lane: GRID_LANES[b.slot], laneGoal: GRID_LANES[b.slot], x: p.x, z: p.z, heading: p.heading, vy: 0, air: false, finish: null, hopT: 3 + b.slot * 1.7 })
      b.y = terrain.height(p.x, p.z)
    }
  }

  /** 自分のローバーをスタートの列へ */
  const toGrid = () => {
    const p = gridSlot(course, PLAYER_SLOT)
    roverCtl.place?.(p.x, p.z, p.heading)
    roverCtl.locked = true
    placeBots()
    run.current = { start: 0, prog: GRID_S, lastGate: -1, splits: [], hud: 0, placed: true }
    useRally.setState({ gate: 0, time: 0, place: 1, split: null, result: null, lost: false })
    setRallyPhase('count')
  }

  // ローバーが走れるようになったら（展開が終わったら）、スタートの列へ
  useEffect(() => {
    if (phase === 'deploy' && roverPhase === 'drive') toGrid()
    if (phase === 'off' || roverPhase === 'none') roverCtl.locked = false
    if (roverPhase === 'none' && phase !== 'off') setRallyPhase('off')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roverPhase])
  useEffect(
    () => () => {
      roverCtl.locked = false
      useRally.setState({ phase: 'off' })
    },
    [],
  )

  /** 直前の門（まだなければスタート）へ戻る */
  const backToGate = () => {
    const r = run.current
    const s = r.lastGate >= 0 ? course.gates[r.lastGate].s : GRID_S
    const p = pointAt(course, s + 2)
    roverCtl.place?.(p.x, p.z, Math.atan2(-p.dx, -p.dz))
    r.prog = s + 2
    useRally.setState({ lost: false })
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = useRally.getState()
    const active = st.phase === 'count' || st.phase === 'run' || st.phase === 'done'
    for (const o of gateObjs) o.grp.visible = st.phase !== 'off'
    for (const b of bots.list) b.model.visible = active
    if (st.phase === 'off' || st.phase === 'deploy') {
      roverInput.reset = false
      dust.update(dt)
      return
    }
    const now = rallyNow()
    const r = run.current
    // スタート：3・2・1 のあと
    if (st.phase === 'count') {
      roverCtl.locked = true
      if (now - st.since >= COUNT_SEC) {
        roverCtl.locked = false
        r.start = now
        setRallyPhase('run')
      }
    }
    const running = st.phase === 'run'
    const t = running || st.phase === 'done' ? now - r.start : 0
    const moving = running || st.phase === 'done'

    // ---- 自分 ----
    const me = roverPose
    r.prog = progressOf(course, me.x, me.z, r.prog).s
    if (roverInput.reset) {
      roverInput.reset = false
      if (running) backToGate()
    }
    let gate = st.gate
    if (running && gate < course.gates.length) {
      const gt = course.gates[gate]
      // 門の面（進む向きに垂直）を横切ったか：門の中心から前後 6 m・左右 GATE_HALF の箱に入ったら
      const ex = me.x - gt.x
      const ez = me.z - gt.z
      const along = ex * gt.dx + ez * gt.dz
      const side = -ex * gt.dz + ez * gt.dx
      if (Math.abs(along) < 6 && Math.abs(side) < GATE_HALF + 0.5) {
        r.splits[gate] = t
        r.lastGate = gate
        const best = loadBest()
        const diff = best?.splits[gate] !== undefined ? t - best.splits[gate] : null
        gate++
        useRally.setState({ gate, split: { gate, time: t, diff, at: now }, lost: false })
        if (gate === course.gates.length) finish(t)
      } else {
        // 門の横を通りすぎた（40 m 以上先へ行った）：戻るように案内
        const lost = r.prog > gt.s + 40
        if (lost !== st.lost) useRally.setState({ lost })
      }
    }

    // ---- コンピューター ----
    const k = AI_SKILL
    for (const b of bots.list) {
      if (b.finish === null && moving) {
        const tr = TRAITS[b.color]
        // 先のカーブ（40 m 先まで）を見て、出せる速さを決める
        let target = tr.top * k
        for (let a = 0; a <= 40; a += 10) {
          const p = pointAt(course, b.s + a)
          const curv = Math.abs(p.k)
          if (curv > 1e-4) target = Math.min(target, Math.sqrt((tr.lat * k) / curv) + a * 0.08)
        }
        // 坂：登りは遅い
        const hA = terrain.height(pointAt(course, b.s).x, tmpP.z)
        const hB = terrain.height(pointAt(course, b.s + 10).x, tmpP.z)
        const grade = (hB - hA) / 10
        target *= 1 - THREE.MathUtils.clamp(grade * 1.1, -0.08, 0.3)
        // 自分と離れすぎない（前に行きすぎたら少しゆっくり、後ろすぎたら少し速く）
        const gap = b.s - r.prog
        if (gap > 70) target *= 0.9
        else if (gap < -90) target *= 1.06
        if (b.air) target = b.v
        const acc = target > b.v ? 3.6 * Math.max(0.2, 1 - b.v / 18) * 2 : -5
        b.v += THREE.MathUtils.clamp(target - b.v, -Math.abs(acc) * dt, Math.abs(acc) * dt)
        b.s += b.v * dt
        // 走る位置：カーブで外にふくらむ・内側を攻める・ゆるくふらつく
        const p = pointAt(course, b.s + 8)
        let goal = GRID_LANES[b.slot] * Math.max(0.25, 1 - (b.s - GRID_S) / 300)
        goal += Math.sin(b.s / 37 + b.slot * 2) * 1.2
        goal += (tr.wide * 3.5 - tr.cut * 4) * THREE.MathUtils.clamp(-p.k * 40, -1, 1)
        b.laneGoal = THREE.MathUtils.clamp(goal, -6, 6)
        b.lane += (b.laneGoal - b.lane) * Math.min(1, dt * 0.8)
        if (b.s >= course.gates[course.gates.length - 1].s) b.finish = t
        // ジャンプ好き：ときどき跳ぶ
        if (tr.hop && !b.air) {
          b.hopT -= dt
          if (b.hopT < 0) {
            b.vy = 3.4 + b.v * 0.08
            b.air = true
            b.hopT = 4 + Math.random() * 4
          }
        }
      } else if (b.finish !== null) {
        b.v = Math.max(0, b.v - 4 * dt)
        b.s += b.v * dt
      }
      // 位置と向き
      const p = pointAt(course, b.s)
      const nx = p.x - p.dz * b.lane
      const nz = p.z + p.dx * b.lane
      const moved = Math.hypot(nx - b.x, nz - b.z)
      if (moved > 0.02) {
        const h = Math.atan2(-(nx - b.x), -(nz - b.z))
        let dh = h - b.heading
        while (dh > Math.PI) dh -= Math.PI * 2
        while (dh < -Math.PI) dh += Math.PI * 2
        b.heading += dh * Math.min(1, dt * 8)
        b.steer += (THREE.MathUtils.clamp(-dh * 6, -1, 1) - b.steer) * Math.min(1, dt * 5)
      }
      b.x = nx
      b.z = nz
      // 自分とぶつかる：押し合う
      const ex = me.x - b.x
      const ez = me.z - b.z
      const d = Math.hypot(ex, ez)
      if (d < 1.9 && d > 1e-3 && st.phase !== 'count') {
        const o = (1.9 - d) / d
        roverCtl.push.x += ex * o * 0.6
        roverCtl.push.z += ez * o * 0.6
        b.lane -= (-ex * p.dz + ez * p.dx) / d * (1.9 - d) * 0.4
      }
      // 縦：地面に沿う。坂の頂上や跳んだときは宙に
      const ground = terrain.height(b.x, b.z)
      if (b.air || b.y > ground + 0.03) {
        b.vy -= g * dt
        b.y += b.vy * dt
        if (b.y <= ground) {
          b.y = ground
          b.vy = 0
          if (b.air) for (let i = 0; i < 8; i++) dust.puff(b.x, ground, b.z, (Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 3, 0.6)
          b.air = false
        }
      } else {
        const gv = (ground - b.y) / Math.max(dt, 1e-3)
        // 下り坂の頂上で、地面が落ちていく速さより遅ければ飛び出す
        if (gv < -6 && b.v > 8) {
          b.air = true
          b.vy = Math.min(0, b.vy)
        } else {
          b.y = ground
          b.vy = gv
        }
      }
      // 傾き：前後と左右の地面の高さ
      const fx = -Math.sin(b.heading)
      const fz = -Math.cos(b.heading)
      if (!b.air) {
        const hF = terrain.height(b.x + fx * 0.72, b.z + fz * 0.72)
        const hBk = terrain.height(b.x - fx * 0.72, b.z - fz * 0.72)
        const hR = terrain.height(b.x - fz * 0.5, b.z + fx * 0.5)
        const hL = terrain.height(b.x + fz * 0.5, b.z - fx * 0.5)
        const kk = Math.min(1, dt * 10)
        b.pitch += (Math.atan2(hF - hBk, 1.44) - b.pitch) * kk
        b.roll += (Math.atan2(hR - hL, 1.0) - b.roll) * kk
      } else b.pitch += (Math.min(0.25, Math.max(-0.35, b.vy * 0.04)) - b.pitch) * Math.min(1, dt * 1.2)
      b.spin -= (b.v * dt) / 0.2
      b.model.position.set(b.x, b.y, b.z)
      b.model.rotation.set(b.pitch, b.heading, b.roll, 'YXZ')
      for (const key of Object.keys(b.rig.wheels)) {
        const w = b.rig.wheels[key]
        w.rotation.x = b.spin
        w.rotation.y = key[0] === 'F' ? -b.steer * 0.35 : key[0] === 'R' ? b.steer * 0.35 : 0
      }
      // 砂ぼこり
      if (!b.air && b.v > 2 && terrain.def.dust) {
        const kv = Math.min(1, b.v / 16.7)
        const n = Math.floor(dt * (level === 'low' ? 14 : 36) * kv + Math.random())
        for (let i = 0; i < n; i++) {
          const sd = Math.random() < 0.5 ? 0.5 : -0.5
          dust.puff(b.x - fz * sd - fx * 0.72, ground, b.z + fx * sd - fz * 0.72, -fx * b.v * 0.25, 0.6 + kv * 1.6, -fz * b.v * 0.25, 0.35 + kv * 0.6)
        }
      }
    }
    dust.update(dt)

    // ---- 門の見た目：次の門は明るく、くぐった門は消す ----
    gateObjs.forEach((o, i) => {
      const passed = i < gate
      const mat = passed ? gateParts.done : i === gate ? (o.goal ? gateParts.goal : gateParts.next) : o.goal ? gateParts.goal : gateParts.later
      o.grp.visible = !passed
      for (const m of o.meshes) if (m.material !== mat) m.material = mat
    })
    gateParts.next.opacity = 0.55 + 0.25 * Math.sin(now * 5)

    // ---- 表示：1 秒に 10 回 ----
    r.hud += dt
    if (r.hud > 0.25 && !running) {
      r.hud = 0
      useRally.setState({ bots: bots.list.map((b) => ({ c: b.color, x: b.x, z: b.z })) })
    }
    if (r.hud > 0.1 && running) {
      r.hud = 0
      let place = 1
      for (const b of bots.list) if (b.finish !== null || b.s > r.prog) place++
      const gt = course.gates[Math.min(gate, course.gates.length - 1)]
      const fx = -Math.sin(me.heading)
      const fz = -Math.cos(me.heading)
      const ex = gt.x - me.x
      const ez = gt.z - me.z
      const rel = (Math.atan2(ex * -fz + ez * fx, ex * fx + ez * fz) * 180) / Math.PI
      useRally.setState({ time: t, place, toGate: { dist: Math.round(Math.hypot(ex, ez)), rel: Math.round(rel) }, bots: bots.list.map((b) => ({ c: b.color, x: b.x, z: b.z })) })
    }
  })

  /** ゴール：順位と記録 */
  function finish(t: number) {
    const r = run.current
    const best = loadBest()
    const newBest = !best || t < best.time
    if (newBest) saveBest({ time: t, splits: [...r.splits] })
    const order: RallyEntry[] = [{ color: useRally.getState().color, time: t, you: true }]
    for (const b of bots.list) {
      // まだ走っている車は、今の速さで残りを走った時刻（見込み）
      const est = b.finish ?? t + Math.max(0, course.gates[course.gates.length - 1].s - b.s) / Math.max(8, b.v)
      order.push({ color: b.color, time: est, you: false })
    }
    order.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9))
    const place = order.findIndex((e) => e.you) + 1
    useRally.setState({ result: { time: t, place, best: newBest ? t : best!.time, newBest, order }, toGate: null, place })
    setRallyPhase('done')
  }

  return (
    <>
      {gateObjs.map((o, i) => (
        <primitive key={i} object={o.grp} />
      ))}
      {bots.list.map((b) => (
        <primitive key={b.color} object={b.model} />
      ))}
      <primitive object={dust.points} />
    </>
  )
}
