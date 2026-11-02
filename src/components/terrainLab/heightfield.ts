import { fbm, seeded } from '../surface/terrain'

// 地形ラボの地形 1 枚（400 m 四方、0.78 m ごとの格子）。
// 平らな谷床・急な崖で縁どられた台地（ビュート）・なだらかな丘を作り、
// 「崩れ（落ちた土砂が崖の下にたまる）」と「水の流れの浸食（谷筋と、低い所にたまる細かい砂）」をかけられる。
// 座標：x, z とも -200〜+200 m。格子 h[j * N + i] の i が x、j が z。

export const SIZE = 400
export const N = 513
export const CELL = SIZE / (N - 1)
const HALF = SIZE / 2

export type Field = {
  /** 高さ（m） */
  h: Float32Array
  /** 細かい砂のたまりやすさ（0〜1）：浸食で運ばれた砂と、くぼみ */
  fill: Float32Array
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** もとの地形（浸食なし） */
function baseHeights(seed: number) {
  const h = new Float32Array(N * N)
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = i * CELL - HALF
      const z = j * CELL - HALF
      // なだらかな起伏
      let y = (fbm(x / 230, z / 230, seed + 1, 5) - 0.5) * 22
      // 台地：ゆがめたノイズのしきい値で、縁が急な崖になる。上にもう一段
      const wx = (fbm(x / 160, z / 160, seed + 11, 3) - 0.5) * 90
      const wz = (fbm(x / 160 + 7, z / 160, seed + 12, 3) - 0.5) * 90
      const m = fbm((x + wx) / 120, (z + wz) / 120, seed + 3, 5)
      y += smooth(0.5, 0.56, m) * 13 + smooth(0.62, 0.655, m) * 6
      // 地層の段（崖の途中に小さな棚）
      y += smooth(0.535, 0.545, m) * 1.2
      // 中くらいのでこぼこ
      y += (fbm(x / 26, z / 26, seed + 7, 3) - 0.5) * 2.2
      h[j * N + i] = y
    }
  return h
}

/** 足もとの細かいでこぼこ（浸食のあとに足す。浸食で消えないように） */
function addFine(h: Float32Array, seed: number) {
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = i * CELL - HALF
      const z = j * CELL - HALF
      h[j * N + i] += (fbm(x / 5, z / 5, seed + 8, 2) - 0.5) * 0.3
    }
}

/** 崩れ：決まった角度より急な所の土砂を、低いとなりへ少しずつ落とす（崖の下に斜面ができる） */
function thermal(h: Float32Array, iters: number, talusDeg: number) {
  const talus = Math.tan((talusDeg * Math.PI) / 180) * CELL
  const d = new Float32Array(N * N)
  const nb = [1, -1, N, -N]
  for (let it = 0; it < iters; it++) {
    d.fill(0)
    for (let j = 1; j < N - 1; j++)
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i
        const hk = h[k]
        let total = 0
        let maxD = 0
        for (const o of nb) {
          const dd = hk - h[k + o]
          if (dd > talus) {
            total += dd - talus
            if (dd > maxD) maxD = dd
          }
        }
        if (total <= 0) continue
        const move = 0.22 * (maxD - talus)
        for (const o of nb) {
          const dd = hk - h[k + o]
          if (dd > talus) {
            const a = (move * (dd - talus)) / total
            d[k] -= a
            d[k + o] += a
          }
        }
      }
    for (let k = 0; k < N * N; k++) h[k] += d[k]
  }
}

/** 水滴の浸食（水滴を何万個も転がして、削って運んで落とす）。たまった量を返す */
function hydraulic(h: Float32Array, drops: number, seed: number) {
  const rnd = seeded(seed + 501)
  const dep = new Float32Array(N * N)
  // 削るときに使う、まわりの重み（半径 2 ます）
  const R = 2
  const brush: { o: number; di: number; dj: number; w: number }[] = []
  let wsum = 0
  for (let dj = -R; dj <= R; dj++)
    for (let di = -R; di <= R; di++) {
      const dist = Math.hypot(di, dj)
      if (dist > R) continue
      const w = 1 - dist / R + 0.05
      brush.push({ o: dj * N + di, di, dj, w })
      wsum += w
    }
  for (const b of brush) b.w /= wsum

  const INERTIA = 0.08
  const CAP = 3.5
  const MIN_CAP = 0.01
  const ERODE = 0.25
  const DEPOSIT = 0.25
  const EVAP = 0.02
  const GRAV = 9
  const STEPS = 48

  const gradH = (x: number, y: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const u = x - ix
    const v = y - iy
    const k = iy * N + ix
    const a = h[k]
    const b = h[k + 1]
    const c = h[k + N]
    const d = h[k + N + 1]
    return {
      gx: (b - a) * (1 - v) + (d - c) * v,
      gy: (c - a) * (1 - u) + (d - b) * u,
      h: a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v,
    }
  }

  for (let n = 0; n < drops; n++) {
    let x = 3 + rnd() * (N - 7)
    let y = 3 + rnd() * (N - 7)
    let dx = 0
    let dy = 0
    let speed = 1
    let water = 1
    let sed = 0
    for (let s = 0; s < STEPS; s++) {
      const ix = Math.floor(x)
      const iy = Math.floor(y)
      const u = x - ix
      const v = y - iy
      const k = iy * N + ix
      const g = gradH(x, y)
      dx = dx * INERTIA - g.gx * (1 - INERTIA)
      dy = dy * INERTIA - g.gy * (1 - INERTIA)
      const len = Math.hypot(dx, dy)
      if (len < 1e-6) break
      dx /= len
      dy /= len
      x += dx
      y += dy
      if (x < 3 || y < 3 || x > N - 4 || y > N - 4) break
      const dh = gradH(x, y).h - g.h
      const cap = Math.max(-dh * speed * water * CAP, MIN_CAP)
      if (sed > cap || dh > 0) {
        // 落とす：上り坂なら穴を埋める分だけ、そうでなければ余った分を少し
        const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * DEPOSIT
        sed -= amt
        h[k] += amt * (1 - u) * (1 - v)
        h[k + 1] += amt * u * (1 - v)
        h[k + N] += amt * (1 - u) * v
        h[k + N + 1] += amt * u * v
        dep[k] += amt
      } else {
        // 削る：まわりから少しずつ（掘った穴より深くは削らない）
        const amt = Math.min((cap - sed) * ERODE, -dh)
        for (const b of brush) {
          const kk = k + b.o
          const take = Math.min(amt * b.w, Math.max(0, h[kk] - (g.h - 2)))
          h[kk] -= take
          sed += take
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed + dh * -GRAV * 0.1))
      water *= 1 - EVAP
    }
  }
  return dep
}

