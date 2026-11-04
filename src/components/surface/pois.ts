// ローバーで行ける「見どころ」。天体ごとの一覧（データだけ）。地形の形は terrain.ts、地図の印は RoverHud.tsx。
//  kind：
//   buttes   … 地層の見える台地状の丘が集まった所（火星：シャープ山のふもとのマレー・ビュートのような）
//   boulders … 黒っぽい角ばった岩がごろごろ集まった所（火星：キュリオシティのディンゴ・ギャップのような）
//   dunes    … 黒い砂の砂丘の列（火星：バグノルド砂丘のような）。岩はない
//  ほかの天体の地形（crater・rille・scarp など）は poiForms.ts

export type PoiKind =
  | 'buttes'
  | 'boulders'
  | 'dunes'
  | 'crater'
  | 'rille'
  | 'scarp'
  | 'ridges'
  | 'chaos'
  | 'lava'
  | 'patera'
  | 'channel'
  | 'lakebed'
  | 'dome'
  | 'tessera'
  | 'grooves'
  | 'polygons'

export type Poi = {
  id: string
  kind: PoiKind
  /** 中心（着陸地点からの m、x 東・z 南） */
  x: number
  z: number
  /** 広さ（半径 m） */
  r: number
  /** 長い地形（谷・崖・尾根など）の向き（ラジアン。0 で東西に長い） */
  rot?: number
}

/** Poi の文言（日本語は src/i18n/pois.ja.ts、英語は pois.en.ts） */
export type PoiText = {
  name: string
}

