import * as THREE from 'three'
import { seeded } from '../ship/hullTextures'

// 機械文明の立方体船。一辺 1（±0.5）の立方体の6面に、
// 大小のパネル・配管・梁を何層にも重ねて「巨大な機械の塊」に見せる。
// 外板の深さ（w）で頂点の明るさを変え、奥ほど暗くして陰影（AO）の代わりにする。
// 奥の暗がりにはところどころ緑の光を置き、内部の機械が動いている気配を出す。

const CORE = 0.42 // 内側の船体の面
const TOP = 0.5 // 外板のおおよその高さ

type Basis = { U: THREE.Vector3; V: THREE.Vector3; N: THREE.Vector3 }

class Builder {
  pos: number[] = []
  nor: number[] = []
  col: number[] = []
  glow: number[] = []

  private p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  private e1 = new THREE.Vector3()
  private e2 = new THREE.Vector3()

  /** 4点の面（法線 n 側から見て反時計回りになるよう自動で並べ替える） */
  quad(pts: THREE.Vector3[], n: THREE.Vector3, shades: number[], glows: number[]) {
    this.e1.subVectors(pts[1], pts[0])
    this.e2.subVectors(pts[2], pts[0])
    const order = this.e1.cross(this.e2).dot(n) < 0 ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3]
    for (const i of order) {
      const v = pts[i]
      this.pos.push(v.x, v.y, v.z)
      this.nor.push(n.x, n.y, n.z)
      this.col.push(shades[i], shades[i], shades[i])
      this.glow.push(glows[i])
    }
  }

  /** 面の座標（u, v は面内、w は外向きの高さ）で箱を置く。裏（底）の面は作らない */
  box(b: Basis, u: number, v: number, hu: number, hv: number, w0: number, w1: number, tint: number, glowDepth: number) {
    const at = (du: number, dv: number, w: number, out: THREE.Vector3) =>
      out.copy(b.U).multiplyScalar(u + du).addScaledVector(b.V, v + dv).addScaledVector(b.N, w)
    const shade = (w: number) => tint * (0.12 + 0.88 * Math.min(1, Math.max(0, (w - CORE) / (TOP - CORE))) ** 1.4)
    const glow = (w: number) => glowDepth * Math.max(0, 1 - (w - CORE) / 0.045)
    const [a, c, d, e] = this.p
    // 上面
    at(-hu, -hv, w1, a), at(hu, -hv, w1, c), at(hu, hv, w1, d), at(-hu, hv, w1, e)
    const top = shade(w1)
    this.quad(this.p, b.N, [top, top, top, top], [0, 0, 0, 0])
    // 側面（下端は暗く、上端は明るい）
    const s0 = shade(w0)
    const g0 = glow(w0)
    const g1 = glow(w1)
    const sides: [number, number, number, number, THREE.Vector3][] = [
      [-hu, -hv, hu, -hv, b.V.clone().negate()],
      [hu, -hv, hu, hv, b.U],
      [hu, hv, -hu, hv, b.V],
      [-hu, hv, -hu, -hv, b.U.clone().negate()],
    ]
    for (const [u0, v0, u1, v1, n] of sides) {
      at(u0, v0, w0, a), at(u1, v1, w0, c), at(u1, v1, w1, d), at(u0, v0, w1, e)
      this.quad(this.p, n, [s0, s0, top, top], [g0, g0, g1, g1])
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('glow', new THREE.Float32BufferAttribute(this.glow, 1))
    g.computeBoundingSphere()
    return g
  }
}

function faceBases(): Basis[] {
  const axes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ]
  return axes.map((N) => {
    const U = Math.abs(N.x) > 0.5 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
    const V = new THREE.Vector3().crossVectors(N, U)
    return { U, V, N }
  })
}

