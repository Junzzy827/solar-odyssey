import * as THREE from 'three'
import { heightAt as globalHeight, loadMoonMap, type GlobalMap } from '../flight/moonGlobe'
import { detailAt, heightAt as demHeight, loadDem, type Dem } from '../surface/dem'
import { localXZ, siteFrame, R_MOON } from '../../data/lunarDescent'

// 月ミッション第2弾の地面の高さ。月全体は LOLA の標高地図（moonGlobe.ts）、着陸地点のまわり 100 km 四方は
// タウルス・リトロウ谷の本物の地形（地表の場面と同じ moon_taurus：遠く 100 km・近く 16 km・細かい 3.2 km）に差しかえる。
// 境目はなめらかにつなぐ。高さは月の半径（1,737.4 km）からの m。

export const FRAME = siteFrame()

/** 地形の地図の範囲（半分、m）と、つなぎの幅 */
const FAR_HALF = 50_000
const FAR_BLEND = 9_000
const NEAR_HALF = 8_000
const NEAR_BLEND = 1_200

export type LunarMaps = { global: GlobalMap; dem: Dem | null; /** 着陸地点（地図の原点）の、月全体の地図での高さ */ base: number }

let maps: LunarMaps | null = null
let loading: Promise<LunarMaps> | null = null

/** 地図を読む（読み終わったら ground() が本物の高さを返す）。谷の地図が読めなくても、月全体の地図で続ける */
export function loadLunarMaps() {
  loading ??= Promise.all([loadMoonMap(), loadDem('moon_taurus').catch(() => null)]).then(([global, dem]) => {
    const u = FRAME.up
    const base = globalHeight(global, u.x, u.y, u.z, 20_000)
    maps = { global, dem, base }
    return maps
  })
  loading.catch(() => (loading = null))
  return loading
}

export const lunarMaps = () => maps

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 谷の地図の高さ（地図の原点を 0）。範囲の外は null */
function valley(dem: Dem, x: number, z: number) {
  const far = demHeight(dem.far, x, z)
  if (far === null) return null
  const m = Math.max(Math.abs(x), Math.abs(z))
  if (m > NEAR_HALF) return far
  const near = demHeight(dem.near, x, z)
  if (near === null) return far
  let h = far + (near - far) * (1 - smooth(NEAR_HALF - NEAR_BLEND, NEAR_HALF - 50, m))
  if (dem.detail) h += detailAt(dem.detail, x, z)
  return h
}

/**
 * その向き（単位ベクトル）の地面の高さ（m、月の半径から）。minWave：それより小さな起伏は足さない（遠いかけら用）。
 * 地図を読む前は、着陸地点のおよその高さ
 */
export function groundAt(d: THREE.Vector3, minWave = 0) {
  if (!maps) return -2_945
  const k = d.dot(FRAME.up)
  if (maps.dem && k > 0.99) {
    const { x, z } = localXZ(FRAME, d)
    const m = Math.max(Math.abs(x), Math.abs(z))
    if (m < FAR_HALF) {
      const v = valley(maps.dem, x, z)
      if (v !== null) {
        const local = maps.base + v
        const w = smooth(FAR_HALF - FAR_BLEND, FAR_HALF - 200, m)
        if (w <= 0) return local
        return local + (globalHeight(maps.global, d.x, d.y, d.z, Math.max(minWave, 2000)) - local) * w
      }
    }
  }
  return globalHeight(maps.global, d.x, d.y, d.z, minWave)
}

/** 物理用（いつも細かく） */
export const ground = (d: THREE.Vector3) => groundAt(d, 0)

/** 谷の地図の中か（かけらを細かく分けるときに使う。0〜1：1 は近くの地図の中） */
export function valleyWeight(d: THREE.Vector3) {
  if (!maps?.dem || d.dot(FRAME.up) < 0.99) return 0
  const { x, z } = localXZ(FRAME, d)
  return 1 - smooth(NEAR_HALF, FAR_HALF, Math.max(Math.abs(x), Math.abs(z)))
}

export { R_MOON }

// ---- 太陽の影（谷の地図の上に、前もって計算しておく） ----

/**
 * 太陽の向き（月の中心から）。1972 年 12 月 11 日の着陸のとき、谷では太陽が東の空の低い所（約 13°）にあった。
 * 赤道の上、経度 107° の真上に太陽がある向き
 */
export const SUN_DIR = new THREE.Vector3(Math.cos((107 * Math.PI) / 180), -0.02, -Math.sin((107 * Math.PI) / 180)).normalize()

export type ShadowMap = { tex: THREE.DataTexture; half: number }

/**
 * 地図の各点から太陽の向きへ地形をたどり、山にさえぎられるかを調べる（1 = 日なた、0 = 影）。
 * 遠いほど月の丸みで地面が下がるぶんも入れる。影のふちは、さえぎる角度の差でぼかす。
 * 重いので、少しずつ（ほかの処理を止めないように）計算する
 */
export async function bakeShadow(dem: Dem, half: number, size: number, near: boolean): Promise<ShadowMap> {
  const data = new Uint8Array(size * size)
  const sx = SUN_DIR.dot(FRAME.east)
  const sz = -SUN_DIR.dot(FRAME.north)
  const su = SUN_DIR.dot(FRAME.up)
  const flat = Math.hypot(sx, sz)
  const dx = sx / flat
  const dz = sz / flat
  const tanEl = su / flat
  const cell = (half * 2) / size
  const h = near ? (x: number, z: number) => valley(dem, x, z) ?? 0 : (x: number, z: number) => demHeight(dem.far, x, z) ?? 0
  const reach = near ? 9_000 : 40_000
  let t0 = performance.now()
  for (let j = 0; j < size; j++) {
    const z = -half + (j + 0.5) * cell
    for (let i = 0; i < size; i++) {
      const x = -half + (i + 0.5) * cell
      const h0 = h(x, z) + 1
      let lit = 1
      let t = cell
      while (t < reach) {
        const px = x + dx * t
        const pz = z + dz * t
        const g = near && (Math.abs(px) > NEAR_HALF || Math.abs(pz) > NEAR_HALF) ? (demHeight(dem.far, px, pz) ?? -1e9) : h(px, pz)
        const ray = h0 + t * tanEl + (t * t) / (2 * R_MOON)
        // さえぎる高さの差を、距離に対する角度にして、ぼかす（太陽の見かけの大きさ 0.5° ほど）
        const k = (ray - g) / (t * 0.009) + 0.5
        if (k < lit) lit = k
        if (lit <= 0) break
        t *= 1.07
        t += cell * 0.3
      }
      data[j * size + i] = Math.round(Math.max(0, Math.min(1, lit)) * 255)
    }
    // 8 ms ごとにひと休み
    if (performance.now() - t0 > 8) {
      await new Promise((r) => setTimeout(r, 0))
      t0 = performance.now()
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return { tex, half }
}

let shadows: Promise<{ far: ShadowMap; near: ShadowMap } | null> | null = null
/** 谷の影（地図を読んだあと 1 回だけ） */
export function valleyShadows() {
  shadows ??= loadLunarMaps().then(async (m) => {
    if (!m.dem) return null
    const far = await bakeShadow(m.dem, 50_000, 384, false)
    const near = await bakeShadow(m.dem, NEAR_HALF, 512, true)
    return { far, near }
  })
  return shadows
}