export const POIS: Record<string, Poi[]> = {
  mars: [
    { id: 'mars-buttes', kind: 'buttes', x: -760, z: 380, r: 270 },
    { id: 'mars-boulders', kind: 'boulders', x: 520, z: -600, r: 130 },
    { id: 'mars-dunes', kind: 'dunes', x: -260, z: -980, r: 300 },
  ],
  // ほかの天体：中心は着陸地点から 430 m より外（着陸地点のまわりの岩の並びを変えないように）、±1.5 km の内（POI_SCALE で半分に寄せて使う）
  mercury: [
    { id: 'mercury-scarp', kind: 'scarp', x: -600, z: 650, r: 400, rot: 0.5 },
    { id: 'mercury-crater', kind: 'crater', x: 800, z: -550, r: 380 },
  ],
  venus: [
    { id: 'venus-lava', kind: 'lava', x: 700, z: 400, r: 350 },
    { id: 'venus-dome', kind: 'dome', x: -650, z: -550, r: 300 },
    { id: 'venus-tessera', kind: 'tessera', x: -500, z: 800, r: 380, rot: 0.3 },
  ],
  moon: [
    { id: 'moon-crater', kind: 'crater', x: 750, z: 780, r: 420 },
    { id: 'moon-rille', kind: 'rille', x: -800, z: -450, r: 450, rot: 0.4 },
    { id: 'moon-scarp', kind: 'scarp', x: 500, z: -850, r: 350, rot: -0.3 },
  ],
  io: [
    { id: 'io-lava', kind: 'lava', x: -650, z: 600, r: 380 },
    { id: 'io-patera', kind: 'patera', x: 700, z: -550, r: 260 },
  ],
  europa: [
    { id: 'europa-ridges', kind: 'ridges', x: -500, z: -800, r: 480, rot: 0.6 },
    { id: 'europa-chaos', kind: 'chaos', x: 750, z: 500, r: 300 },
  ],
  ganymede: [
    { id: 'ganymede-crater', kind: 'crater', x: -700, z: -600, r: 280 },
    { id: 'ganymede-grooves', kind: 'grooves', x: 650, z: 550, r: 420, rot: 0.8 },
  ],
  callisto: [
    { id: 'callisto-crater', kind: 'crater', x: -500, z: 750, r: 320 },
  ],
  mimas: [
    { id: 'mimas-crater', kind: 'crater', x: 700, z: 600, r: 300 },
  ],
  enceladus: [
    { id: 'enceladus-ridges', kind: 'ridges', x: 600, z: -700, r: 420, rot: -0.5 },
    { id: 'enceladus-grooves', kind: 'grooves', x: -700, z: 500, r: 350, rot: 0.2 },
  ],
  tethys: [
    { id: 'tethys-crater', kind: 'crater', x: -650, z: -650, r: 300 },
    { id: 'tethys-scarp', kind: 'scarp', x: 700, z: 500, r: 380, rot: 1.0 },
  ],
  dione: [
    { id: 'dione-scarp', kind: 'scarp', x: -600, z: 700, r: 400, rot: 0.7 },
    { id: 'dione-crater', kind: 'crater', x: 750, z: -450, r: 280 },
  ],
  rhea: [
    { id: 'rhea-crater', kind: 'crater', x: 550, z: 750, r: 320 },
  ],
  titan: [
    { id: 'titan-channel', kind: 'channel', x: -850, z: 350, r: 420, rot: 1.0 },
    { id: 'titan-lakebed', kind: 'lakebed', x: 600, z: -650, r: 260 },
  ],
  iapetus: [
    { id: 'iapetus-crater', kind: 'crater', x: -700, z: 600, r: 300 },
  ],
  miranda: [
    { id: 'miranda-scarp', kind: 'scarp', x: 650, z: -650, r: 420, rot: -0.8 },
    { id: 'miranda-grooves', kind: 'grooves', x: -650, z: 600, r: 380, rot: 0.5 },
  ],
  ariel: [
    { id: 'ariel-scarp', kind: 'scarp', x: -700, z: -600, r: 380, rot: 0.9 },
    { id: 'ariel-crater', kind: 'crater', x: 600, z: 700, r: 260 },
  ],
  umbriel: [
    { id: 'umbriel-crater', kind: 'crater', x: 650, z: -700, r: 320 },
  ],
  titania: [
    { id: 'titania-scarp', kind: 'scarp', x: 600, z: 650, r: 380, rot: -0.6 },
    { id: 'titania-crater', kind: 'crater', x: -700, z: -500, r: 280 },
  ],
  oberon: [
    { id: 'oberon-crater', kind: 'crater', x: -600, z: 750, r: 320 },
  ],
  proteus: [
    { id: 'proteus-crater', kind: 'crater', x: 700, z: -600, r: 320 },
  ],
  triton: [
    { id: 'triton-ridges', kind: 'ridges', x: -650, z: -600, r: 400, rot: 0.3 },
  ],
  pluto: [
    { id: 'pluto-polygons', kind: 'polygons', x: 650, z: 600, r: 420 },
    { id: 'pluto-chaos', kind: 'chaos', x: -700, z: -550, r: 320 },
  ],
  charon: [
    { id: 'charon-scarp', kind: 'scarp', x: -600, z: 650, r: 400, rot: 0.4 },
    { id: 'charon-crater', kind: 'crater', x: 700, z: -550, r: 260 },
  ],
}

/**
 * 見どころを着陸地点のほうへ寄せる倍率。上の表は走れる範囲が ±1.5 km だったころの位置と広さで、
 * いまは範囲を ±750 m に縮めて、見どころも位置・広さとも半分に凝縮している（近くて、すぐ行ける）
 */
export const POI_SCALE = 0.5

const scaled = new Map<string, Poi[]>()
export function poisFor(bodyId: string): Poi[] {
  let list = scaled.get(bodyId)
  if (!list) {
    list = (POIS[bodyId] ?? []).map((p) => ({ ...p, x: p.x * POI_SCALE, z: p.z * POI_SCALE, r: p.r * POI_SCALE }))
    scaled.set(bodyId, list)
  }
  return list
}

/** 見どころの中心からの近さ：中心 1、ふち（r）で 0。fade はふちでぼかす幅（r に対する割合） */
export function poiWeight(p: Poi, x: number, z: number, fade = 0.35) {
  const d = Math.hypot(x - p.x, z - p.z) / p.r
  if (d >= 1) return 0
  const t = Math.min(1, (1 - d) / fade)
  return t * t * (3 - 2 * t)
}