export function cubeGeometry(seed = 7) {
  const rand = seeded(seed)
  const hull = new Builder()
  const lights = new Builder()
  const r = (a: number, b: number) => a + (b - a) * rand()

  for (const b of faceBases()) {
    // 内側の船体（隙間から見える暗い面）
    hull.box(b, 0, 0, 0.5, 0.5, CORE - 0.01, CORE, 1, 0)

    // パネルを大きさがばらばらの長方形に分割していく
    const leaves: [number, number, number, number][] = []
    const split = (u0: number, u1: number, v0: number, v1: number, depth: number) => {
      const su = u1 - u0
      const sv = v1 - v0
      const size = Math.max(su, sv)
      if (size > 0.014 && (size > 0.09 || (depth < 10 && rand() < 0.66))) {
        const t = r(0.3, 0.7)
        if (su > sv) {
          const m = u0 + su * t
          split(u0, m, v0, v1, depth + 1)
          split(m, u1, v0, v1, depth + 1)
        } else {
          const m = v0 + sv * t
          split(u0, u1, v0, m, depth + 1)
          split(u0, u1, m, v1, depth + 1)
        }
      } else leaves.push([u0, u1, v0, v1])
    }
    split(-0.5, 0.5, -0.5, 0.5, 0)

    for (const [u0, u1, v0, v1] of leaves) {
      const cu = (u0 + u1) / 2
      const cv = (v0 + v1) / 2
      const gap = 0.0012
      const hu = (u1 - u0) / 2 - gap
      const hv = (v1 - v0) / 2 - gap
      const k = rand()
      if (k < 0.08) {
        // 開口部：奥で緑の光がのぞく。光を横切る配管を何本か
        lights.box(b, cu, cv, hu * 0.92, hv * 0.92, CORE, CORE + 0.003, 1, 0)
        const pipes = 1 + Math.floor(rand() * 3)
        for (let i = 0; i < pipes; i++) {
          const along = rand() < 0.5
          const p = r(-0.7, 0.7)
          hull.box(b, along ? cu : cu + p * hu, along ? cv + p * hv : cv, along ? hu : 0.002, along ? 0.002 : hv, CORE, CORE + r(0.008, 0.03), 0.9, 1)
        }
        continue
      }
      // パネル：高さをばらつかせる。ところどころ深く沈めて、奥にも機械の層を見せる
      const w1 = k < 0.2 ? r(CORE + 0.012, CORE + 0.035) : r(TOP - 0.03, TOP)
      const tint = k < 0.2 ? r(0.6, 0.85) : r(0.7, 1.15)
      // 立方体の縁に接するパネルは側面が外にむき出しになるので、奥の光を当てない
      const border = Math.max(Math.abs(u0), Math.abs(u1), Math.abs(v0), Math.abs(v1)) > 0.499
      hull.box(b, cu, cv, hu, hv, CORE, w1, tint, border ? 0 : 0.4)
      // パネルの上の小さな機械
      const area = hu * hv * 4
      const n = Math.min(6, Math.floor(area * 16000 * rand()))
      for (let i = 0; i < n; i++) {
        const gu = r(0.0015, Math.min(0.012, hu * 0.6))
        const gv = r(0.0015, Math.min(0.012, hv * 0.6))
        hull.box(b, cu + r(-hu + gu, hu - gu), cv + r(-hv + gv, hv - gv), gu, gv, w1, w1 + r(0.0015, 0.007), r(0.7, 1.2), 0)
      }
      // 配管：パネルの長い方向に沿って
      if (rand() < 0.35) {
        const along = hu > hv
        const pipes = 1 + Math.floor(rand() * 3)
        for (let i = 0; i < pipes; i++) {
          const off = r(-0.8, 0.8)
          const t = r(0.0015, 0.003)
          hull.box(b, along ? cu : cu + off * hu, along ? cv + off * hv : cv, along ? hu : t, along ? t : hv, w1, w1 + t * 1.6, r(0.6, 0.9), 0)
        }
      }
      // ごく小さな緑の灯
      if (rand() < 0.05) lights.box(b, cu + r(-hu, hu) * 0.8, cv + r(-hv, hv) * 0.8, 0.0018, 0.0018, w1, w1 + 0.0015, 1, 0)
    }

    // 梁：面を8×8に区切る格子と、太い縁
    for (let i = 0; i <= 8; i++) {
      const p = -0.5 + i / 8
      const edge = i === 0 || i === 8
      const half = edge ? 0.012 : 0.0045
      const top = edge ? TOP + 0.012 : TOP + 0.005
      const bottom = TOP - 0.03
      hull.box(b, p, 0, half, 0.5, bottom, top, edge ? 1.05 : 0.95, 0)
      hull.box(b, 0, p, 0.5, half, bottom, top, edge ? 1.05 : 0.95, 0)
    }
  }

  return { hull: hull.geometry(), lights: lights.geometry() }
}

/** 細かな機械の模様（形状では作りきれない小さな凹凸を色で足す） */
function detailTexture() {
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const rand = seeded(99)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 1400; i++) {
    const w = 2 + rand() * 30
    const h = 2 + rand() * 30
    const g = 70 + rand() * 120
    ctx.fillStyle = `rgb(${g},${g},${g})`
    ctx.fillRect(rand() * size, rand() * size, w, h)
  }
  ctx.strokeStyle = 'rgba(20,20,20,0.6)'
  for (let i = 0; i < 300; i++) {
    const x = rand() * size
    const y = rand() * size
    ctx.beginPath()
    ctx.moveTo(x, y)
    if (rand() < 0.5) ctx.lineTo(x + rand() * 80, y)
    else ctx.lineTo(x, y + rand() * 80)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.NoColorSpace
  return t
}

/** 船体の材質。面は軸にそろっているので、法線の向きで投影面を選んで模様を貼る */
export function cubeMaterial(envMap: THREE.Texture | null) {
  const detail = detailTexture()
  const m = new THREE.MeshStandardMaterial({
    color: '#5f6563',
    vertexColors: true,
    metalness: 0.75,
    roughness: 0.5,
    envMap,
    envMapIntensity: 0.35,
    flatShading: false,
  })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detail }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvObjPos = position;\nvObjNormal = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D detailMap;\nvarying float vGlow;\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 an = abs(vObjNormal);
        vec2 duv = an.x > 0.5 ? vObjPos.zy : an.y > 0.5 ? vObjPos.xz : vObjPos.xy;
        float d1 = texture2D(detailMap, duv * 9.0).r;
        float d2 = texture2D(detailMap, duv * 31.0 + 0.37).r;
        diffuseColor.rgb *= 0.55 + 0.6 * d1 * (0.6 + 0.7 * d2);`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.03, 0.4, 0.13) * vGlow;')
  }
  return m
}
