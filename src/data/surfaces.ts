import { PLANETS } from './bodies'

// 着陸できる天体（地表のある惑星・衛星・冥王星とカロン）の、地表の景色の設定。
// 色や地形は探査機の写真をもとにした「それらしい」作り。空に浮かぶ母惑星の見かけの大きさは、
// 半径と距離から計算した本当の大きさ（度）。

export type Relief = {
  /** なだらかな起伏の高さ（m）と、その波長（m） */
  hills: number
  hillScale: number
  /** クレーターの多さ（0〜1）と、いちばん大きいクレーターの半径（m） */
  craters: number
  craterMax: number
  /** 岩の多さ（0〜1） */
  rocks: number
  /** 砂丘（風の吹く天体）の高さ（m） */
  dunes?: number
  /** 氷の割れ目の筋（0〜1） */
  cracks?: number
  /** 遠くの山並みの高さ（m） */
  mountains?: number
}

export type SkyBody = {
  /** テクスチャの名前（data/textures.ts）か、無ければ色で描く天体の id */
  id: string
  color: string
  /** 見かけの直径（度） */
  angle: number
  el: number
  az: number
  /** 輪（土星）：見える開き具合（度。衛星は土星の赤道の上を回るので、ほとんど真横から見える） */
  ringOpen?: number
}

export type SurfaceDef = {
  id: string
  ground: string
  ground2: string
  rock: string
  /** クレーターのふちの明るい噴出物 */
  ejecta?: string
  relief: Relief
  /** 空の色（大気が無ければ null で黒い空） */
  sky: { zenith: string; horizon: string } | null
  /** もやの濃さ（0〜1）と色 */
  haze: number
  hazeColor: string
  /** 厚い雲やもやで、太陽の形が見えない */
  sunHidden?: boolean
  /** 星の見え方（0〜1） */
  stars: number
  sunEl: number
  sunAz: number
  /** 降りるときに砂ぼこりが舞う */
  dust: boolean
  /** 重力（地球 = 1）、気温（℃） */
  gravity: number
  temp: [number, number]
  /** 太陽からの距離（au）。太陽の見かけの大きさと明るさに使う */
  au: number
  /** 天体の半径（km）。小さな天体ほど地平線が丸く近い */
  radiusKm: number
  skyBody?: SkyBody
  extras?: ('plumes' | 'volcano' | 'geysers' | 'clouds')[]
  note: [string, string]
  skyNote?: [string, string]
}

type Base = Omit<SurfaceDef, 'id' | 'au' | 'radiusKm' | 'skyBody' | 'note' | 'gravity' | 'temp'>

const airless = (ground: string, ground2: string, rock: string, relief: Partial<Relief> = {}, extra: Partial<Base> = {}): Base => ({
  ground,
  ground2,
  rock,
  ejecta: undefined,
  relief: { hills: 14, hillScale: 420, craters: 0.6, craterMax: 160, rocks: 0.5, ...relief },
  sky: null,
  haze: 0,
  hazeColor: '#000000',
  stars: 1,
  sunEl: 24,
  sunAz: 150,
  dust: true,
  ...extra,
})

