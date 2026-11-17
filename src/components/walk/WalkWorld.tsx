import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ColonyModel } from '../sf/ColonyModel'
import { AVENUE, M, colonyDay, treeInstancesWhere, sharedInstancedMesh, treeGeometry, treeMaterial } from '../sf/colonyCity'
import { Batch, place, seeded } from '../sf/batch'
import { currentLevel, lowMemory } from '../../state/quality'
import { EW_END, EW_Y, FADE, G, LOOP, NS_S, PATCH, PATH_W, PLAY, PLAZA, POND, frameAt, inBoundsTree, landPoint, parkLayout, upAt } from './park'

// コロニーの中を歩く場面の、動かないもの：遠くのコロニー全体（宇宙の場面の形を 1/M 倍）、
// 公園の地面・池・木・ベンチ・街灯・遊具・噴水、空気のかすみ、昼と夜の光。

const HAZE_DAY = new THREE.Color('#9fc2e6')
const HAZE_NIGHT = new THREE.Color('#06090f')
const SKY_DAY = new THREE.Color('#d6e6ff')
const SKY_NIGHT = new THREE.Color('#41548a')
const GROUND_DAY = new THREE.Color('#5d6b45')
const GROUND_NIGHT = new THREE.Color('#1a1d24')
const LAMP_DAY = new THREE.Color(0.85, 0.85, 0.8)
const LAMP_NIGHT = new THREE.Color(2.6, 2.1, 1.4)

const q = new THREE.Quaternion()
const q2 = new THREE.Quaternion()
const Y = new THREE.Vector3(0, 1, 0)
const v = new THREE.Vector3()
const sc = new THREE.Vector3()
const m4 = new THREE.Matrix4()

/** 帯の上の (s, y) に、向き yaw で立てる行列 */
export function standAt(s: number, y: number, h: number, yaw: number, scale: number | [number, number, number], out = m4) {
  frameAt(s, q).multiply(q2.setFromAxisAngle(Y, yaw))
  landPoint(s, y, h, v)
  if (typeof scale === 'number') sc.setScalar(scale)
  else sc.set(...scale)
  return out.compose(v, q, sc)
}

/* ---------- 地面の絵 ---------- */

const PX_PER_M = () => (lowMemory() || currentLevel() === 'low' ? 0.9 : currentLevel() === 'medium' ? 1.3 : 1.7)

