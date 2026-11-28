import * as THREE from 'three'
import { ISS_BASE } from './station'

// ISS の絵（色の絵と焼いた光）の置き場。段階 2：部屋をいくつも読んだり捨てたりするので、
// - 同じ絵（generic_hubandmetals など、10 部屋で同じ）は、GPU に 1 回だけ載せる（絵の名前ごとに 1 つの「席」）
// - 席の大きさは、使っている部屋の望む大きさのうち、いちばん大きいもの（いる部屋は near、となりは far）。
//   大きさが変わったら、新しい大きさを読んで、載せ終わってから差しかえ、古い方は GPU から消す
// - 読みこみ：ImageBitmapLoader（絵のほどきを別のスレッドで）。使えないブラウザ（古い Safari・Firefox）は TextureLoader
// - GPU に載せるのは 1 コマに 1 枚まで（tick）。大きな絵をいっぺんに載せてコマが止まらないように
// - だれも使わなくなった席は、すぐ GPU から消す（部屋を捨てるのは moduleStreamer が数秒待ってから決める）

/** 絵を使う人（材質の map / lightMap など）。apply は、使う絵が決まった・変わったときに呼ばれる */
export type TexWant = { readonly key: string; size: number; apply: (t: THREE.Texture) => void }

type Slot = {
  key: string
  file: (size: number) => string
  wants: Set<TexWant>
  cur: { size: number; tex: THREE.Texture } | null
  /** 読んでいる大きさ（0 = 読んでいない） */
  loading: number
  /** 光の絵：2 番目の UV、くり返さない */
  light: boolean
}

type Upload = { slot: Slot; size: number; tex: THREE.Texture }