const BASE: Record<string, Base> = {
  mercury: airless('#8c867e', '#6f6a64', '#5a5550', { craters: 0.75, craterMax: 220, hills: 20 }, { ejecta: '#a9a39a', sunEl: 14 }),
  venus: {
    ground: '#8a6c48', ground2: '#5e4a34', rock: '#4a3d30',
    relief: { hills: 10, hillScale: 600, craters: 0.02, craterMax: 60, rocks: 0.7, mountains: 260 },
    sky: { zenith: '#8a5a1e', horizon: '#c9862e' }, haze: 0.75, hazeColor: '#b9772c', sunHidden: true, stars: 0,
    sunEl: 50, sunAz: 150, dust: false,
  },
  earth: {
    ground: '#5d7a3a', ground2: '#7d8a4a', rock: '#7c776e',
    relief: { hills: 18, hillScale: 500, craters: 0, craterMax: 0, rocks: 0.15, mountains: 420 },
    sky: { zenith: '#2f6fd6', horizon: '#b9d6f2' }, haze: 0.25, hazeColor: '#c9dcf0', stars: 0,
    sunEl: 38, sunAz: 150, dust: false, extras: ['clouds'],
  },
  moon: airless('#8e8b86', '#6f6c68', '#5d5a56', { craters: 0.8, craterMax: 200, hills: 16, mountains: 300 }, { ejecta: '#b3afa8' }),
  mars: {
    ground: '#a5582c', ground2: '#7d4220', rock: '#4f3426',
    relief: { hills: 12, hillScale: 380, craters: 0.15, craterMax: 90, rocks: 0.85, mountains: 380 },
    sky: { zenith: '#b88a62', horizon: '#e0b48a' }, haze: 0.35, hazeColor: '#d4a07a', stars: 0.05,
    sunEl: 24, sunAz: 150, dust: true,
  },
  phobos: airless('#5f554c', '#4a423b', '#3f3832', { craters: 0.7, craterMax: 120, hills: 8, rocks: 0.6 }),
  deimos: airless('#7b6e60', '#665b4f', '#4f463e', { craters: 0.35, craterMax: 80, hills: 6, rocks: 0.25 }),
  io: {
    ...airless('#c9b24a', '#a9822e', '#3b3128', { craters: 0, craterMax: 0, hills: 10, rocks: 0.3, mountains: 520 }),
    ground2: '#c97a2a', ejecta: '#e8dfa0', extras: ['volcano'],
  },
  europa: airless('#cdbfa7', '#b5a07e', '#9b8f7d', { craters: 0.04, craterMax: 50, hills: 6, rocks: 0.35, cracks: 0.9 }, { ejecta: '#e9e4da' }),
  ganymede: airless('#8d8478', '#b2a998', '#6d665c', { craters: 0.45, craterMax: 160, hills: 12, cracks: 0.4 }, { ejecta: '#cfc7b8' }),
  callisto: airless('#5b5348', '#463f37', '#3a342e', { craters: 0.95, craterMax: 190, hills: 12 }, { ejecta: '#c7c0b4' }),
  mimas: airless('#a9a7a3', '#8f8d89', '#7b7976', { craters: 0.9, craterMax: 180 }),
  enceladus: airless('#e9eef4', '#cfd8e2', '#b9c3cf', { craters: 0.15, craterMax: 70, hills: 8, cracks: 0.8, rocks: 0.2 }, { extras: ['plumes'], dust: false }),
  tethys: airless('#c9c7c3', '#b1afab', '#9a9894', { craters: 0.75, craterMax: 170 }),
  dione: airless('#bdbdbd', '#9e9e9e', '#8a8a8a', { craters: 0.65, craterMax: 160, cracks: 0.25 }),
  rhea: airless('#b5b3b0', '#9a9894', '#878581', { craters: 0.85, craterMax: 180 }),
  titan: {
    ground: '#a07038', ground2: '#6e5030', rock: '#d8c49a',
    relief: { hills: 8, hillScale: 500, craters: 0.02, craterMax: 50, rocks: 0.45, dunes: 5 },
    sky: { zenith: '#a8692a', horizon: '#d99a4a' }, haze: 0.8, hazeColor: '#c98a3c', sunHidden: true, stars: 0,
    sunEl: 30, sunAz: 150, dust: false,
  },
  iapetus: airless('#d8d2c4', '#3a2f26', '#6f665a', { craters: 0.8, craterMax: 190, mountains: 600 }),
  miranda: airless('#a8a49e', '#8f8b85', '#77736e', { craters: 0.35, craterMax: 100, cracks: 0.5, mountains: 700 }),
  ariel: airless('#b8b4ad', '#9d9993', '#86827c', { craters: 0.45, craterMax: 120, cracks: 0.35 }),
  umbriel: airless('#5f5c58', '#4b4845', '#3e3c39', { craters: 0.9, craterMax: 170 }, { ejecta: '#9a958e' }),
  titania: airless('#9e968d', '#857e76', '#6f6962', { craters: 0.6, craterMax: 150, cracks: 0.25 }),
  oberon: airless('#8f857b', '#766d64', '#625a52', { craters: 0.8, craterMax: 170 }),
  proteus: airless('#58544f', '#46433f', '#3b3835', { craters: 0.7, craterMax: 110, rocks: 0.4 }),
  triton: airless('#c9b2a6', '#a8968c', '#8c7d75', { craters: 0.08, craterMax: 50, hills: 6, cracks: 0.4, rocks: 0.2 }, {
    sky: { zenith: '#000000', horizon: '#1a2033' }, haze: 0.08, hazeColor: '#3a4660', extras: ['geysers'], dust: false,
  }),
  pluto: airless('#d9c9b0', '#b78f6a', '#8a6c52', { craters: 0.1, craterMax: 70, hills: 6, rocks: 0.25, mountains: 900 }, {
    sky: { zenith: '#000000', horizon: '#24345c' }, haze: 0.12, hazeColor: '#3d5590', dust: false,
  }),
  charon: airless('#a9a39b', '#8e8780', '#77716a', { craters: 0.55, craterMax: 140, cracks: 0.3 }),
}