function groundCanvas() {
  const k = PX_PER_M()
  const W = Math.round((PATCH.s1 - PATCH.s0) * k)
  const H = Math.round((PATCH.y1 - PATCH.y0) * k)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const X = (s: number) => (s - PATCH.s0) * k
  const Yc = (y: number) => (PATCH.y1 - y) * k
  const rand = seeded(77)
  // 芝生：まだらに明るさを変える
  g.fillStyle = '#58843f'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 2600; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = (4 + rand() * 26) * k
    g.fillStyle = rand() < 0.5 ? 'rgba(120,160,80,0.10)' : 'rgba(40,70,30,0.10)'
    g.beginPath()
    g.ellipse(x, y, r, r * (0.6 + rand() * 0.6), rand() * 3, 0, Math.PI * 2)
    g.fill()
  }
  // 大通り（鉄道の高架の下）と歩道
  g.fillStyle = '#b9b3a5'
  g.fillRect(X(-AVENUE - 6), 0, (AVENUE + 6) * 2 * k, H)
  g.fillStyle = '#6d7073'
  g.fillRect(X(-AVENUE + 2), 0, (AVENUE - 2) * 2 * k, H)
  g.strokeStyle = 'rgba(255,255,255,0.6)'
  g.lineWidth = Math.max(1, 0.2 * k)
  g.setLineDash([3 * k, 4 * k])
  for (const s of [-AVENUE / 2, AVENUE / 2]) {
    g.beginPath()
    g.moveTo(X(s), 0)
    g.lineTo(X(s), H)
    g.stroke()
  }
  g.setLineDash([])
  // 池の岸の砂利
  const pond = (grow: number, color: string) => {
    g.fillStyle = color
    g.beginPath()
    g.ellipse(X(POND.s), Yc(POND.y), (POND.rs + grow) * k, (POND.ry + grow) * k, 0, 0, Math.PI * 2)
    g.fill()
  }
  pond(5, '#a99d7c')
  pond(0.5, '#3c6470')
  // 道
  g.strokeStyle = '#cdbf9c'
  g.lineCap = 'round'
  g.lineWidth = PATH_W * k
  g.beginPath()
  g.moveTo(X(AVENUE + 6), Yc(EW_Y))
  g.lineTo(X(EW_END), Yc(EW_Y))
  g.moveTo(X(NS_S), 0)
  g.lineTo(X(NS_S), H)
  g.stroke()
  g.beginPath()
  g.ellipse(X(LOOP.s), Yc(LOOP.y), LOOP.rs * k, LOOP.ry * k, 0, 0, Math.PI * 2)
  g.stroke()
  // 道の縁（少し暗く）
  g.strokeStyle = 'rgba(80,70,50,0.25)'
  g.lineWidth = Math.max(1, 0.35 * k)
  for (const off of [-PATH_W / 2, PATH_W / 2]) {
    g.beginPath()
    g.moveTo(X(AVENUE + 6), Yc(EW_Y + off))
    g.lineTo(X(EW_END), Yc(EW_Y + off))
    g.moveTo(X(NS_S + off), 0)
    g.lineTo(X(NS_S + off), H)
    g.stroke()
    g.beginPath()
    g.ellipse(X(LOOP.s), Yc(LOOP.y), (LOOP.rs + off) * k, (LOOP.ry + off) * k, 0, 0, Math.PI * 2)
    g.stroke()
  }
  // 広場（石畳）と遊び場（砂）
  g.fillStyle = '#d5ccb6'
  g.beginPath()
  g.arc(X(PLAZA.s), Yc(PLAZA.y), PLAZA.r * k, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = 'rgba(120,110,90,0.35)'
  g.lineWidth = Math.max(1, 0.15 * k)
  for (let r = 3; r < PLAZA.r; r += 2.2) {
    g.beginPath()
    g.arc(X(PLAZA.s), Yc(PLAZA.y), r * k, 0, Math.PI * 2)
    g.stroke()
  }
  g.fillStyle = '#d8c48e'
  g.beginPath()
  g.arc(X(PLAY.s), Yc(PLAY.y), PLAY.r * k, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#cdbf9c'
  g.lineWidth = 3 * k
  g.beginPath()
  g.moveTo(X(NS_S), Yc(PLAY.y))
  g.lineTo(X(PLAY.s - PLAY.r), Yc(PLAY.y))
  g.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** 近くで見ても平らに見えないよう、地面に重ねる細かいまだら（6 m ごとにくり返す） */
function detailTexture() {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  const img = g.createImageData(N, N)
  const rand = seeded(5)
  for (let i = 0; i < N * N; i++) {
    const n = 0.75 + rand() * 0.5
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.round(n * 170)
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  // 少しぼかして、草の房くらいの大きさに
  g.filter = 'blur(1px)'
  g.drawImage(c, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** 曲がった地面の一枚（円筒の内側に沿う）。uv は範囲の (0,0)〜(1,1) */
function patchGeometry(segS: number, segY: number, lift: number) {
  const geo = new THREE.PlaneGeometry(1, 1, segS, segY)
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    const s = PATCH.s0 + (pos.getX(i) + 0.5) * (PATCH.s1 - PATCH.s0)
    const y = PATCH.y0 + (pos.getY(i) + 0.5) * (PATCH.y1 - PATCH.y0)
    landPoint(s, y, lift, p)
    upAt(s, n)
    pos.setXYZ(i, p.x, p.y, p.z)
    nor.setXYZ(i, n.x, n.y, n.z)
  }
  // PlaneGeometry の面は +z を向くので、円筒の内側（上）から見えるように面の向きを返す
  const idx = geo.index!
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1)
    idx.setX(i + 1, idx.getX(i + 2))
    idx.setX(i + 2, a)
  }
  geo.computeBoundingSphere()
  return geo
}

function Ground() {
  const parts = useMemo(() => {
    const map = groundCanvas()
    const detail = detailTexture()
    const mat = new THREE.MeshLambertMaterial({ map, transparent: true })
    const uniforms = {
      uDetail: { value: detail },
      uRep: { value: new THREE.Vector2((PATCH.s1 - PATCH.s0) / 6, (PATCH.y1 - PATCH.y0) / 6) },
      uFade: { value: new THREE.Vector2(FADE / (PATCH.s1 - PATCH.s0), FADE / (PATCH.y1 - PATCH.y0)) },
    }
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform sampler2D uDetail;
uniform vec2 uRep;
uniform vec2 uFade;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
float dt = texture2D(uDetail, vMapUv * uRep).r * texture2D(uDetail, vMapUv * uRep * 0.173 + 0.31).r;
diffuseColor.rgb *= 0.55 + dt * 1.25;
vec2 e = min(vMapUv, 1.0 - vMapUv) / uFade;
diffuseColor.a *= smoothstep(0.0, 1.0, min(e.x, e.y));`,
        )
    }
    mat.customProgramCacheKey = () => 'walk-ground'
    // 池の水：楕円の網（中心から外へ）
    const ring = 40
    const segA = 96
    const wpos: number[] = []
    const wnor: number[] = []
    const widx: number[] = []
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    for (let i = 0; i <= ring; i++)
      for (let j = 0; j <= segA; j++) {
        const r = i / ring
        const a = (j / segA) * Math.PI * 2
        const s = POND.s + Math.cos(a) * POND.rs * r
        const y = POND.y + Math.sin(a) * POND.ry * r
        landPoint(s, y, 0.14, p)
        upAt(s, n)
        wpos.push(p.x, p.y, p.z)
        wnor.push(n.x, n.y, n.z)
      }
    for (let i = 0; i < ring; i++)
      for (let j = 0; j < segA; j++) {
        const a = i * (segA + 1) + j
        const b = a + segA + 1
        widx.push(a, a + 1, b, a + 1, b + 1, b)
      }
    const water = new THREE.BufferGeometry()
    water.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3))
    water.setAttribute('normal', new THREE.Float32BufferAttribute(wnor, 3))
    water.setIndex(widx)
    water.computeBoundingSphere()
    return {
      geo: patchGeometry(96, 110, 0.06),
      mat,
      water,
      waterMat: new THREE.MeshPhongMaterial({ color: '#2f6378', specular: '#b8cde0', shininess: 90, transparent: true, opacity: 0.93, side: THREE.DoubleSide }),
    }
  }, [])
  useEffect(
    () => () => {
      parts.geo.dispose()
      parts.mat.map?.dispose()
      parts.mat.dispose()
      parts.water.dispose()
      parts.waterMat.dispose()
    },
    [parts],
  )
  return (
    <>
      <mesh geometry={parts.geo} material={parts.mat} receiveShadow renderOrder={1} />
      <mesh geometry={parts.water} material={parts.waterMat} renderOrder={2} />
    </>
  )
}

/* ---------- 木・ベンチ・街灯・遊具・噴水 ---------- */

function useInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], colors?: number[]) {
  return useMemo(() => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach((m, i) => mesh.setMatrixAt(i, m))
    if (colors) {
      const c = new THREE.Color()
      colors.forEach((col, i) => mesh.setColorAt(i, c.setHex(col)))
    }
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.computeBoundingSphere()
    return mesh
  }, [geo, mat, list, colors])
}

/** 幹のある木（近くの木）。樹冠は 2 つの丸を重ねて、上が明るい */
function crownGeometry() {
  const a = new THREE.IcosahedronGeometry(0.5, 2)
  const b = new THREE.IcosahedronGeometry(0.36, 1).translate(0.18, 0.28, 0.08)
  const c = new THREE.IcosahedronGeometry(0.32, 1).translate(-0.2, 0.18, -0.12)
  const batch = new Batch()
  for (const g of [a, b, c]) batch.add(g)
  const geo = batch.build()
  // 少しでこぼこに
  const pos = geo.attributes.position
  const rand = seeded(3)
  const jitter = new Map<string, number>()
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    let j = jitter.get(key)
    if (j === undefined) jitter.set(key, (j = 0.9 + rand() * 0.2))
    pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j)
  }
  geo.computeVertexNormals()
  return geo
}

function Trees() {
  const park = parkLayout()
  const data = useMemo(() => {
    const trunks: THREE.Matrix4[] = []
    const crowns: THREE.Matrix4[] = []
    const colors: number[] = []
    const rand = seeded(41)
    for (const t of park.trees) {
      const yaw = rand() * Math.PI * 2
      trunks.push(standAt(t.s, t.y, t.h * 0.22, yaw, [0.16 + t.h * 0.012, t.h * 0.44, 0.16 + t.h * 0.012], new THREE.Matrix4()))
      const w = t.h * (0.55 + rand() * 0.2)
      crowns.push(standAt(t.s, t.y, t.h * 0.62, yaw, [w, t.h * 0.62, w], new THREE.Matrix4()))
      colors.push(t.color)
    }
    return {
      trunks,
      crowns,
      colors,
      trunkGeo: new THREE.CylinderGeometry(0.42, 0.5, 1, 7),
      crownGeo: crownGeometry(),
      trunkMat: new THREE.MeshLambertMaterial({ color: '#5a4434' }),
      crownMat: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
    }
  }, [park])
  const trunks = useInstanced(data.trunkGeo, data.trunkMat, data.trunks)
  const crowns = useInstanced(data.crownGeo, data.crownMat, data.crowns, data.colors)
  useFrame(() => {
    // 夜は葉を暗く
    data.crownMat.color.setScalar(1 - 0.75 * colonyDay.night)
  })
  return (
    <>
      <primitive object={trunks} />
      <primitive object={crowns} />
    </>
  )
}

function benchGeometry() {
  const box = new THREE.BoxGeometry(1, 1, 1)
  const wood = new Batch()
  // 座面と背もたれ（板 3 枚ずつ）。座る人の前は -z
  for (let i = 0; i < 3; i++) wood.add(box, place([0, 0.44, -0.08 + i * 0.15], [0, 0, 0], [1.7, 0.04, 0.12]))
  for (let i = 0; i < 3; i++) wood.add(box, place([0, 0.62 + i * 0.14, 0.27], [-0.18, 0, 0], [1.7, 0.1, 0.035]))
  const iron = new Batch()
  for (const x of [-0.75, 0.75]) {
    iron.add(box, place([x, 0.22, -0.12], [0, 0, 0], [0.05, 0.44, 0.05]))
    iron.add(box, place([x, 0.22, 0.2], [0, 0, 0], [0.05, 0.44, 0.05]))
    iron.add(box, place([x, 0.6, 0.27], [-0.18, 0, 0], [0.05, 0.5, 0.05]))
    iron.add(box, place([x, 0.56, 0.02], [0, 0, 0], [0.05, 0.04, 0.42]))
  }
  return { wood: wood.build(), iron: iron.build() }
}

/** まん中が明るく、外へ向かって消える丸 */
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function lampGeometry() {
  const pole = new Batch()
  pole.add(new THREE.CylinderGeometry(0.05, 0.08, 3.6, 8), place([0, 1.8, 0]))
  pole.add(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 10), place([0, 3.62, 0]))
  return { pole: pole.build(), head: new THREE.SphereGeometry(0.17, 12, 8).translate(0, 3.78, 0) }
}

function Furniture() {
  const park = parkLayout()
  const data = useMemo(() => {
    const bench = benchGeometry()
    const lamp = lampGeometry()
    const benches = park.benches.map((b) => standAt(b.s, b.y, 0, b.yaw, 1, new THREE.Matrix4()))
    const lamps = park.lamps.map((l) => standAt(l.s, l.y, 0, 0, 1, new THREE.Matrix4()))
    return {
      bench,
      lamp,
      benches,
      lamps,
      woodMat: new THREE.MeshLambertMaterial({ color: '#9a6b42' }),
      ironMat: new THREE.MeshLambertMaterial({ color: '#2f3336' }),
      headMat: new THREE.MeshBasicMaterial({ color: LAMP_DAY.clone(), toneMapped: false }),
      // 夜、街灯の下の地面を照らす光の輪（加算で重ねる）
      pool: { geo: new THREE.CircleGeometry(9, 32).rotateX(-Math.PI / 2), mat: new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffcf8a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }) },
    }
  }, [park])
  const pools = useMemo(() => {
    const mesh = new THREE.InstancedMesh(data.pool.geo, data.pool.mat, data.lamps.length)
    park.lamps.forEach((l, i) => mesh.setMatrixAt(i, standAt(l.s, l.y, 0.12, 0, 1, new THREE.Matrix4())))
    mesh.computeBoundingSphere()
    mesh.renderOrder = 3
    return mesh
  }, [data, park])
  const wood = useInstanced(data.bench.wood, data.woodMat, data.benches)
  const iron = useInstanced(data.bench.iron, data.ironMat, data.benches)
  const poles = useInstanced(data.lamp.pole, data.ironMat, data.lamps)
  const heads = useInstanced(data.lamp.head, data.headMat, data.lamps)
  heads.castShadow = false
  useFrame(() => {
    data.headMat.color.lerpColors(LAMP_DAY, LAMP_NIGHT, colonyDay.night)
    data.pool.mat.opacity = colonyDay.night * 0.85
    pools.visible = colonyDay.night > 0.02
  })
  return (
    <>
      <primitive object={wood} />
      <primitive object={iron} />
      <primitive object={poles} />
      <primitive object={heads} />
      <primitive object={pools} />
    </>
  )
}

/** 遊び場（すべり台・ぶらんこ・ジャングルジムの丸屋根）と、広場の噴水 */
function PlayAndPlaza() {
  const meshes = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1)
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)
    const out: { geo: THREE.BufferGeometry; mat: THREE.Material; at: THREE.Matrix4 }[] = []
    const add = (b: Batch, color: string, s: number, y: number, yaw: number) => out.push({ geo: b.build(), mat: new THREE.MeshLambertMaterial({ color }), at: standAt(s, y, 0, yaw, 1, new THREE.Matrix4()) })
    // すべり台
    const slide = new Batch()
    slide.add(box, place([0, 1.0, 0], [0, 0, 0], [1.2, 0.08, 1.2]))
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) slide.add(cyl, place([x, 0.5, z], [0, 0, 0], [0.08, 1.0, 0.08]))
    const slideRed = new Batch()
    slideRed.add(box, place([0, 0.55, -1.85], [-0.42, 0, 0], [0.8, 0.06, 2.6]))
    for (const x of [-0.42, 0.42]) slideRed.add(box, place([x, 0.68, -1.85], [-0.42, 0, 0], [0.06, 0.25, 2.6]))
    const ladder = new Batch()
    for (const x of [-0.3, 0.3]) ladder.add(cyl, place([x, 0.6, 1.0], [0.3, 0, 0], [0.06, 1.3, 0.06]))
    for (let i = 0; i < 4; i++) ladder.add(cyl, place([0, 0.2 + i * 0.27, 0.86 + i * 0.08], [0, 0, Math.PI / 2], [0.05, 0.6, 0.05]))
    add(slide, '#e0b43c', PLAY.s - 8, PLAY.y + 6, 0.6)
    add(slideRed, '#d8452f', PLAY.s - 8, PLAY.y + 6, 0.6)
    add(ladder, '#3a78c8', PLAY.s - 8, PLAY.y + 6, 0.6)
    // ぶらんこ
    const frame = new Batch()
    for (const x of [-1.8, 1.8]) {
      frame.add(cyl, place([x, 1.1, -0.6], [0.5, 0, 0], [0.09, 2.5, 0.09]))
      frame.add(cyl, place([x, 1.1, 0.6], [-0.5, 0, 0], [0.09, 2.5, 0.09]))
    }
    frame.add(cyl, place([0, 2.2, 0], [0, 0, Math.PI / 2], [0.1, 3.8, 0.1]))
    const seats = new Batch()
    for (const x of [-0.8, 0.8]) {
      seats.add(box, place([x, 0.45, 0], [0, 0, 0], [0.5, 0.05, 0.22]))
      for (const dx of [-0.22, 0.22]) seats.add(cyl, place([x + dx, 1.33, 0], [0, 0, 0], [0.015, 1.75, 0.015]))
    }
    add(frame, '#3f8f5a', PLAY.s + 9, PLAY.y - 4, -0.3)
    add(seats, '#33363a', PLAY.s + 9, PLAY.y - 4, -0.3)
    // ジャングルジムの丸屋根（格子の帯）
    const dome = new Batch()
    for (let i = 0; i < 8; i++) dome.add(new THREE.TorusGeometry(1.8, 0.04, 6, 24, Math.PI), place([0, 0, 0], [0, (i / 8) * Math.PI, 0]))
    for (const h of [0.6, 1.2]) {
      const r = Math.sqrt(1.8 * 1.8 - h * h)
      dome.add(new THREE.TorusGeometry(r, 0.04, 6, 32), place([0, h, 0], [Math.PI / 2, 0, 0]))
    }
    add(dome, '#c85a9a', PLAY.s + 2, PLAY.y + 11, 0)
    // 噴水：丸い池の縁と、まん中の柱、水
    const basin = new Batch()
    basin.add(new THREE.TorusGeometry(4.6, 0.32, 8, 40), place([0, 0.32, 0], [Math.PI / 2, 0, 0]))
    basin.add(new THREE.CylinderGeometry(0.45, 0.6, 1.4, 12), place([0, 0.7, 0]))
    basin.add(new THREE.CylinderGeometry(1.3, 1.1, 0.2, 20), place([0, 1.45, 0]))
    add(basin, '#c9c3b6', PLAZA.s, PLAZA.y, 0)
    const pool = new Batch()
    pool.add(new THREE.CylinderGeometry(4.5, 4.5, 0.05, 40), place([0, 0.42, 0]))
    out.push({ geo: pool.build(), mat: new THREE.MeshPhongMaterial({ color: '#3a7a92', specular: '#ffffff', shininess: 80 }), at: standAt(PLAZA.s, PLAZA.y, 0, 0, 1, new THREE.Matrix4()) })
    const spray = new THREE.CylinderGeometry(0.06, 0.5, 2.6, 16, 1, true).translate(0, 2.6, 0)
    out.push({ geo: spray, mat: new THREE.MeshBasicMaterial({ color: '#dff2ff', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }), at: standAt(PLAZA.s, PLAZA.y, 0, 0, 1, new THREE.Matrix4()) })
    return out
  }, [])
  useEffect(
    () => () => {
      for (const m of meshes) {
        m.geo.dispose()
        m.mat.dispose()
      }
    },
    [meshes],
  )
  return (
    <>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geo} material={m.mat} matrixAutoUpdate={false} matrix={m.at} castShadow receiveShadow />
      ))}
    </>
  )
}

/* ---------- 遠くのコロニー ---------- */

function FarColony() {
  const trees = useMemo(() => sharedInstancedMesh(treeGeometry(), treeMaterial, treeInstancesWhere((k, t) => !(k === 0 && inBoundsTree(t)))), [])
  useEffect(() => () => trees.dispose(), [trees])
  return (
    <group scale={1 / M}>
      <ColonyModel interior cityTrees={false} />
      <primitive object={trees} />
    </group>
  )
}

/* ---------- 光と空気 ---------- */

/** 昼と夜の光。follow の位置（自分）のまわりだけ影を作る */
function Lights({ follow }: { follow: { current: THREE.Vector3 } }) {
  const { scene } = useThree()
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sun = useRef<THREE.DirectionalLight>(null!)
  // 夜：向こう側の街の灯りが、ぼんやり全体を照らす
  const glow = useRef<THREE.AmbientLight>(null!)
  const level = currentLevel()
  const shadows = level !== 'low' && !lowMemory()
  const center = useMemo(() => {
    const s = (PATCH.s0 + PATCH.s1) / 2
    return { up: upAt(s), east: new THREE.Vector3(Math.cos(s / G), 0, -Math.sin(s / G)) }
  }, [])
  // 光は窓（大地の帯のとなり）から斜めに入ってくる：上から東へ 35°、少し太陽の側（北）から
  const dir = useMemo(() => center.up.clone().multiplyScalar(Math.cos(0.6)).addScaledVector(center.east, Math.sin(0.6)).add(new THREE.Vector3(0, 0.25, 0)).normalize(), [center])
  useEffect(() => {
    scene.fog = new THREE.FogExp2(HAZE_DAY.clone(), 0.000055)
    scene.background = HAZE_DAY.clone()
    return () => {
      scene.fog = null
      scene.background = null
    }
  }, [scene])
  useFrame(() => {
    const n = colonyDay.night
    const fog = scene.fog as THREE.FogExp2
    fog.color.lerpColors(HAZE_DAY, HAZE_NIGHT, n)
    ;(scene.background as THREE.Color).copy(fog.color)
    hemi.current.color.lerpColors(SKY_DAY, SKY_NIGHT, n)
    hemi.current.groundColor.lerpColors(GROUND_DAY, GROUND_NIGHT, n)
    hemi.current.intensity = 1.25 - 0.8 * n
    hemi.current.position.copy(center.up)
    glow.current.intensity = 0.9 * n
    const s = sun.current
    s.intensity = 1.7 * (1 - n)
    s.position.copy(follow.current).addScaledVector(dir, 120)
    s.target.position.copy(follow.current)
    s.target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight ref={hemi} />
      <ambientLight ref={glow} color="#9aa6d0" intensity={0} />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        shadow-mapSize={[level === 'high' ? 2048 : 1024, level === 'high' ? 2048 : 1024]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={300}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  )
}

/** テスト用：歩く場面の scene と renderer */
export const walkDebug = { scene: null as THREE.Scene | null, gl: null as THREE.WebGLRenderer | null }

function Debug() {
  const { scene, gl } = useThree()
  useEffect(() => {
    walkDebug.scene = scene
    walkDebug.gl = gl
    return () => {
      walkDebug.scene = null
      walkDebug.gl = null
    }
  }, [scene, gl])
  return null
}

export function WalkWorld({ follow }: { follow: { current: THREE.Vector3 } }) {
  return (
    <>
      <Debug />
      <Lights follow={follow} />
      <FarColony />
      <Ground />
      <Trees />
      <Furniture />
      <PlayAndPlaza />
    </>
  )
}