function useBitmaps() {
  if (typeof createImageBitmap === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const safari = /^((?!chrome|android).)*safari/i.test(ua)
  const sv = ua.match(/Version\/(\d+)/)
  if (safari && (!sv || parseInt(sv[1], 10) < 17)) return false
  const ff = ua.match(/Firefox\/(\d+)\./)
  if (ff && parseInt(ff[1], 10) < 98) return false
  return true
}

const bytesOf = (size: number) => size * size * 4 * (4 / 3)

export class TexPool {
  private readonly slots = new Map<string, Slot>()
  private readonly queue: Upload[] = []
  private readonly bitmap = useBitmaps()
  private readonly bitmapLoader = new THREE.ImageBitmapLoader().setOptions({ premultiplyAlpha: 'none' })
  private readonly imgLoader = new THREE.TextureLoader()
  /** いちばん長かった 1 回の載せる時間（ms、重さの記録用） */
  maxUploadMs = 0
  disposed = false

  constructor(private readonly anisotropy: number) {}

  /**
   * 絵を使い始める。key は席の名前（'tex:generic_hubandmetals'、'light:us_lab'）、file は大きさ → ファイル名（models/iss/ から）
   */
  want(key: string, file: (size: number) => string, size: number, apply: (t: THREE.Texture) => void, light = false): TexWant {
    let slot = this.slots.get(key)
    if (!slot) {
      slot = { key, file, wants: new Set(), cur: null, loading: 0, light }
      this.slots.set(key, slot)
    }
    const w: TexWant = { key, size, apply }
    slot.wants.add(w)
    if (slot.cur) apply(slot.cur.tex)
    this.sync(slot)
    return w
  }

  /** 望む大きさを変える（部屋に入った・出た） */
  resize(w: TexWant, size: number) {
    if (w.size === size) return
    w.size = size
    const slot = this.slots.get(w.key)
    if (slot) this.sync(slot)
  }

  /** 使い終わった */
  release(w: TexWant) {
    const slot = this.slots.get(w.key)
    if (!slot) return
    slot.wants.delete(w)
    this.sync(slot)
  }

  /** その人の絵が使える（どれかの大きさが GPU に載った） */
  ready(w: TexWant) {
    return !!this.slots.get(w.key)?.cur
  }

  /** 1 コマに 1 枚だけ GPU に載せて、差しかえる。毎コマ呼ぶ */
  tick(gl: THREE.WebGLRenderer) {
    while (this.queue.length) {
      const u = this.queue.shift()!
      // 読み終わる前に、要らなくなった・ほかの大きさに変わった
      if (this.slots.get(u.slot.key) !== u.slot || u.slot.loading !== u.size || this.target(u.slot) === 0) {
        this.drop(u.tex)
        if (u.slot.loading === u.size) u.slot.loading = 0
        continue
      }
      const t0 = performance.now()
      gl.initTexture(u.tex)
      this.maxUploadMs = Math.max(this.maxUploadMs, performance.now() - t0)
      // 載せ終わったら、CPU の側のほどいた絵は捨てる（PC で 1 枚 16 MB。もう一度載せることはしない）
      const img = u.tex.image as { close?: () => void } | null
      img?.close?.()
      const old = u.slot.cur
      u.slot.cur = { size: u.size, tex: u.tex }
      u.slot.loading = 0
      for (const w of u.slot.wants) w.apply(u.tex)
      if (old) this.drop(old.tex)
      this.sync(u.slot)
      return
    }
  }

  private target(slot: Slot) {
    let s = 0
    for (const w of slot.wants) s = Math.max(s, w.size)
    return s
  }

  private sync(slot: Slot) {
    if (this.disposed) return
    const want = this.target(slot)
    if (want === 0) {
      // だれも使わない：GPU から消す
      if (slot.cur) this.drop(slot.cur.tex)
      slot.cur = null
      slot.loading = 0
      this.slots.delete(slot.key)
      return
    }
    if (slot.cur?.size === want || slot.loading === want) return
    slot.loading = want
    this.load(slot.file(want), slot.light)
      .then((tex) => {
        if (this.disposed) return this.drop(tex)
        this.queue.push({ slot, size: want, tex })
      })
      .catch((e) => {
        console.error('[iss] texture', slot.file(want), e)
        if (slot.loading === want) slot.loading = 0
      })
  }

  private async load(file: string, light: boolean): Promise<THREE.Texture> {
    let tex: THREE.Texture
    if (this.bitmap) {
      const bmp = await this.bitmapLoader.loadAsync(ISS_BASE + file)
      tex = new THREE.Texture(bmp as unknown as HTMLImageElement)
    } else {
      tex = await this.imgLoader.loadAsync(ISS_BASE + file)
    }
    // glTF の UV に合わせて上下を返さない
    tex.flipY = false
    tex.colorSpace = THREE.SRGBColorSpace
    if (light) {
      // 光の絵は 2 番目の UV（glTF の TEXCOORD_1 → three の uv1）
      tex.channel = 1
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
      tex.anisotropy = 1
    } else {
      // くり返しの UV がある
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.anisotropy = this.anisotropy
    }
    tex.needsUpdate = true
    return tex
  }

  private drop(tex: THREE.Texture) {
    tex.dispose()
    const img = tex.image as { close?: () => void } | null
    img?.close?.()
  }

  /** GPU に載せている絵の推定メモリ（バイト、RGBA＋ミップマップ） */
  memory() {
    let bytes = 0
    for (const s of this.slots.values()) if (s.cur) bytes += bytesOf(s.cur.size)
    return bytes
  }

  /** 載せている絵の一覧（重さを測るとき用） */
  list() {
    return [...this.slots.values()].map((s) => ({ key: s.key, size: s.cur?.size ?? 0, loading: s.loading, users: s.wants.size }))
  }

  /** 読みかけ・載せかけの絵の数 */
  busy() {
    let n = this.queue.length
    for (const s of this.slots.values()) if (s.loading) n++
    return n
  }

  /** 場面を閉じる：全部消す */
  dispose() {
    this.disposed = true
    for (const u of this.queue) this.drop(u.tex)
    this.queue.length = 0
    for (const s of this.slots.values()) if (s.cur) this.drop(s.cur.tex)
    this.slots.clear()
  }
}

/** いまの場面の置き場（debugHooks の __sv.iss.tex / texMemory 用） */
export const texPoolRef: { current: TexPool | null } = { current: null }

/** いま GPU に載せている（はずの）絵の推定メモリ（バイト） */
export function texMemory() {
  return texPoolRef.current?.memory() ?? 0
}

/** 読みこんだ絵の一覧 */
export function texList() {
  return texPoolRef.current?.list() ?? []
}