/** ぼかし（箱形を 2 回） */
function blur(src: Float32Array, r: number) {
  const a = new Float32Array(src)
  const b = new Float32Array(N * N)
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        let s = 0
        let c = 0
        for (let o = -r; o <= r; o++) {
          const ii = i + o
          if (ii < 0 || ii >= N) continue
          s += a[j * N + ii]
          c++
        }
        b[j * N + i] = s / c
      }
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        let s = 0
        let c = 0
        for (let o = -r; o <= r; o++) {
          const jj = j + o
          if (jj < 0 || jj >= N) continue
          s += b[jj * N + i]
          c++
        }
        a[j * N + i] = s / c
      }
  }
  return a
}

/** くぼみ（まわりより低い所ほど 1 に近い） */
function hollows(h: Float32Array) {
  const wide = blur(h, 8)
  const out = new Float32Array(N * N)
  for (let k = 0; k < N * N; k++) out[k] = Math.min(1, Math.max(0, (wide[k] - h[k]) / 1.2))
  return out
}

export function buildFields(seed = 4) {
  const t0 = performance.now()
  const base = baseHeights(seed)
  const raw = new Float32Array(base)
  addFine(raw, seed)
  const rawFill = hollows(raw)

  const er = new Float32Array(base)
  thermal(er, 28, 37)
  const dep = hydraulic(er, 90000, seed)
  thermal(er, 3, 42)
  addFine(er, seed)
  const depB = blur(dep, 2)
  let maxD = 0
  for (let k = 0; k < N * N; k++) maxD = Math.max(maxD, depB[k])
  const hol = hollows(er)
  const erFill = new Float32Array(N * N)
  for (let k = 0; k < N * N; k++) erFill[k] = Math.min(1, hol[k] * 0.8 + Math.sqrt(depB[k] / (maxD * 0.25 || 1)) * 0.7)
  const ms = Math.round(performance.now() - t0)
  return { raw: { h: raw, fill: rawFill } as Field, eroded: { h: er, fill: erFill } as Field, ms }
}

// ---- 地形を調べる ------------------------------------------------------------------------------

export function heightAt(f: Field, x: number, z: number) {
  const gx = Math.min(N - 1.001, Math.max(0, (x + HALF) / CELL))
  const gz = Math.min(N - 1.001, Math.max(0, (z + HALF) / CELL))
  const i = Math.floor(gx)
  const j = Math.floor(gz)
  const u = gx - i
  const v = gz - j
  const k = j * N + i
  const h = f.h
  return h[k] * (1 - u) * (1 - v) + h[k + 1] * u * (1 - v) + h[k + N] * (1 - u) * v + h[k + N + 1] * u * v
}

/** 上向きの法線 (nx, ny, nz) */
export function normalAt(f: Field, x: number, z: number) {
  const e = CELL
  const hx = heightAt(f, x + e, z) - heightAt(f, x - e, z)
  const hz = heightAt(f, x, z + e) - heightAt(f, x, z - e)
  const l = Math.hypot(hx, 2 * e, hz)
  return { x: -hx / l, y: (2 * e) / l, z: -hz / l }
}

/** 格子ごとの傾き（1 - 法線の上向き成分） */
export function slopeGrid(f: Field) {
  const s = new Float32Array(N * N)
  const h = f.h
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1)
      const i1 = Math.min(N - 1, i + 1)
      const j0 = Math.max(0, j - 1)
      const j1 = Math.min(N - 1, j + 1)
      const hx = (h[j * N + i1] - h[j * N + i0]) / ((i1 - i0) * CELL)
      const hz = (h[j1 * N + i] - h[j0 * N + i]) / ((j1 - j0) * CELL)
      s[j * N + i] = 1 - 1 / Math.hypot(hx, 1, hz)
    }
  return s
}

export { blur as blurGrid }
