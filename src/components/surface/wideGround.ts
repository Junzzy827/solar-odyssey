import * as THREE from 'three'
import type { Rock, Terrain } from './terrain'

// 広い範囲を走れる天体の地面（火星から始めて、いまはすべての天体）。
//  ・ローバーのまわりだけ、64 m 四方のタイルで細かく作る（ふつう 5×5 枚＝320 m 四方、1 m 間隔）。
//    ローバーが真ん中のタイルから出ると、足りないタイルを 1 フレームに少しずつ作り、そろったら一度に入れ替える。
//  ・その外は今までの円形の粗い地面。ローバーが 400 m 以上離れたら、ローバーのそばを中心に作り直す（これも少しずつ）。
//    タイルの下にある粗い地面は、頂点を下へ沈めて隠す（穴を開けると、ふちに空が透けるすき間ができるため）。
//  ・岩と当たり判定もタイルごと。タイルの番号から決まるので、離れて戻ってきても同じ岩が同じ場所にある。

export const TILE = 64
/** 走れる範囲（着陸地点を中心にした正方形の半分の幅、m）：広い天体 */
export const WIDE_RANGE = 750
/** 粗い地面を作り直す距離（m） */
const RECENTER = 400
/** タイルの下に沈める粗い地面の、タイルのふちからの余白（粗い格子の 1 マスより広く） */
const HOLE_MARGIN = 16

/**
 * 走れる範囲（正方形の半分の幅、m）。ふつうは 1.5 km。とても小さな星（フォボス・ダイモス）は、
 * 遠くへ行くほど地面が丸みで傾いていく（重力は真下のまま）ので、傾きが 3° 以内に収まる広さまで
 */
export function wideRange(terrain: Terrain) {
  const byCurve = Math.floor((terrain.radiusM * 0.05) / 50) * 50
  return Math.max(100, Math.min(WIDE_RANGE, byCurve))
}

/** 広い範囲を走れる天体か（ローバーのまわりをタイルで作る）。いまはすべての天体 */
export const isWide = (terrain: Terrain) => wideRange(terrain) > 100

/** 走れる範囲 */
export const roverRangeFor = (terrain: Terrain, base: number) => (isWide(terrain) ? wideRange(terrain) : base)

/** 当たり判定の岩。t：岩のてっぺんの高さ（世界の y）、h：地面からの高さ */
export type RockBody = { id: number; x: number; z: number; r: number; h: number; t: number }
export type RockGrid = Map<string, RockBody[]>
/** 当たり判定のます目（m） */
export const ROCK_CELL = 5

type Tile = { key: string; tx: number; tz: number; geo: THREE.BufferGeometry; rocks: Rock[]; bodies: RockBody[]; used: number }

export type WideOptions = { n: number; step: number; rocks: number }

export class WideWorld {
  private tiles = new Map<string, Tile>()
  /** 見せているタイル（入れ替えのたびに変わる） */
  active: Tile[] = []
  /** 入れ替えた回数（見た目の作り直しの合図） */
  version = 0
  /** 当たり判定（見せているタイルの岩）。同じ Map を中身だけ入れ替える */
  readonly cells: RockGrid = new Map()
  /** 見せているタイル全体の中心と半分の幅 */
  readonly patch = { x: 0, z: 0, half: 0 }
  /** 粗い地面を沈める正方形：(中心 x, 中心 z, 半分の幅, 沈める深さ)。半分の幅が負なら沈めない */
  readonly hole = new THREE.Vector4(0, 0, -1, 0)
  /** 粗い地面と、その中心 */
  coarse: THREE.BufferGeometry
  coarseVersion = 0
  private coarseAt = { x: 0, z: 0 }
  private job: { x: number; z: number; it: Generator<void, THREE.BufferGeometry, void> } | null = null
  private want: string[] = []
  private wantAt = { x: NaN, z: NaN }
  private frame = 0
  private building: { key: string; it: Generator<void, Tile, void> } | null = null
  private nextId = 1

  constructor(readonly terrain: Terrain, readonly opt: WideOptions) {
    this.coarse = terrain.geometry(0, 0)
    // 着陸地点のまわりは、はじめに全部作っておく（立って見る景色が最初から細かいように）
    this.update(0, 0, Infinity)
  }

