import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Terrain } from './terrain'
import { meshHeight } from './Rover'
import { roverActive, roverPose, useRover } from '../../state/rover'
import { useLanding } from '../../state/landing'
import { useRally } from '../../state/rally'
import { useHistoric } from '../../state/historic'
import { beginTale, isDusk, quitRabbit, rabbitDebug, rabbitNow, showRabbit, useMoonRabbit } from '../../state/moonRabbit'

// 月の光るウサギ（state/moonRabbit.ts の場面）：光るウサギ、ついていく道、月の庭（光る石の輪・臼と杵・舞う光の粒）。
// ウサギはローバーが近くにいると跳ねて先へ進み、離れすぎると振り返って待つ。庭に着いたら臼のそばで杵をつき、お話のあいだ待つ。
// 最後は空へ跳んで帰る。地形には当たらず、地面の高さに沿うだけ。

/** ウサギから何 m 以内なら先へ進むか・何 m 離れたら待つか、庭の何 m 以内でお話を始めるか */
const LEAD = 32
const WAIT = 48
const ARRIVE = 22
/** 庭までの道のり（m） */
const TRIP = 300
/** 庭の石の輪の半径（m） */
const RING = 9

/** ウサギの模型（前は -z）。光る毛・桃色の耳の内側・赤い目。まわりにぼんやりした光 */
function buildRabbit(glowTex: THREE.Texture) {
  const grp = new THREE.Group()
  const body = new THREE.Group()
  grp.add(body)
  const fur = new THREE.MeshStandardMaterial({ color: '#f4fbff', emissive: new THREE.Color('#9effe0'), emissiveIntensity: 0.55, roughness: 0.6 })
  const inner = new THREE.MeshStandardMaterial({ color: '#ffd2e0', emissive: new THREE.Color('#ff9ec0'), emissiveIntensity: 0.4, roughness: 0.6 })
  const eye = new THREE.MeshBasicMaterial({ color: '#d0365a' })
  const sphere = new THREE.SphereGeometry(1, 20, 14)
  const add = (mat: THREE.Material, p: [number, number, number], s: [number, number, number], parent: THREE.Object3D = body) => {
    const m = new THREE.Mesh(sphere, mat)
    m.position.set(...p)
    m.scale.set(...s)
    m.castShadow = true
    parent.add(m)
    return m
  }
  add(fur, [0, 0.55, 0.15], [0.42, 0.4, 0.55])
  const head = new THREE.Group()
  head.position.set(0, 0.95, -0.35)
  body.add(head)
  add(fur, [0, 0, 0], [0.3, 0.28, 0.32], head)
  const ears: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const ear = new THREE.Group()
    ear.position.set(sd * 0.12, 0.2, 0.05)
    ear.rotation.set(0.25, 0, sd * -0.18)
    head.add(ear)
    add(fur, [0, 0.38, 0], [0.09, 0.4, 0.06], ear)
    add(inner, [0, 0.38, -0.03], [0.05, 0.3, 0.03], ear)
    ears.push(ear)
    add(eye, [sd * 0.17, 0.06, -0.2], [0.05, 0.06, 0.05], head)
  }
  add(fur, [0, 0.62, 0.72], [0.14, 0.14, 0.14])
  const legs: THREE.Mesh[] = []
  for (const sd of [-1, 1]) {
    legs.push(add(fur, [sd * 0.22, 0.18, 0.4], [0.13, 0.12, 0.34]))
    add(fur, [sd * 0.16, 0.18, -0.18], [0.08, 0.16, 0.08])
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color('#9effe0'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  glow.position.set(0, 0.7, 0)
  glow.scale.setScalar(3.2)
  grp.add(glow)
  grp.scale.setScalar(1.25)
  return { grp, body, head, ears, legs, glow, mats: [fur, inner, eye, glow.material], geos: [sphere] }
}

/** ぼんやりした丸い光の絵 */
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')!
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,0.9)')
  grd.addColorStop(0.3, 'rgba(255,255,255,0.35)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = grd
  x.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/** 月の庭：光る石の輪（9 本）、まん中の臼と杵、舞う光の粒、遠くから見える光の柱 */
function buildGarden(glowTex: THREE.Texture) {
  const grp = new THREE.Group()
  const crystalMat = new THREE.MeshStandardMaterial({ color: '#9fc8e8', emissive: new THREE.Color('#5fc8ff'), emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 })
  const pinkMat = new THREE.MeshStandardMaterial({ color: '#e8b8cc', emissive: new THREE.Color('#ff8ec0'), emissiveIntensity: 0.6, roughness: 0.3, transparent: true, opacity: 0.92 })
  const woodMat = new THREE.MeshStandardMaterial({ color: '#b98b5a', roughness: 0.8 })
  const mochiMat = new THREE.MeshStandardMaterial({ color: '#fbfaf4', emissive: new THREE.Color('#fff6e0'), emissiveIntensity: 0.35, roughness: 0.9 })
  const crystal = new THREE.OctahedronGeometry(1, 0)
  const crystals: THREE.Mesh[] = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const m = new THREE.Mesh(crystal, i % 3 === 0 ? pinkMat : crystalMat)
    const h = 1.1 + ((i * 37) % 5) * 0.25
    m.scale.set(0.3, h, 0.3)
    m.position.set(Math.cos(a) * RING, h * 0.8, Math.sin(a) * RING)
    m.rotation.set(((i * 13) % 7) * 0.03, a, ((i * 29) % 5) * 0.04 - 0.08)
    m.castShadow = true
    grp.add(m)
    crystals.push(m)
  }
  // 臼（うす）と杵（きね）とおもち
  const usu = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.62, 0.95, 24), woodMat)
  usu.position.set(0, 0.47, 0)
  usu.castShadow = true
  grp.add(usu)
  const mochi = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), mochiMat)
  mochi.scale.set(1, 0.45, 1)
  mochi.position.set(0, 0.98, 0)
  grp.add(mochi)
  const kine = new THREE.Group()
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), woodMat)
  handle.rotation.z = Math.PI / 2
  handle.position.set(0.8, 0, 0)
  const headK = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.62, 14), woodMat)
  kine.add(handle, headK)
  // 杵の頭は臼の上（x=0）、柄はウサギのいる +x の側へ
  kine.position.set(0, 1.55, 0)
  grp.add(kine)
  // 地面の光の輪
  const ringTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const x = c.getContext('2d')!
    const g = x.createRadialGradient(64, 64, 30, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.7, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  })()
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(RING * 2.5, RING * 2.5),
    new THREE.MeshBasicMaterial({ map: ringTex, color: '#5fb8d0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.06
  grp.add(floor)
  // 遠くから見える光の柱（ついていく途中の目印）
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.1, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: '#9effe0', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
  )
  pillar.position.y = 30
  grp.add(pillar)
  // 舞う光の粒
  const N = 90
  const motesGeo = new THREE.BufferGeometry()
  const seeds = new Float32Array(N * 4)
  for (let i = 0; i < N; i++) seeds.set([Math.random() * Math.PI * 2, 2 + Math.random() * (RING + 2), Math.random() * 4, 0.3 + Math.random() * 0.7], i * 4)
  motesGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3))
  const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({ map: glowTex, color: '#d8fff4', size: 0.45, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  motes.frustumCulled = false
  grp.add(motes)
  const mats = [crystalMat, pinkMat, woodMat, mochiMat, floor.material, pillar.material, motes.material]
  const geos = [crystal, usu.geometry, mochi.geometry, handle.geometry, headK.geometry, floor.geometry, pillar.geometry, motesGeo]
  return { grp, crystals, kine, mochi, pillar, motes, seeds, floor, mats, geos, tex: ringTex }
}

/** 庭の場所を決める：出発点から（なるべく）TRIP m 先で、走れる範囲の内側、高さの変わり方がいちばん小さい向き */
function pickGarden(terrain: Terrain, sx: number, sz: number, prefer: number, range: number) {
  // 走れる範囲（着陸地点を中心にした正方形）の、端から 40 m 内側まで
  const lim = Math.max(30, range - 40)
  let best = { x: 0, z: 0, score: Infinity }
  for (let k = 0; k < 16; k++) {
    const a = prefer + (k / 16) * Math.PI * 2
    const dx = -Math.sin(a)
    const dz = -Math.cos(a)
    // その向きに、範囲の中で行けるいちばん遠く（TRIP まで）
    let trip = TRIP
    if (dx) trip = Math.min(trip, ((dx > 0 ? lim : -lim) - sx) / dx)
    if (dz) trip = Math.min(trip, ((dz > 0 ? lim : -lim) - sz) / dz)
    if (trip < 60) continue
    const gx = sx + dx * trip
    const gz = sz + dz * trip
    // 道ぞいの坂の大きさ（20 m ごと）と、庭のまわりのでこぼこ
    let rough = 0
    let prev = terrain.height(sx, sz)
    for (let t = 20; t <= trip; t += 20) {
      const h = terrain.height(sx + dx * t, sz + dz * t)
      rough += Math.abs(h - prev)
      prev = h
    }
    for (let i = 0; i < 6; i++) {
      const b = (i / 6) * Math.PI * 2
      rough += Math.abs(terrain.height(gx + Math.cos(b) * RING, gz + Math.sin(b) * RING) - prev) * 2
    }
    // 遠いほど旅らしい。まっすぐ前（今向いている方向）を少しひいき
    const score = rough + (TRIP - trip) * 0.15 + (k === 0 ? 0 : 6)
    if (score < best.score) best = { x: gx, z: gz, score }
  }
  // どの向きもせまい（範囲の小さい天体）：着陸地点の反対側の角へ
  if (best.score === Infinity) return { x: sx > 0 ? -lim * 0.7 : lim * 0.7, z: sz > 0 ? -lim * 0.7 : lim * 0.7 }
  return { x: best.x, z: best.z }
}

export function MoonRabbit({ terrain }: { terrain: Terrain }) {
  const glowTex = useMemo(() => glowTexture(), [])
  const rabbit = useMemo(() => buildRabbit(glowTex), [glowTex])
  const garden = useMemo(() => buildGarden(glowTex), [glowTex])
  useEffect(
    () => () => {
      for (const m of [...rabbit.mats, ...garden.mats]) m.dispose()
      for (const g of [...rabbit.geos, ...garden.geos]) g.dispose()
      garden.tex.dispose()
      glowTex.dispose()
    },
    [rabbit, garden, glowTex],
  )
  // 場面を離れたら（離陸・別の地点へ）、ウサギはおしまい
  useEffect(() => () => quitRabbit(), [])

  const st = useRef({ s: 0, v: 0, x: 0, z: 0, y: 0, heading: 0, hop: 0, t: 0, ui: 0, rise: 0, fade: 0, ox: 1, oz: 0 })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const r = st.current
    r.t += dt
    const rb = useMoonRabbit.getState()
    const me = roverPose
    const rover = roverActive() ? useRover.getState().phase : 'none'

    // ---- 夕暮れに現れる ----
    if (rb.phase === 'off') {
      rabbit.grp.visible = false
      garden.grp.visible = false
      const land = useLanding.getState()
      const calm = rover === 'none' || rover === 'drive'
      if (!rb.shown && land.phase === 'surface' && land.ready && isDusk() && useRally.getState().phase === 'off' && useHistoric.getState().card === null && calm) {
        // ローバーがいればその少し前、いなければ着陸船の少し先
        const h = rover === 'drive' ? me.heading : 0
        const bx = rover === 'drive' ? me.x : 0
        const bz = rover === 'drive' ? me.z : 0
        const ahead = rover === 'drive' ? 34 : 26
        let sx = bx - Math.sin(h) * ahead
        let sz = bz - Math.cos(h) * ahead
        // 着陸船のすぐそば（隠れて見えない）なら、着陸船の向こう側へ
        if (Math.hypot(sx, sz) < 22) {
          const ol = Math.hypot(sx, sz) || 1
          sx = (sx / ol) * 30
          sz = (sz / ol) * 30
        }
        const g = pickGarden(terrain, sx, sz, h, useRover.getState().range)
        Object.assign(r, { s: 0, v: 0, hop: 0, rise: 0, fade: 0, x: sx, z: sz, heading: Math.atan2(-(bx - sx), -(bz - sz)) })
        showRabbit({ x: sx, z: sz }, g)
      }
      return
    }
    const start = rb.start!
    const gp = rb.garden!
    const L = Math.hypot(gp.x - start.x, gp.z - start.z)
    const dx = (gp.x - start.x) / L
    const dz = (gp.z - start.z) / L

    // ---- 庭 ----
    garden.grp.visible = rb.phase !== 'appear'
    if (garden.grp.visible) {
      garden.grp.position.set(gp.x, meshHeight(terrain, gp.x, gp.z) - 0.1, gp.z)
      // 石の輪は地面の高さに合わせる
      for (const c of garden.crystals) {
        const wx = gp.x + c.position.x
        const wz = gp.z + c.position.z
        c.position.y = meshHeight(terrain, wx, wz) - garden.grp.position.y + c.scale.y * 0.75
      }
      const tale = rb.phase === 'tale' || rb.phase === 'leave'
      // 光の柱は、ついていく途中の目印。着いたら消す
      garden.pillar.visible = !tale
      ;(garden.pillar.material as THREE.MeshBasicMaterial).opacity = 0.2 * (0.85 + 0.15 * Math.sin(r.t * 2))
      ;(garden.floor.material as THREE.MeshBasicMaterial).opacity = (0.3 + 0.1 * Math.sin(r.t * 1.5)) * (1 - r.fade)
      for (const [i, m] of [garden.crystals[0].material, garden.crystals[1].material].entries()) (m as THREE.MeshStandardMaterial).emissiveIntensity = (0.5 + 0.2 * Math.sin(r.t * 2 + i * 2)) * (1 - r.fade * 0.8)
      const pos = garden.motes.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const a = garden.seeds[i * 4] + r.t * 0.15 * garden.seeds[i * 4 + 3]
        const rr = garden.seeds[i * 4 + 1]
        pos.setXYZ(i, Math.cos(a) * rr, 0.4 + ((garden.seeds[i * 4 + 2] + r.t * 0.25 * garden.seeds[i * 4 + 3]) % 4.5), Math.sin(a) * rr)
      }
      pos.needsUpdate = true
      ;(garden.motes.material as THREE.PointsMaterial).opacity = 1 - r.fade
      // 杵つき：お話のあいだ、ゆっくり上げて、とんと下ろす
      const pound = rb.phase === 'tale' ? (Math.sin(r.t * 2.4) * 0.5 + 0.5) ** 3 : 0
      garden.kine.position.y = 1.32 + pound * 0.9
      // 柄はウサギのいる側へ。持ち上げると柄の側を軸に頭が上がる
      garden.kine.rotation.set(0, -Math.atan2(r.oz, r.ox), -pound * 0.35, 'YXZ')
      garden.mochi.scale.y = 0.45 - (1 - pound) * (rb.phase === 'tale' ? 0.06 : 0)
    }

    // ---- ウサギ ----
    rabbit.grp.visible = true
    const d = Math.hypot(me.x - r.x, me.z - r.z)
    let target = 0
    let lookAtMe = true
    if (rb.phase === 'follow') {
      if (r.s < L - RING - 1.5) {
        // ローバーが近ければ先へ（ローバーより少し速く）、遠ければ待つ
        // ローバーがウサギより先（庭の側）へ出たら、急いで先へ
        const roverS = (me.x - start.x) * dx + (me.z - start.z) * dz
        if (rover === 'drive' && roverS > r.s - 4) {
          target = 14
          lookAtMe = false
        } else if (rover === 'drive' && d < LEAD) {
          target = Math.min(14, Math.max(5, Math.abs(me.speed) + 3))
          lookAtMe = false
        } else if (d < WAIT && r.v > 0.5) {
          target = 4
          lookAtMe = false
        }
      }
      // ついていく途中でレースを始めたら、ウサギはおしまい
      if (useRally.getState().phase !== 'off') {
        quitRabbit()
        return
      }
      const waiting = target === 0 && r.s < L - RING - 1.5
      // 庭に着いて、ローバーも近くまで来たら、お話
      if (r.s >= L - RING - 1.5 && Math.hypot(me.x - gp.x, me.z - gp.z) < ARRIVE + RING) {
        // ウサギは臼の、ローバーから見て向こう側に座る
        const ox = gp.x - me.x
        const oz = gp.z - me.z
        const ol = Math.hypot(ox, oz) || 1
        r.ox = ox / ol
        r.oz = oz / ol
        beginTale()
      }
      r.ui += dt
      if (r.ui > 0.25) {
        r.ui = 0
        const left = Math.max(0, Math.round(Math.hypot(gp.x - me.x, gp.z - me.z) - RING))
        if (left !== rb.left || waiting !== rb.waiting) useMoonRabbit.setState({ left, waiting })
      }
    }
    if (rabbitDebug.arrive) {
      rabbitDebug.arrive = false
      r.s = L - RING - 1.5
    }
    r.v += THREE.MathUtils.clamp(target - r.v, -10 * dt, 6 * dt)
    r.s = Math.min(L - RING - 1.5, r.s + r.v * dt)
    let nx = start.x + dx * r.s + -dz * Math.sin(r.s / 21) * 1.4
    let nz = start.z + dz * r.s + dx * Math.sin(r.s / 21) * 1.4
    if (rb.phase === 'tale' || rb.phase === 'leave') {
      // 臼の向こう側（ローバーから見て）。ローバーのほうを向いて話す
      nx = gp.x + r.ox * 1.7
      nz = gp.z + r.oz * 1.7
      lookAtMe = true
    }
    // 向き：走っているときは進む向き、止まっているときは振り返って自分を見る。お話のときは臼を見る
    const want =
      rb.phase === 'leave'
        ? Math.atan2(-(gp.x - nx), -(gp.z - nz))
        : lookAtMe
          ? Math.atan2(-(me.x - nx), -(me.z - nz))
          : Math.atan2(-dx, -dz)
    let dh = want - r.heading
    while (dh > Math.PI) dh -= Math.PI * 2
    while (dh < -Math.PI) dh += Math.PI * 2
    r.heading += dh * Math.min(1, dt * 5)
    r.x = nx
    r.z = nz
    // 跳ねる：月は重力が弱いので、大きくゆっくり。止まっているときも、ときどき小さく跳ねて「こっちだよ」
    const moving = r.v > 0.5
    const hopLen = 4 + r.v * 0.55
    if (moving) r.hop = (r.hop + (r.v * dt) / hopLen) % 1
    else r.hop = (r.t * 0.6) % 1 < 0.25 ? ((r.t * 0.6) % 1) * 4 : 0
    const hopH = moving ? Math.min(2.4, 1 + r.v * 0.09) : rb.phase === 'tale' ? 0 : 0.35
    const k = Math.sin(r.hop * Math.PI)
    // 空へ帰る：少しずつ浮かんで、光りながら小さくなる
    if (rb.phase === 'leave') {
      const t = rabbitNow() - rb.since
      r.rise = t < 0.6 ? 0 : (t - 0.6) ** 1.6 * 6
      r.fade = THREE.MathUtils.clamp((t - 2.5) / 2.5, 0, 1)
      if (t > 5.2) quitRabbit()
    }
    r.y = meshHeight(terrain, nx, nz) + hopH * k + r.rise
    rabbit.grp.position.set(nx, r.y, nz)
    rabbit.grp.rotation.y = r.heading
    rabbit.grp.scale.setScalar(1.25 * (1 - r.fade * 0.7))
    const stretch = moving ? 1 + 0.18 * k : 1
    rabbit.body.scale.set(1, 1 / Math.sqrt(stretch), stretch)
    rabbit.body.rotation.x = moving ? (0.5 - r.hop) * 0.6 : rb.phase === 'tale' ? 0.12 : 0
    rabbit.ears.forEach((e, i) => (e.rotation.x = 0.25 + (!moving ? Math.sin(r.t * 9 + i) * 0.12 : -0.35 * k)))
    rabbit.legs.forEach((l) => (l.rotation.x = moving ? -0.7 * k : 0))
    const gm = rabbit.glow.material as THREE.SpriteMaterial
    gm.opacity = (0.6 + 0.25 * Math.sin(r.t * 4)) * (1 - r.fade)
    rabbit.glow.scale.setScalar(3.2 + (rb.phase === 'appear' ? 0.8 * Math.sin(r.t * 3) : 0) + r.rise * 0.15)
  })

  return (
    <>
      <primitive object={rabbit.grp} />
      <primitive object={garden.grp} />
    </>
  )
}
