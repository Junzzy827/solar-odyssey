import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CubeModel } from '../cube/CubeModel'
import { bodies, markerOverride } from '../../state/registry'
import { flightControl, ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { RACE_TEXT, useRace } from '../../state/race'
import { playBeep } from '../../audio/sfx'

const GATE_RADIUS = 1.3
const GATE_SPACING = 22
const RIVAL_SPEED = 7
const BOOST = 1.7
const BOOST_SECONDS = 15
const MAX_GATES = 64
// 確認用：#raceauto（または #raceauto=速さ）で自機が自動で飛ぶ
const AUTO = location.hash.match(/raceauto(?:=(\d+))?/)
const AUTO_SPEED = Number(AUTO?.[1] ?? 8)
const UP = new THREE.Vector3(0, 1, 0)

type Gate = { pos: THREE.Vector3; normal: THREE.Vector3; u: number; event: 'jupiter' | 'swingby' | null }
type Course = { curve: THREE.CatmullRomCurve3; length: number; gates: Gate[] }

const world = (id: string) => {
  const b = bodies.get(id)
  if (!b) return null
  return { pos: b.object.getWorldPosition(new THREE.Vector3()), radius: b.radius }
}

const angleOf = (v: THREE.Vector3) => Math.atan2(v.z, v.x)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * 今の惑星の位置からコースを作る。
 * 火星 → 木星の横 → 土星の向こう側を回り込む弧（スイングバイ）→ 行きとは別の道すじで火星へ。
 */
function buildCourse(): Course | null {
  const mars = world('mars')
  const jup = world('jupiter')
  const sat = world('saturn')
  if (!mars || !jup || !sat) return null
  const M = mars.pos.clone().setY(0)
  const J = jup.pos.clone().setY(0)
  const S = sat.pos.clone().setY(0)

  const toJ = J.clone().sub(M).normalize()
  const side = new THREE.Vector3().crossVectors(UP, toJ)
  const start = M.clone().addScaledVector(toJ, mars.radius * 4 + 2)
  const jFly = J.clone().addScaledVector(side, jup.radius * 3.2).setY(1.5)

  // 土星のまわりの弧：入ってくる向きと、火星へ戻る向きのあいだを、向こう側を通って回る
  const R = sat.radius * 6 // 大きな船でも曲がり切れる半径
  const inAng = angleOf(jFly.clone().sub(S))
  const outAng = angleOf(M.clone().sub(S))
  const farAng = angleOf(S.clone().sub(M))
  const ccw = ((outAng - inAng) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  const cw = ccw - Math.PI * 2
  const midOf = (sweep: number) => inAng + sweep / 2
  const sweep = Math.abs(wrap(midOf(ccw) - farAng)) < Math.abs(wrap(midOf(cw) - farAng)) ? ccw : cw
  // 入口と出口は少し内側に寄せて、弧の大部分で土星のまわりを回る
  const arc: THREE.Vector3[] = []
  for (let i = 0; i <= 6; i++) {
    const a = inAng + sweep * (0.08 + 0.84 * (i / 6))
    arc.push(new THREE.Vector3(S.x + Math.cos(a) * R, -1 + Math.sin((i / 6) * Math.PI) * 2, S.z + Math.sin(a) * R))
  }
  const exit = arc[arc.length - 1]
  const back = M.clone().sub(exit)
  const backSide = new THREE.Vector3().crossVectors(UP, back).normalize()
  const backMid = exit.clone().lerp(M, 0.5)
  if (backSide.dot(jFly.clone().sub(backMid)) > 0) backSide.negate()
  backMid.addScaledVector(backSide, 14).setY(-2)
  const finish = M.clone().addScaledVector(back.clone().normalize().negate(), mars.radius * 4 + 2)

  const points = [start, start.clone().lerp(jFly, 0.5).setY(2.5), jFly, jFly.clone().lerp(arc[0], 0.5).setY(1), ...arc, backMid, finish.clone().lerp(backMid, 0.35), finish]
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  const length = curve.getLength()
  const n = THREE.MathUtils.clamp(Math.round(length / GATE_SPACING), 12, MAX_GATES)
  const gates: Gate[] = []
  for (let i = 0; i < n; i++) {
    const u = 0.004 + (0.996 * i) / (n - 1)
    gates.push({ pos: curve.getPointAt(u), normal: curve.getTangentAt(u), u, event: null })
  }
  const nearest = (p: THREE.Vector3) => gates.reduce((best, g, i) => (g.pos.distanceTo(p) < gates[best].pos.distanceTo(p) ? i : best), 0)
  gates[nearest(jFly)].event = 'jupiter'
  gates[nearest(arc[3])].event = 'swingby'
  return { curve, length, gates }
}

/** コース上の輪（ゲート）、薄い道すじ、ライバルの立方体船、進行の判定 */
export function Race() {
  const phase = useRace((s) => s.phase)
  const course = useRef<Course | null>(null)
  const gateMeshes = useRef<THREE.Mesh[]>([])
  const rival = useRef<THREE.Group>(null!)
  const run = useRef({ lastCount: 4, t: 0, prevSide: -1, boost: 0, rivalS: 0, rivalTime: null as number | null, rivalBoost: false, prevTimeScale: 1 })

  const gateGeometry = useMemo(() => new THREE.TorusGeometry(GATE_RADIUS, 0.035, 10, 64), [])
  const gateMaterials = useMemo(
    () => ({
      next: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 0.88, 0.3), toneMapped: false }),
      later: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.4, 0.14), transparent: true, opacity: 0.6, toneMapped: false }),
    }),
    [],
  )
  const pathMaterial = useMemo(
    () => new THREE.LineDashedMaterial({ color: new THREE.Color(1, 0.75, 0.3), dashSize: 0.8, gapSize: 0.7, transparent: true, opacity: 0.35, depthWrite: false }),
    [],
  )
  const line = useMemo(() => {
    const l = new THREE.Line(new THREE.BufferGeometry(), pathMaterial)
    l.frustumCulled = false
    l.visible = false
    return l
  }, [pathMaterial])

  // 開始：コースを作り、自機を最初の輪の手前に置いてカウントダウン
  useEffect(() => {
    const r = run.current
    const st = useStore.getState()
    if (phase === 'countdown') {
      const c = buildCourse()
      if (!c) {
        useRace.getState().stop()
        return
      }
      course.current = c
      useRace.getState().update({ gateCount: c.gates.length })
      line.geometry.dispose()
      line.geometry = new THREE.BufferGeometry().setFromPoints(c.curve.getSpacedPoints(800))
      line.computeLineDistances()

      const first = c.gates[0]
      ship.position.copy(first.pos).addScaledVector(first.normal, -4)
      ship.velocity.set(0, 0, 0)
      ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.position, first.pos.clone().addScaledVector(first.normal, 10), UP))
      flightControl.releaseHold = true
      flightControl.locked = true
      flightControl.speedScale = 1
      r.prevTimeScale = st.timeScale || 1
      st.setTimeScale(0) // レース中は惑星を止めて、コースがずれないようにする
      st.setAutopilot(false)
      st.setTarget(null)
      st.setMode('flight')
      st.setCameraMode('chase')
      r.lastCount = 4
      r.t = 0
      r.prevSide = -1
      r.boost = 0
      r.rivalS = 0
      r.rivalTime = null
      r.rivalBoost = false
      st.showToast(RACE_TEXT.start)
    }
    if (phase === 'idle' || phase === 'finished') {
      flightControl.locked = false
      flightControl.speedScale = 1
      markerOverride.object = null
      if (course.current) st.setTimeScale(r.prevTimeScale)
      if (phase === 'idle') course.current = null
    }
  }, [phase, line])

  useEffect(
    () => () => {
      gateGeometry.dispose()
      gateMaterials.next.dispose()
      gateMaterials.later.dispose()
      pathMaterial.dispose()
      line.geometry.dispose()
      markerOverride.object = null
    },
    [gateGeometry, gateMaterials, pathMaterial, line],
  )

  useFrame(({ clock }, rawDelta) => {
    const c = course.current
    const race = useRace.getState()
    const visible = c !== null && race.phase !== 'idle'
    line.visible = visible
    rival.current.visible = visible
    gateMeshes.current.forEach((m, i) => (m.visible = visible && c !== null && i < c.gates.length && i >= race.gate))
    if (!c || !visible) return
    const dt = Math.min(rawDelta, 0.05) // 自機（Ship）と同じ上限にそろえる
    const r = run.current

    // 輪の配置と色（次の輪は明るく脈打つ）
    c.gates.forEach((g, i) => {
      const m = gateMeshes.current[i]
      if (!m) return
      m.position.copy(g.pos)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), g.normal)
      const next = i === race.gate
      m.material = next ? gateMaterials.next : gateMaterials.later
      m.scale.setScalar(next ? 1 + 0.05 * Math.sin(clock.getElapsedTime() * 5) : 1)
    })
    markerOverride.object = race.phase === 'running' || race.phase === 'countdown' ? (gateMeshes.current[race.gate] ?? null) : null

    // ライバル：コースに沿って一定の速さで進み、土星のあとで加速する
    const swingU = c.gates.find((g) => g.event === 'swingby')?.u ?? 0.6
    if (race.phase === 'running' && r.rivalTime === null) {
      r.rivalS += dt * RIVAL_SPEED * (r.rivalBoost ? 1.5 : 1)
      if (!r.rivalBoost && r.rivalS / c.length > swingU) r.rivalBoost = true
      if (r.rivalS >= c.length) r.rivalTime = r.t
    }
    const ru = Math.min(1, r.rivalS / c.length)
    const side = new THREE.Vector3().crossVectors(UP, c.curve.getTangentAt(ru)).normalize()
    rival.current.position.copy(c.curve.getPointAt(ru)).addScaledVector(side, 3.2).addScaledVector(UP, 1.2)
    rival.current.rotation.y += dt * 0.3
    const rivalGate = c.gates.filter((g) => g.u * c.length <= r.rivalS).length

    if (race.phase === 'countdown') {
      const left = race.countdown - Math.min(rawDelta, 0.25)
      const count = Math.ceil(left)
      if (count < r.lastCount && count > 0) playBeep(520)
      r.lastCount = count
      if (left <= 0) {
        playBeep(1040)
        flightControl.locked = false
        race.update({ phase: 'running', countdown: 0 })
      } else race.update({ countdown: left })
      return
    }
    if (race.phase !== 'running') return

    r.t += dt
    if (AUTO) {
      const target = c.gates[race.gate].pos.clone().addScaledVector(c.gates[race.gate].normal, 1)
      const to = target.sub(ship.position)
      ship.velocity.copy(to.setLength(AUTO_SPEED * flightControl.speedScale))
      ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.position, ship.position.clone().add(ship.velocity), UP))
    }
    if (r.boost > 0) {
      r.boost -= dt
      if (r.boost <= 0) flightControl.speedScale = 1
    }

    // 次の輪をくぐったか：輪の面を手前から向こうへ横切り、そのとき輪の内側にいること
    const g = c.gates[race.gate]
    const rel = ship.position.clone().sub(g.pos)
    const sideNow = rel.dot(g.normal)
    const radial = rel.addScaledVector(g.normal, -sideNow).length()
    if (r.prevSide < 0 && sideNow >= 0 && radial < GATE_RADIUS * 1.25) {
      playBeep(880, 0.08)
      if (g.event === 'jupiter') useStore.getState().showToast(RACE_TEXT.jupiter)
      if (g.event === 'swingby') {
        useStore.getState().showToast(RACE_TEXT.swingby)
        flightControl.speedScale = BOOST
        r.boost = BOOST_SECONDS
        ship.velocity.multiplyScalar(BOOST)
        race.update({ boosted: true })
      }
      const next = race.gate + 1
      if (next >= c.gates.length) {
        race.update({ gate: next, rivalGate })
        race.finish(r.t, r.rivalTime)
        useStore.getState().showToast(RACE_TEXT.finish)
        return
      }
      r.prevSide = -1
      race.update({ gate: next, elapsed: r.t, rivalGate })
      return
    }
    // 輪から大きく離れて横を通り過ぎたら、もう一度手前から入り直す
    r.prevSide = sideNow < 0 || radial > GATE_RADIUS * 4 ? -1 : 1
    race.update({ elapsed: r.t, rivalGate })
  })

  return (
    <>
      <primitive object={line} />
      {Array.from({ length: MAX_GATES }, (_, i) => (
        <mesh
          key={i}
          ref={(m: THREE.Mesh | null) => {
            if (m) gateMeshes.current[i] = m
          }}
          geometry={gateGeometry}
          material={gateMaterials.later}
          visible={false}
          frustumCulled={false}
        />
      ))}
      <group ref={rival} visible={false} scale={0.7}>
        <CubeModel />
      </group>
    </>
  )
}