  /** 毎フレーム呼ぶ。(fx, fz) は見ている場所（ローバー・立っている場所）。budget ms までしか作らない */
  update(fx: number, fz: number, budget = 4) {
    this.frame++
    const t0 = performance.now()
    const n = this.opt.n
    const cx = Math.floor(fx / TILE)
    const cz = Math.floor(fz / TILE)
    if (cx !== this.wantAt.x || cz !== this.wantAt.z) {
      this.wantAt = { x: cx, z: cz }
      const h = (n - 1) / 2
      this.want = []
      for (let j = -h; j <= h; j++) for (let i = -h; i <= h; i++) this.want.push(`${cx + i},${cz + j}`)
      // ローバーに近いタイルから作る
      this.want.sort((a, b) => dist2(a, cx, cz) - dist2(b, cx, cz))
    }
    let ready = true
    for (const key of this.want) {
      if (this.tiles.has(key)) continue
      if (this.building && this.building.key !== key) this.building = null // もう要らないタイルは作りかけでやめる
      if (!this.building) {
        const [i, j] = key.split(',').map(Number)
        this.building = { key, it: this.tileJob(key, i, j) }
      }
      let r = this.building.it.next()
      while (!r.done && performance.now() - t0 < budget) r = this.building.it.next()
      if (!r.done) {
        ready = false
        break
      }
      this.tiles.set(key, r.value)
      this.building = null
      if (performance.now() - t0 > budget) {
        ready = this.want.every((k) => this.tiles.has(k))
        break
      }
    }
    let swapped = false
    if (ready && (this.active.length !== this.want.length || this.active.some((t, i) => t.key !== this.want[i]))) {
      this.active = this.want.map((k) => this.tiles.get(k)!)
      for (const t of this.active) t.used = this.frame
      this.patch.x = (cx + 0.5) * TILE
      this.patch.z = (cz + 0.5) * TILE
      this.patch.half = (n * TILE) / 2
      this.hole.set(this.patch.x, this.patch.z, this.patch.half - HOLE_MARGIN, 30)
      this.cells.clear()
      for (const t of this.active)
        for (const b of t.bodies) {
          const key = `${Math.floor(b.x / ROCK_CELL)},${Math.floor(b.z / ROCK_CELL)}`
          const list = this.cells.get(key)
          if (list) list.push(b)
          else this.cells.set(key, [b])
        }
      this.evict()
      this.version++
      swapped = true
    }
    // 粗い地面の作り直し（タイルがそろっていて、時間が残っているときだけ進める）
    if (!this.job && Math.hypot(fx - this.coarseAt.x, fz - this.coarseAt.z) > RECENTER) {
      const x = Math.round(fx / 32) * 32
      const z = Math.round(fz / 32) * 32
      this.job = { x, z, it: this.terrain.geometryJob(x, z) }
    }
    while (this.job && ready && performance.now() - t0 < budget) {
      const r = this.job.it.next()
      if (r.done) {
        this.coarse.dispose()
        this.coarse = r.value
        this.coarseAt = { x: this.job.x, z: this.job.z }
        this.coarseVersion++
        this.job = null
        swapped = true
      }
    }
    return swapped
  }

  /** タイルを一度に作る（確認用） */
  build(key: string): Tile {
    const [i, j] = key.split(',').map(Number)
    const job = this.tileJob(key, i, j)
    let r = job.next()
    while (!r.done) r = job.next()
    return r.value
  }

  /** タイルを少しずつ作る：地面、岩、当たり判定 */
  private *tileJob(key: string, i: number, j: number): Generator<void, Tile, void> {
    const tx = i * TILE
    const tz = j * TILE
    const geo = yield* this.terrain.tileJob(tx, tz, TILE, this.opt.step)
    const rocks = yield* this.terrain.tileRocksJob(tx, tz, TILE, this.opt.rocks)
    return this.finish(key, tx, tz, geo, rocks)
  }

  /** 地面ができたタイルに当たり判定を足す */
  private finish(key: string, tx: number, tz: number, geo: THREE.BufferGeometry, rocks: Rock[]): Tile {
    const terrain = this.terrain
    const bodies: RockBody[] = []
    for (const r of rocks) {
      // 岩のてっぺんが地面からどれだけ出ているか。埋まった岩は当たらない
      const t = r.y + r.s * r.sy * 0.95
      const h = t - terrain.height(r.x, r.z)
      if (h < 0.04) continue
      bodies.push({ id: this.nextId++, x: r.x, z: r.z, r: r.s * 0.9, h, t })
    }
    return { key, tx, tz, geo, rocks, bodies, used: this.frame }
  }

  /** 使っていないタイルは、近くにあるもの（戻ってきたときにすぐ使う）だけ残して捨てる */
  private evict() {
    const keep = (this.opt.n + 2) ** 2
    if (this.tiles.size <= keep) return
    const old = [...this.tiles.values()].filter((t) => t.used !== this.frame).sort((a, b) => a.used - b.used)
    for (const t of old.slice(0, this.tiles.size - keep)) {
      t.geo.dispose()
      this.tiles.delete(t.key)
    }
  }

  /** 見せているタイルの岩（描く用） */
  rocks() {
    const out: Rock[] = []
    for (const t of this.active) for (const r of t.rocks) out.push(r)
    return out
  }

  dispose() {
    for (const t of this.tiles.values()) t.geo.dispose()
    this.tiles.clear()
    this.coarse.dispose()
  }
}

function dist2(key: string, cx: number, cz: number) {
  const [i, j] = key.split(',').map(Number)
  return (i - cx) ** 2 + (j - cz) ** 2
}

/** 広い地面（描いている Ground が作る）。ローバーの当たり判定もここから読む */
export const wideNow: { world: WideWorld | null } = { world: null }

/**
 * 粗い地面の材質に足す：タイルの下（uHole の正方形の内側）の頂点を沈める。
 * 沈めた頂点は細かいタイルの下に隠れ、正方形のふちの近くだけ両方が重なる（重なったところはタイルが手前）
 */
export function withHole(m: THREE.Material, hole: THREE.Vector4) {
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer)
    shader.uniforms.uHole = { value: hole }
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uHole;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      if (max(abs(transformed.x - uHole.x), abs(transformed.z - uHole.y)) < uHole.z) transformed.y -= uHole.w;`,
    )
  }
  const key = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => key() + '|hole'
  // 重なったところでタイルが勝つよう、少し奥へずらす
  m.polygonOffset = true
  m.polygonOffsetFactor = 1
  m.polygonOffsetUnits = 4
  return m
}
