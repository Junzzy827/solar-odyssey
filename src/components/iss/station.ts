// ISS の全体の地図（public/models/iss/station.json、tools/iss/textures.py が書く）の形と、読み方。
// 座標は m、原点はノード 1 の真ん中、+X 右舷・+Y 天頂・−Z 前（tools/iss/README.md）。
// 12 のモジュールは同じ座標で書き出してあるので、並べるだけで組み上がる。

export type Vec3 = [number, number, number]

/** 外への口（模型に無い所へつながる閉じたハッチ）の種類。札の文は i18n の iss.outer */
export type OuterKind = 'russian' | 'dock' | 'berth' | 'closed' | 'space'

export type StationHatch = {
  id: string
  /** つながる相手のモジュール。null は外への口（閉じたまま） */
  to: string | null
  kind?: OuterKind
  /** 口の真ん中 */
  center: Vec3
  /** このモジュールから外へ向く向き（単位） */
  normal: Vec3
}

export type StationMaterial = { tex: string | null; alpha: boolean; lamp: boolean; emissive: boolean; window?: boolean }

export type StationModule = {
  id: string
  /** i18n の iss.modules のキー */
  key: string
  glb: string
  /** 光の絵の大きさ [near, far]（<id>.light.<大きさ>.jpg） */
  light: { pc: [number, number]; phone: [number, number] }
  bboxMin: Vec3
  bboxMax: Vec3
  center: Vec3
  neighbours: string[]
  hatches: StationHatch[]
  materials: Record<string, StationMaterial>
  /** この部屋では少しだけ使う絵（いても far の段のまま） */
  minorTex: string[]
}

export type StationTexture = { pc: [number, number]; phone: [number, number]; alpha: boolean; users: string[] }

export type Station = {
  version: number
  lightIntensity: number
  textures: Record<string, StationTexture>
  modules: StationModule[]
}

export const ISS_BASE = `${import.meta.env.BASE_URL}models/iss/`

let pending: Promise<Station> | null = null

/** 全体の地図を読む（1 回だけ） */
export function loadStation(): Promise<Station> {
  if (!pending) {
    pending = fetch(`${ISS_BASE}station.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`station.json ${r.status}`)
        return r.json() as Promise<Station>
      })
      .catch((e) => {
        pending = null
        throw e
      })
  }
  return pending
}

/** すでに読んだ地図（まだなら null） */
let cached: Station | null = null
export function stationNow() {
  return cached
}
export function setStationNow(s: Station) {
  cached = s
}
