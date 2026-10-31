import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BEAM_NODES, CRAFT_SECONDS, DEFLECT_HITS, DOCK_RANGE, DOCK_SECONDS, DOCK_SPEED, FLYBY_ALTITUDE, LANDER_SECONDS, LAUNCH_RANGE, MECH_ID, MISSIONS, ROCK_ID, type MissionStep } from '../../data/missions'
import { missionText, ui } from '../../i18n'
import { approachKind } from '../../data/approach'
import { beamTargets, bodies, markerOverride, registerBody, type BodyEntry } from '../../state/registry'
import { distanceToBody, ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { completeStep, launchCraft, missionSay, setCraftReady, setFraming, setProgress, useMission, type Framing } from '../../state/mission'
import { eclipseClock, useEclipse } from '../../state/eclipse'
import { shipScale } from '../../state/zoom'
import { asteroidGeometry } from '../asteroidShape'
import { WorkMech } from '../sf/WorkMech'
import { MECH_SIZE } from '../sf/ConstructionSite'

const ROCK_RADIUS = 0.3
/** ビームの当たり判定は見た目より大きく（スマホでも当てやすいように） */
const HIT_RADIUS = 0.9
/** 小惑星が地球へ近づく速さ（表示の単位／秒）と、止まる距離（地球の到着点からの余り） */
const DRIFT = 0.04
const UP = new THREE.Vector3(0, 1, 0)

/** そば：半径の3倍まで（ワープで着く位置が入るよう少し足す。state/proximity.ts と同じ考え方） */
const isNear = (distance: number, radius: number) => distance < radius * 3 + 1.5

/** 撮影の枠（画面の中心から、端までの割合。UI の枠と同じ大きさ） */
export const PHOTO_FRAME = 0.45

/** 時間をかけてこなす手順：条件を満たしているあいだだけ進み、外れたら止まる */
function advance(delta: number, seconds: number) {
  const m = useMission.getState()
  const p = Math.min(1, m.progress + Math.min(delta, 0.1) / seconds)
  if (p >= 1) completeStep()
  else setProgress(p)
}

const tp = new THREE.Vector3()
const bp = new THREE.Vector3()
const seg = new THREE.Vector3()

/** カメラから目標までのあいだに、ほかの天体（球）がはさまっていないか */
function hidden(camera: THREE.Camera, target: BodyEntry) {
  const from = camera.position
  seg.copy(tp).sub(from)
  const length = seg.length()
  seg.divideScalar(length)
  for (const body of bodies.values()) {
    if (body === target || approachKind(body.id) === 'object') continue
    body.object.getWorldPosition(bp)
    const along = bp.sub(from).dot(seg)
    if (along <= 0 || along >= length * 0.98) continue
    // 目標の天体の上にあるもの（月の都など）は、その天体の表面すれすれでも隠れていないとみなす
    const r = body.radius * 0.97
    if (bp.lengthSq() - along * along < r * r) return true
  }
  return false
}

/** 撮影：目標が画面の枠の中にあり、手前にあり、ほかの天体にかくれず、距離がちょうどよいか */
function framing(camera: THREE.Camera, def: MissionStep, entry: BodyEntry, distance: number): Framing {
  entry.object.getWorldPosition(tp)
  const [min, max] = def.frame ?? [0, 30]
  if (distance > entry.radius * max + 1) return 'far'
  if (distance < entry.radius * min) return 'near'
  const ndc = bp.copy(tp).project(camera)
  if (ndc.z > 1 || Math.abs(ndc.x) > PHOTO_FRAME || Math.abs(ndc.y) > PHOTO_FRAME) return 'out'
  return hidden(camera, entry) ? 'hidden' : 'ok'
}

/** 任務の手順が終わったかを毎フレーム調べる。小惑星の任務では小惑星と道すじを、入港では港の輪を描く */
export function MissionRunner() {
  const phase = useMission((m) => m.phase)
  const index = useMission((m) => m.index)
  const step = useMission((m) => m.step)
  const kind = phase === 'active' ? MISSIONS[index].steps[step]?.kind : undefined

  useFrame(({ camera }, delta) => {
    const m = useMission.getState()
    const st = useStore.getState()
    if (m.phase !== 'active' || st.warpPhase !== 'idle') return
    const def = MISSIONS[m.index].steps[m.step]
    if (def.kind === 'deflect' || def.kind === 'dock' || def.kind === 'beam') return
    if (def.kind === 'sail') {
      // 光の帆：自分の力で進んだ道のりを数える（ワープは数えない）
      const p = Math.min(1, m.progress + (ship.velocity.length() * Math.min(delta, 0.1)) / (def.distance ?? 50))
      if (p >= 1) completeStep()
      else setProgress(p)
      return
    }
    if (def.kind === 'eclipse') {
      // 日食の画面で、食がいちばん深くなるところまで再生されたら
      if (useEclipse.getState().eclipseId === def.eclipse && eclipseClock.ms >= eclipseClock.peak) completeStep()
      return
    }
    const entry = bodies.get(def.body)
    const distance = distanceToBody(def.body)
    if (!entry || distance === null) return
    if (def.kind === 'goto') {
      if (isNear(distance, entry.radius)) completeStep()
    } else if (def.kind === 'flyby') {
      if (distance < entry.radius * FLYBY_ALTITUDE) completeStep()
    } else if (def.kind === 'launch' || def.kind === 'land') {
      // 艇を出せるのは、発進なら目標まで LAUNCH_RANGE 以内、着陸ならその天体のそば
      if (m.craftOut === null) setCraftReady(def.kind === 'launch' ? distance - entry.radius < LAUNCH_RANGE : isNear(distance, entry.radius))
    } else if (def.kind === 'photo') {
      // 撮るのは操縦席から（全体マップや鑑賞モードのカメラでは撮れない）
      const f = st.mode === 'flight' ? framing(camera, def, entry, distance) : 'out'
      setFraming(f)
      if (f === 'ok') advance(delta, def.seconds ?? 4)
    } else if (isNear(distance, entry.radius)) advance(delta, def.seconds ?? 5)
  })

  const steps = phase === 'active' ? MISSIONS[index].steps : []
  const mechStep = steps.findIndex((s) => s.body === MECH_ID)
  const craftOut = useMission((m) => m.craftOut)

  // L キーで探査艇・着陸艇を出す
  useEffect(() => {
    if (kind !== 'launch' && kind !== 'land') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyL' && !e.repeat) launchCraft()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kind])

  return (
    <>
      {kind === 'deflect' && <MissionRock />}
      {kind === 'dock' && <DockRing key={`${index}-${step}`} />}
      {kind === 'beam' && <BeamNodes key={`${index}-${step}`} />}
      {mechStep >= 0 && step <= mechStep && <StrandedMech />}
      {craftOut !== null && (kind === 'launch' || kind === 'land') && <Craft key={`${index}-${step}`} land={kind === 'land'} />}
    </>
  )
}

const nodeAt = new THREE.Vector3()
const LIT = new THREE.Color(0.5, 1.8, 2.4)
const UNLIT = new THREE.Color(2.4, 1.1, 0.3)
const nodeU = new THREE.Vector3()
const nodeV = new THREE.Vector3()

/** 起動の光：目標の天体（ゲート）のまわりに BEAM_NODES 個。ビームが当たると橙から水色に変わる */
function BeamNodes() {
  const group = useRef<THREE.Group>(null!)
  const nodes = useRef<THREE.Mesh[]>([])
  const run = useRef({ offsets: [] as THREE.Vector3[], lit: [] as boolean[], ready: false })

  useEffect(() => {
    const m = useMission.getState()
    const def = MISSIONS[m.index].steps[m.step]
    const entry = bodies.get(def.body)
    if (!entry) return
    // 自機から見て、天体の輪のまわりに等間隔に並べる（少し手前へ）
    entry.object.getWorldPosition(nodeAt)
    const toShip = ship.position.clone().sub(nodeAt).normalize()
    nodeU.crossVectors(toShip, UP)
    if (nodeU.lengthSq() < 1e-6) nodeU.set(1, 0, 0)
    nodeU.normalize()
    nodeV.crossVectors(nodeU, toShip).normalize()
    const r = run.current
    r.offsets = Array.from({ length: BEAM_NODES }, (_, i) => {
      const a = Math.PI / 2 + (i / BEAM_NODES) * Math.PI * 2
      return nodeU.clone().multiplyScalar(Math.cos(a)).addScaledVector(nodeV, Math.sin(a)).multiplyScalar(entry.radius * 1.05).addScaledVector(toShip, entry.radius * 0.1)
    })
    r.lit = r.offsets.map(() => false)
    r.ready = true
    const text = missionText(MISSIONS[m.index].id).steps[m.step]
    const targets = nodes.current.map((object, i) => ({
      object,
      onHit: () => {
        if (r.lit[i]) return
        r.lit[i] = true
        // 光った点は、もう当たらないように外す（次の一発はほかの点へ）
        beamTargets.splice(beamTargets.indexOf(targets[i]), 1)
        const n = r.lit.filter(Boolean).length
        setProgress(n)
        if (n < BEAM_NODES) missionSay(text.hits?.[n - 1] ?? '')
        else setTimeout(() => useMission.getState().phase === 'active' && completeStep(), 1500)
      },
    }))
    beamTargets.push(...targets)
    return () => {
      for (const t of targets) if (beamTargets.includes(t)) beamTargets.splice(beamTargets.indexOf(t), 1)
    }
  }, [])

  useFrame(({ clock }) => {
    const r = run.current
    const m = useMission.getState()
    const entry = bodies.get(MISSIONS[m.index]?.steps[m.step]?.body ?? '')
    if (!r.ready || !entry) return
    entry.object.getWorldPosition(nodeAt)
    const t = clock.getElapsedTime()
    nodes.current.forEach((node, i) => {
      node.position.copy(nodeAt).add(r.offsets[i])
      node.scale.setScalar(entry.radius * (r.lit[i] ? 0.08 : 0.06 + 0.015 * Math.sin(t * 4 + i)))
      ;(node.material as THREE.MeshBasicMaterial).color.copy(r.lit[i] ? LIT : UNLIT)
    })
  })

  return (
    <group ref={group}>
      {Array.from({ length: BEAM_NODES }, (_, i) => (
        <mesh key={i} ref={(el) => el && (nodes.current[i] = el)}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshBasicMaterial toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/** 作業メカの大きさ（建設現場のものより大きく描いて、見つけやすくする） */
const STRANDED_SIZE = MECH_SIZE * 3
/** 救助の探査艇に引かれているあいだ、メカがついていく位置 */
const tow = { on: false, at: new THREE.Vector3() }
const mechFrom = new THREE.Vector3()

/** 救助を待つ作業メカ：コロニーのそばでゆっくり回りながら漂う */
function StrandedMech() {
  const group = useRef<THREE.Group>(null!)
  const offset = useRef(new THREE.Vector3())

  useEffect(() => {
    const colony = bodies.get(MISSIONS[useMission.getState().index].steps[0].body)
    if (colony) {
      colony.object.getWorldPosition(mechFrom)
      offset.current.copy(ship.position).sub(mechFrom)
      if (offset.current.lengthSq() < 1e-6) offset.current.set(0, 0.2, 1)
      offset.current.applyAxisAngle(UP, -0.9).setLength(colony.radius * 1.8)
      offset.current.y += colony.radius * 0.4
    }
    tow.on = false
    const unregister = registerBody({ id: MECH_ID, get name() { return ui().mechName }, radius: STRANDED_SIZE, object: group.current })
    return () => {
      unregister()
      tow.on = false
      if (useStore.getState().targetId === MECH_ID) useStore.getState().setTarget(null)
    }
  }, [])

  useFrame((_, delta) => {
    const m = useMission.getState()
    const def = MISSIONS[m.index]?.steps[m.step]
    if (def?.body === MECH_ID && useStore.getState().targetId !== MECH_ID) useStore.getState().setTarget(MECH_ID)
    if (tow.on) group.current.position.copy(tow.at)
    else {
      const colony = bodies.get(MISSIONS[m.index]?.steps[0].body ?? '')
      if (colony) group.current.position.copy(colony.object.getWorldPosition(mechFrom)).add(offset.current)
    }
    group.current.rotation.x += delta * 0.25
    group.current.rotation.z += delta * 0.1
  })

  return (
    <group ref={group}>
      <group scale={STRANDED_SIZE}>
        <WorkMech pose="float" />
      </group>
      {/* 助けを呼ぶ点滅灯 */}
      <Beacon size={STRANDED_SIZE} />
    </group>
  )
}

function Beacon({ size }: { size: number }) {
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    ;(mesh.current.material as THREE.MeshBasicMaterial).opacity = Math.sin(clock.getElapsedTime() * 4) > 0.3 ? 1 : 0.15
  })
  return (
    <mesh ref={mesh} position={[0, size * 0.9, 0]}>
      <sphereGeometry args={[size * 0.12, 10, 8]} />
      <meshBasicMaterial color={new THREE.Color(2.4, 0.9, 0.3)} transparent toneMapped={false} />
    </mesh>
  )
}

const craftTo = new THREE.Vector3()
const craftDir = new THREE.Vector3()
const lookAt = new THREE.Vector3()

/**
 * 探査艇（発進）と着陸艇：自機から目標へ飛んでいき、必要なら戻ってくる。
 * 発進：CRAFT_SECONDS で目標の表面のそばへ（back なら同じ時間で帰る）。着陸：降りて、地表で待って、上がって戻る
 */
function Craft({ land }: { land: boolean }) {
  const group = useRef<THREE.Group>(null!)
  const flame = useRef<THREE.Mesh>(null!)
  const run = useRef({ size: 1, start: new THREE.Vector3(), said: 0 })

  useEffect(() => {
    run.current.size = shipScale() * 0.3
    run.current.start.copy(ship.position)
    group.current.position.copy(ship.position)
    group.current.scale.setScalar(run.current.size)
    // 目標の印は艇を追いかける（大きな惑星のそばでも、艇の居場所がわかるように）
    const craft = group.current
    markerOverride.object = craft
    return () => {
      tow.on = false
      if (markerOverride.object === craft) markerOverride.object = null
    }
  }, [])

  useFrame(() => {
    const m = useMission.getState()
    const def = MISSIONS[m.index]?.steps[m.step]
    const entry = bodies.get(def?.body ?? '')
    if (m.phase !== 'active' || m.craftOut === null || !def || !entry) return
    const elapsed = performance.now() / 1000 - m.craftOut
    const [down, stay, up] = land ? LANDER_SECONDS : [CRAFT_SECONDS, 0, def.back ? CRAFT_SECONDS : 0]
    const total = down + stay + up
    // 行き先：目標の表面の、自機の側（作業メカやビーコンのような小さいものは、そのものの位置）
    entry.object.getWorldPosition(craftTo)
    const small = entry.radius < 0.05
    if (!small) {
      craftDir.copy(ship.position).sub(craftTo).normalize()
      craftTo.addScaledVector(craftDir, entry.radius * (land ? 1.002 : 1.25))
    }
    let k: number
    let from: THREE.Vector3, to: THREE.Vector3
    if (elapsed < down) {
      k = elapsed / down
      from = run.current.start
      to = craftTo
    } else if (elapsed < down + stay) {
      k = 1
      from = craftTo
      to = craftTo
    } else {
      k = up > 0 ? (elapsed - down - stay) / up : 1
      from = craftTo
      to = ship.position
    }
    const e = k * k * (3 - 2 * k)
    lookAt.copy(group.current.position)
    group.current.position.lerpVectors(from, to, Math.min(1, e))
    // 進む向きを向く（止まっているあいだはそのまま）
    if (lookAt.distanceToSquared(group.current.position) > 1e-12) {
      lookAt.sub(group.current.position).multiplyScalar(-1).add(group.current.position)
      group.current.lookAt(lookAt)
    }
    flame.current.visible = elapsed < down || elapsed > down + stay
    // 救助：帰り道はメカを連れてくる
    if (def.back && def.body === MECH_ID && elapsed >= down) {
      tow.on = true
      tow.at.copy(group.current.position)
    }
    // 着いた・地表に降りたときのことば
    const text = missionText(MISSIONS[m.index].id).steps[m.step]
    if (run.current.said === 0 && elapsed >= down && (stay > 0 || up > 0) && text.arrive) {
      run.current.said = 1
      missionSay(text.arrive)
    }
    if (elapsed >= total) completeStep()
    else setProgress(Math.min(0.99, elapsed / total))
  })

  return (
    <group ref={group}>
      {/* 白い艇体と、橙の帯。前は +Z（lookAt で進む向きへ） */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.35, 1, 10]} />
        <meshStandardMaterial color="#e8ecf2" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, -0.45]}>
        <cylinderGeometry args={[0.36, 0.36, 0.12, 10]} />
        <meshStandardMaterial color="#e07a3a" roughness={0.6} />
      </mesh>
      {/* 遠くからも見えるよう、ぼんやり光る */}
      <mesh>
        <sphereGeometry args={[0.9, 12, 8]} />
        <meshBasicMaterial color={new THREE.Color(1.2, 1.4, 1.8)} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.1]}>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshBasicMaterial color={new THREE.Color(0.6, 1.8, 2.4)} toneMapped={false} />
      </mesh>
      <mesh ref={flame} position={[0, 0, -0.85]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.2, 0.7, 8]} />
        <meshBasicMaterial color={new THREE.Color(2.4, 1.4, 0.6)} transparent opacity={0.8} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

const dockFrom = new THREE.Vector3()

/** 入港の輪：目標の天体のそばに出す。輪の中心で、ゆっくり止まれば入港 */
function DockRing() {
  const group = useRef<THREE.Group>(null!)
  const run = useRef({ offset: new THREE.Vector3(), size: 1, ready: false, held: 0 })
  const lights = useRef<THREE.Mesh[]>([])

  useEffect(() => {
    const m = useMission.getState()
    const entry = bodies.get(MISSIONS[m.index].steps[m.step].body)
    if (!entry) return
    // 自機と同じくらいの距離で、自機から船の長さ8つ分ほど横に。輪は自機の方を向く
    const r = run.current
    r.size = shipScale()
    entry.object.getWorldPosition(dockFrom)
    r.offset.copy(ship.position).sub(dockFrom)
    if (r.offset.lengthSq() < 1e-6) r.offset.set(0, 0.2, 1)
    const dist = r.offset.length()
    r.offset.applyAxisAngle(UP, Math.min(0.6, (8 * r.size) / dist))
    group.current.position.copy(dockFrom).add(r.offset)
    group.current.lookAt(ship.position)
    group.current.scale.setScalar(r.size)
    r.ready = true
    markerOverride.object = group.current
    return () => {
      if (markerOverride.object === group.current) markerOverride.object = null
    }
  }, [])

  useFrame(({ clock }, delta) => {
    const r = run.current
    const m = useMission.getState()
    const entry = bodies.get(MISSIONS[m.index]?.steps[m.step]?.body ?? '')
    if (!r.ready || !entry) return
    entry.object.getWorldPosition(dockFrom)
    group.current.position.copy(dockFrom).add(r.offset)
    // 誘導灯：輪のまわりを順番に光が回る
    const t = clock.getElapsedTime()
    lights.current.forEach((l, i) => ((l.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.75 * Math.max(0, Math.cos(t * 3 - i * 0.8))))
    if (m.phase !== 'active' || useStore.getState().warpPhase !== 'idle') return
    // 船の長さを単位にして、輪の中心までの距離と速さを見る
    const d = ship.position.distanceTo(group.current.position) / r.size
    const speed = ship.velocity.length() / r.size
    const f: Framing = d > DOCK_RANGE ? 'far' : speed > DOCK_SPEED ? 'fast' : 'ok'
    setFraming(f)
    if (f === 'ok') advance(delta, DOCK_SECONDS)
    else if (m.progress > 0) setProgress(0)
  })

  return (
    <group ref={group}>
      <mesh>
        <torusGeometry args={[1, 0.035, 10, 64]} />
        <meshBasicMaterial color={new THREE.Color(0.5, 1.6, 2.2)} toneMapped={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial color="#5fd0ff" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0]} ref={(el) => el && (lights.current[i] = el)}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshBasicMaterial color={new THREE.Color(2, 1.6, 0.6)} transparent toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

/** 決まった形の乱数（毎回同じ形の小惑星にする） */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const e = new THREE.Vector3()
const dir = new THREE.Vector3()
const side = new THREE.Vector3()
const aim = new THREE.Vector3()

/** 地球に近づく小惑星。ビームが当たるたびに道すじ（点線）が地球からずれていく */
function MissionRock() {
  const group = useRef<THREE.Group>(null!)
  const rock = useRef<THREE.Mesh>(null!)
  const hitSphere = useRef<THREE.Mesh>(null!)
  const geometry = useMemo(() => asteroidGeometry(seeded(2026), 3), [])
  const run = useRef({ offset: new THREE.Vector3(), minLength: 0, hits: 0, miss: 0, missGoal: 0 })

  const pathMaterial = useMemo(
    () => new THREE.LineDashedMaterial({ color: new THREE.Color(1.6, 0.7, 0.2), dashSize: 0.25, gapSize: 0.2, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    [],
  )
  const path = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    const line = new THREE.Line(geometry, pathMaterial)
    line.frustumCulled = false
    return line
  }, [pathMaterial])

  useEffect(() => {
    const earth = bodies.get('earth')
    if (!earth) return
    // 自機から見て地球の横、少し上に出す（自機から10ほど先）
    const r = run.current
    earth.object.getWorldPosition(e)
    r.offset.copy(ship.position).sub(e)
    if (r.offset.lengthSq() < 1e-6) r.offset.set(0, 0.2, 1)
    r.offset.applyAxisAngle(UP, 0.7).setLength(earth.radius * 3 + 8)
    r.offset.y += 2
    r.minLength = earth.radius * 3 + 4
    group.current.position.copy(e).add(r.offset)

    const text = missionText(MISSIONS[useMission.getState().index].id).steps[useMission.getState().step]
    const target = {
      object: hitSphere.current,
      onHit: () => {
        if (r.hits >= DEFLECT_HITS) return
        r.hits += 1
        r.missGoal = (r.hits / DEFLECT_HITS) * earth.radius * 2.6
        setProgress(r.hits)
        if (r.hits < DEFLECT_HITS) missionSay(text.hits?.[r.hits - 1] ?? '')
        // 最後の命中：道すじが地球から外れるのを見せてから、結果へ
        else setTimeout(() => useMission.getState().phase === 'active' && completeStep(), 2500)
      },
    }
    beamTargets.push(target)
    const unregister = registerBody({ id: ROCK_ID, get name() { return ui().rockName }, radius: ROCK_RADIUS, object: group.current })
    useStore.getState().setTarget(ROCK_ID)
    return () => {
      unregister()
      beamTargets.splice(beamTargets.indexOf(target), 1)
      if (useStore.getState().targetId === ROCK_ID) useStore.getState().setTarget(null)
    }
  }, [])

  useFrame((_, delta) => {
    const earth = bodies.get('earth')
    if (!earth) return
    const r = run.current
    earth.object.getWorldPosition(e)
    // ゆっくり地球へ近づく（そらし終えたら、横へそれていく）
    if (r.hits < DEFLECT_HITS) r.offset.setLength(Math.max(r.minLength, r.offset.length() - DRIFT * delta))
    group.current.position.copy(e).add(r.offset)
    rock.current.rotation.x += delta * 0.3
    rock.current.rotation.y += delta * 0.17

    // 道すじ：小惑星から地球の中心へ。命中するたびに横へずれる
    r.miss += (r.missGoal - r.miss) * (1 - Math.exp(-2 * delta))
    dir.copy(e).sub(group.current.position).normalize()
    side.crossVectors(dir, UP).normalize()
    aim.copy(e).addScaledVector(side, r.miss)
    const start = group.current.position
    const pos = path.geometry.attributes.position as THREE.BufferAttribute
    pos.setXYZ(0, start.x, start.y, start.z)
    aim.sub(start).multiplyScalar(1.5).add(start)
    pos.setXYZ(1, aim.x, aim.y, aim.z)
    pos.needsUpdate = true
    path.computeLineDistances()
    const safe = r.miss > earth.radius * 1.15
    pathMaterial.color.setRGB(safe ? 0.4 : 1.6, safe ? 1.3 : 0.7, safe ? 1.6 : 0.2)
  })

  return (
    <>
      <group ref={group}>
        <mesh ref={rock} geometry={geometry} scale={ROCK_RADIUS}>
          <meshStandardMaterial color="#8d8275" roughness={0.95} flatShading />
        </mesh>
        <mesh ref={hitSphere}>
          <sphereGeometry args={[HIT_RADIUS, 12, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </group>
      <primitive object={path} />
    </>
  )
}
