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
  name: { ja: string; en: string }
}

export const POIS: Record<string, Poi[]> = {
  mars: [
    { id: 'mars-buttes', kind: 'buttes', x: -760, z: 380, r: 270, name: { ja: '地層の丘', en: 'Layered buttes' } },
    { id: 'mars-boulders', kind: 'boulders', x: 520, z: -600, r: 130, name: { ja: '岩塊の野', en: 'Boulder field' } },
    { id: 'mars-dunes', kind: 'dunes', x: -260, z: -980, r: 300, name: { ja: '黒い砂丘', en: 'Dark dunes' } },
  ],
  // ほかの天体：中心は着陸地点から 430 m より外（着陸地点のまわりの岩の並びを変えないように）、走れる範囲（±1.5 km）の内
  mercury: [
    { id: 'mercury-scarp', kind: 'scarp', x: -600, z: 650, r: 400, rot: 0.5, name: { ja: '断崖', en: 'Lobate scarp' } },
    { id: 'mercury-crater', kind: 'crater', x: 800, z: -550, r: 380, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  venus: [
    { id: 'venus-lava', kind: 'lava', x: 700, z: 400, r: 350, name: { ja: '溶岩流', en: 'Lava flows' } },
    { id: 'venus-dome', kind: 'dome', x: -650, z: -550, r: 300, name: { ja: '溶岩ドーム', en: 'Pancake dome' } },
    { id: 'venus-tessera', kind: 'tessera', x: -500, z: 800, r: 380, rot: 0.3, name: { ja: 'テッセラ', en: 'Tessera ridges' } },
  ],
  moon: [
    { id: 'moon-crater', kind: 'crater', x: 750, z: 780, r: 420, name: { ja: '大クレーター', en: 'Large crater' } },
    { id: 'moon-rille', kind: 'rille', x: -800, z: -450, r: 450, rot: 0.4, name: { ja: 'リル', en: 'Sinuous rille' } },
    { id: 'moon-scarp', kind: 'scarp', x: 500, z: -850, r: 350, rot: -0.3, name: { ja: '断崖', en: 'Lobate scarp' } },
  ],
  io: [
    { id: 'io-lava', kind: 'lava', x: -650, z: 600, r: 380, name: { ja: '溶岩流', en: 'Lava flows' } },
    { id: 'io-patera', kind: 'patera', x: 700, z: -550, r: 260, name: { ja: '火山の穴', en: 'Volcanic pit' } },
  ],
  europa: [
    { id: 'europa-ridges', kind: 'ridges', x: -500, z: -800, r: 480, rot: 0.6, name: { ja: '二重尾根', en: 'Double ridge' } },
    { id: 'europa-chaos', kind: 'chaos', x: 750, z: 500, r: 300, name: { ja: 'カオス地形', en: 'Chaos terrain' } },
  ],
  ganymede: [
    { id: 'ganymede-crater', kind: 'crater', x: -700, z: -600, r: 280, name: { ja: '大クレーター', en: 'Large crater' } },
    { id: 'ganymede-grooves', kind: 'grooves', x: 650, z: 550, r: 420, rot: 0.8, name: { ja: '溝状地形', en: 'Grooved terrain' } },
  ],
  callisto: [
    { id: 'callisto-crater', kind: 'crater', x: -500, z: 750, r: 320, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  mimas: [
    { id: 'mimas-crater', kind: 'crater', x: 700, z: 600, r: 300, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  enceladus: [
    { id: 'enceladus-ridges', kind: 'ridges', x: 600, z: -700, r: 420, rot: -0.5, name: { ja: '二重尾根', en: 'Double ridge' } },
    { id: 'enceladus-grooves', kind: 'grooves', x: -700, z: 500, r: 350, rot: 0.2, name: { ja: '溝状地形', en: 'Grooved terrain' } },
  ],
  tethys: [
    { id: 'tethys-crater', kind: 'crater', x: -650, z: -650, r: 300, name: { ja: '大クレーター', en: 'Large crater' } },
    { id: 'tethys-scarp', kind: 'scarp', x: 700, z: 500, r: 380, rot: 1.0, name: { ja: '氷の崖', en: 'Ice cliff' } },
  ],
  dione: [
    { id: 'dione-scarp', kind: 'scarp', x: -600, z: 700, r: 400, rot: 0.7, name: { ja: '氷の崖', en: 'Ice cliffs' } },
    { id: 'dione-crater', kind: 'crater', x: 750, z: -450, r: 280, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  rhea: [
    { id: 'rhea-crater', kind: 'crater', x: 550, z: 750, r: 320, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  titan: [
    { id: 'titan-channel', kind: 'channel', x: -850, z: 350, r: 420, rot: 1.0, name: { ja: 'メタンの川', en: 'Methane river' } },
    { id: 'titan-lakebed', kind: 'lakebed', x: 600, z: -650, r: 260, name: { ja: '干上がった湖', en: 'Dry lake bed' } },
  ],
  iapetus: [
    { id: 'iapetus-crater', kind: 'crater', x: -700, z: 600, r: 300, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  miranda: [
    { id: 'miranda-scarp', kind: 'scarp', x: 650, z: -650, r: 420, rot: -0.8, name: { ja: '断崖', en: 'Lobate scarp' } },
    { id: 'miranda-grooves', kind: 'grooves', x: -650, z: 600, r: 380, rot: 0.5, name: { ja: '溝状地形', en: 'Grooved terrain' } },
  ],
  ariel: [
    { id: 'ariel-scarp', kind: 'scarp', x: -700, z: -600, r: 380, rot: 0.9, name: { ja: '谷の崖', en: 'Canyon wall' } },
    { id: 'ariel-crater', kind: 'crater', x: 600, z: 700, r: 260, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  umbriel: [
    { id: 'umbriel-crater', kind: 'crater', x: 650, z: -700, r: 320, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  titania: [
    { id: 'titania-scarp', kind: 'scarp', x: 600, z: 650, r: 380, rot: -0.6, name: { ja: '谷の崖', en: 'Canyon wall' } },
    { id: 'titania-crater', kind: 'crater', x: -700, z: -500, r: 280, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  oberon: [
    { id: 'oberon-crater', kind: 'crater', x: -600, z: 750, r: 320, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  proteus: [
    { id: 'proteus-crater', kind: 'crater', x: 700, z: -600, r: 320, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
  triton: [
    { id: 'triton-ridges', kind: 'ridges', x: -650, z: -600, r: 400, rot: 0.3, name: { ja: '二重尾根', en: 'Double ridge' } },
  ],
  pluto: [
    { id: 'pluto-polygons', kind: 'polygons', x: 650, z: 600, r: 420, name: { ja: '氷の多角形', en: 'Ice polygons' } },
    { id: 'pluto-chaos', kind: 'chaos', x: -700, z: -550, r: 320, name: { ja: '氷の山塊', en: 'Ice blocks' } },
  ],
  charon: [
    { id: 'charon-scarp', kind: 'scarp', x: -600, z: 650, r: 400, rot: 0.4, name: { ja: '谷の崖', en: 'Canyon wall' } },
    { id: 'charon-crater', kind: 'crater', x: 700, z: -550, r: 260, name: { ja: '大クレーター', en: 'Large crater' } },
  ],
}

export const poisFor = (bodyId: string) => POIS[bodyId] ?? []

/** 見どころの中心からの近さ：中心 1、ふち（r）で 0。fade はふちでぼかす幅（r に対する割合） */
export function poiWeight(p: Poi, x: number, z: number, fade = 0.35) {
  const d = Math.hypot(x - p.x, z - p.z) / p.r
  if (d >= 1) return 0
  const t = Math.min(1, (1 - d) / fade)
  return t * t * (3 - 2 * t)
}