// 重力（地球 = 1）と気温（℃：低い〜高い）
const PHYS: Record<string, [number, [number, number]]> = {
  mercury: [0.38, [-170, 430]], venus: [0.9, [460, 470]], earth: [1, [-10, 30]], moon: [0.165, [-170, 120]],
  mars: [0.38, [-110, 20]], phobos: [0.0006, [-110, -5]], deimos: [0.0003, [-110, -20]],
  io: [0.183, [-160, -130]], europa: [0.134, [-220, -150]], ganymede: [0.146, [-200, -120]], callisto: [0.126, [-190, -110]],
  mimas: [0.0065, [-210, -180]], enceladus: [0.0115, [-240, -190]], tethys: [0.015, [-210, -185]], dione: [0.0237, [-210, -185]],
  rhea: [0.0269, [-220, -175]], titan: [0.138, [-180, -178]], iapetus: [0.0228, [-230, -140]],
  miranda: [0.0079, [-220, -185]], ariel: [0.0274, [-220, -185]], umbriel: [0.0234, [-220, -190]], titania: [0.0385, [-220, -190]],
  oberon: [0.0354, [-220, -190]], proteus: [0.007, [-225, -215]], triton: [0.0794, [-238, -230]],
  pluto: [0.063, [-240, -218]], charon: [0.0294, [-240, -215]],
}

const NOTES: Record<string, [string, string]> = {
  mercury: ['昼は約430℃、夜は約−170℃。大気がほとんど無いので、熱が逃げてしまいます。', 'About 430 °C by day and −170 °C at night: with almost no air, the heat escapes.'],
  venus: ['気圧は地球の約90倍、気温は約460℃。厚い雲で太陽は見えず、昼でもオレンジ色の薄暗さです。', 'The air is 90 times thicker than Earth’s and about 460 °C. Thick clouds hide the Sun.'],
  earth: ['わたしたちの星。青い空は、空気が太陽の青い光を散らしているからです。', 'Our home. The sky is blue because air scatters the Sun’s blue light.'],
  moon: ['重力は地球の約6分の1。風が無いので、アポロの宇宙飛行士の足あとは今も残っています。', 'Gravity is about 1/6 of Earth’s. With no wind, the Apollo footprints are still there.'],
  mars: ['空は昼は黄土色、夕方は青くなります。細かい砂ぼこりが光を散らすからです。', 'The sky is butterscotch by day and turns blue at sunset, because of fine dust in the air.'],
  phobos: ['火星にとても近く、いつか火星に落ちるか、くだけて輪になると考えられています。', 'So close to Mars that it will one day crash into it or break up into a ring.'],
  deimos: ['重力がとても弱く、思い切りジャンプすると宇宙へ飛んでいってしまうほどです。', 'Gravity is so weak that a hard jump could send you off into space.'],
  io: ['太陽系でいちばん火山が活発な星。硫黄の噴煙が数百 km の高さまで上がります。', 'The most volcanic world in the Solar System. Sulfur plumes rise hundreds of km high.'],
  europa: ['氷の下に、地球の海より多い水の海があると考えられています。茶色の筋は氷の割れ目です。', 'Under the ice there may be more water than in all of Earth’s oceans. The brown lines are cracks.'],
  ganymede: ['太陽系でいちばん大きな衛星で、水星より大きいくらい。自分の磁場を持っています。', 'The largest moon in the Solar System, bigger than Mercury, with its own magnetic field.'],
  callisto: ['太陽系でいちばんクレーターだらけの星のひとつ。40億年ほとんど変わっていません。', 'One of the most cratered worlds. Its surface has barely changed in 4 billion years.'],
  mimas: ['自分の大きさの3分の1もある巨大なクレーター「ハーシェル」があります。', 'It has a giant crater, Herschel, a third as wide as the moon itself.'],
  enceladus: ['南極から氷の粒の噴水が宇宙へ吹き出し、土星の E 環になっています。', 'Fountains of ice grains spray from its south pole and feed Saturn’s E ring.'],
  tethys: ['ほとんど水の氷でできた星。長さ2000 km の大峡谷があります。', 'Made almost entirely of water ice, with a canyon 2,000 km long.'],
  dione: ['明るい氷の崖の筋が、何百 km も続いています。', 'Bright cliffs of ice run for hundreds of kilometres.'],
  rhea: ['土星で2番目に大きな衛星。古いクレーターにおおわれています。', 'Saturn’s second largest moon, covered in old craters.'],
  titan: ['地球より厚い大気があり、メタンの雨が降り、川や湖があります。地面の丸い石は水の氷です。', 'Its air is thicker than Earth’s. Methane rain fills rivers and lakes; the round pebbles are water ice.'],
  iapetus: ['半分が雪のように白く、半分が炭のように黒い、ふしぎな2色の星です。', 'One half is white as snow and the other dark as coal: a two-toned moon.'],
  miranda: ['高さ約20 km の崖「ヴェローナ断崖」があります。落ちたら10分以上かかります。', 'It has Verona Rupes, a cliff about 20 km high. A fall would take over 10 minutes.'],
  ariel: ['天王星の衛星でいちばん明るく、若い地表を持っています。', 'The brightest of Uranus’s moons, with a young surface.'],
  umbriel: ['天王星の衛星でいちばん暗い星。古いクレーターだらけです。', 'The darkest of Uranus’s moons, covered in old craters.'],
  titania: ['天王星でいちばん大きな衛星。長い谷が地表を走っています。', 'Uranus’s largest moon, crossed by long valleys.'],
  oberon: ['天王星の衛星でいちばん外側を回る、古いクレーターの星です。', 'The outermost large moon of Uranus, old and cratered.'],
  proteus: ['とても暗く、丸くなりきれなかったくらいの大きさの星です。', 'Very dark, and only just too small to pull itself into a ball.'],
  triton: ['海王星と逆向きに回る衛星。窒素の間欠泉が黒い煙を高さ8 km まで吹き上げます。', 'It orbits Neptune backwards. Nitrogen geysers shoot dark plumes 8 km high.'],
  pluto: ['窒素の氷の平原と、水の氷の山があります。空には青いもやの層が重なっています。', 'Plains of nitrogen ice and mountains of water ice, under layers of blue haze.'],
  charon: ['冥王星といつも同じ面を向け合っています。北極は赤茶色です。', 'Charon and Pluto always show each other the same face. Its north pole is reddish.'],
}

const SKY_NOTES: Record<string, [string, string]> = {
  moon: ['地球は空のほぼ同じ場所にとどまり、満ち欠けしながら回ります。', 'Earth stays in almost the same spot in the sky, going through phases.'],
  io: ['木星が空の大きな部分を占めています。満月の約40倍の大きさです。', 'Jupiter fills a huge part of the sky: about 40 times wider than the full Moon looks from Earth.'],
  europa: ['木星が満月の約20倍の大きさに見えます。', 'Jupiter looks about 20 times wider than the full Moon.'],
  phobos: ['火星が空の大きな部分を占めています。', 'Mars fills a huge part of the sky.'],
  mimas: ['衛星は土星の赤道の上を回るので、輪はほとんど真横から見えて、細い線になります。', 'The moons orbit over Saturn’s equator, so the rings are seen edge-on as a thin line.'],
  enceladus: ['輪はほとんど真横から見えて、細い線になります。', 'The rings are seen almost edge-on, as a thin line.'],
  iapetus: ['軌道が傾いているので、ここからは土星の輪が開いて見えます。', 'Its tilted orbit lets you see Saturn’s rings open.'],
  titan: ['もやが厚くて、土星も太陽もぼんやりした明るさにしか見えません。', 'The haze is so thick that Saturn and the Sun are only a dim glow.'],
  venus: ['雲が厚くて、太陽はどこにあるのかわかりません。', 'The clouds are so thick you cannot tell where the Sun is.'],
  pluto: ['空にはカロンが、いつも同じ場所に浮かんでいます。', 'Charon hangs in the same place in the sky, always.'],
  charon: ['冥王星が空のいつも同じ場所に浮かんでいます。', 'Pluto hangs in the same place in Charon’s sky, always.'],
  earth: ['昼間の空に、うっすらと月が見えています。', 'The Moon is faintly visible in the daytime sky.'],
}

const SATURN_MOON_TILT: Record<string, number> = { iapetus: 15 }

const deg = (rad: number) => (rad * 180) / Math.PI

function build(): Map<string, SurfaceDef> {
  const out = new Map<string, SurfaceDef>()
  for (const p of PLANETS) {
    const gas = ['jupiter', 'saturn', 'uranus', 'neptune'].includes(p.id)
    const entries: { id: string; radiusKm: number; sky?: SkyBody }[] = []
    if (!gas) {
      // 惑星の空に浮かぶ衛星：地球の月、冥王星のカロン
      const m = p.moons[0]
      const sky = p.id === 'earth' || p.id === 'pluto'
        ? { id: m.id, color: m.color, angle: deg(2 * Math.atan(m.radiusKm / m.distanceKm)), el: 34, az: -30 }
        : undefined
      entries.push({ id: p.id, radiusKm: p.radiusKm, sky })
    }
    for (const m of p.moons) {
      const angle = deg(2 * Math.atan(p.radiusKm / m.distanceKm))
      const ringOpen = p.ring ? (SATURN_MOON_TILT[m.id] ?? 2) : undefined
      // 大きく見えるほど低めに置いて、地平線と一緒に入るように
      const el = Math.min(32, 12 + angle * 0.45)
      entries.push({ id: m.id, radiusKm: m.radiusKm, sky: { id: p.id, color: p.color, angle, el, az: -18, ringOpen } })
    }
    for (const e of entries) {
      const base = BASE[e.id]
      const phys = PHYS[e.id]
      if (!base || !phys) continue
      out.set(e.id, {
        ...base,
        id: e.id,
        au: p.distanceAu,
        radiusKm: e.radiusKm,
        gravity: phys[0],
        temp: phys[1],
        skyBody: e.sky,
        note: NOTES[e.id] ?? ['', ''],
        skyNote: SKY_NOTES[e.id],
      })
    }
  }
  return out
}

export const SURFACES = build()

export const surfaceFor = (id: string) => SURFACES.get(id) ?? null
