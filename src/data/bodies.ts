// 天体データ（NASA Planetary Fact Sheet の概数）
// distanceAu: 太陽からの平均距離 / orbitDays: 公転周期 / rotationHours: 自転周期（負は逆回転）

export type Moon = {
  id: string
  name: string
  radiusKm: number
  orbitDays: number
  /** 惑星の中心からの平均距離（km） */
  distanceKm: number
  color: string
  /** 丸くない小さな衛星の形（長い軸を1とした3軸の比） */
  shape?: [number, number, number]
}

export type Planet = {
  id: string
  name: string
  radiusKm: number
  distanceAu: number
  orbitDays: number
  rotationHours: number
  tiltDeg: number
  color: string
  ring?: { inner: number; outer: number; color: string }
  /** 大気グローの色 */
  atmosphere?: string
  /** 準惑星（冥王星） */
  dwarf?: boolean
  /** 軌道の傾き（度）。惑星はほぼ同じ平面を回るので、大きく傾いた冥王星だけ */
  inclinationDeg?: number
  /** 傾いた軌道が太陽系の面を南から北へ横切る向き（昇交点の黄経、度） */
  nodeDeg?: number
  /** 衛星が赤道の上でなく、公転の面に近いところを回る（地球の月） */
  moonsInOrbitPlane?: boolean
  /** 自転が一つ目の衛星の公転とそろっていて、いつも同じ面を向け合う（冥王星とカロン） */
  lockedToMoon?: boolean
  moons: Moon[]
}

export const SUN = { name: '太陽', radiusKm: 696_340, color: '#ffcc66' }

export const PLANETS: Planet[] = [
  { id: 'mercury', name: '水星', radiusKm: 2_440, distanceAu: 0.39, orbitDays: 88, rotationHours: 1_408, tiltDeg: 0, color: '#9c9890', moons: [] },
  { id: 'venus', name: '金星', radiusKm: 6_052, distanceAu: 0.72, orbitDays: 225, rotationHours: -5_833, tiltDeg: 177, color: '#e3c58f', atmosphere: '#f3d9a0', moons: [] },
  {
    id: 'earth', name: '地球', radiusKm: 6_371, distanceAu: 1.0, orbitDays: 365.25, rotationHours: 23.9, tiltDeg: 23.4, color: '#3a7bd5', atmosphere: '#5aa9ff', moonsInOrbitPlane: true,
    moons: [{ id: 'moon', name: '月', radiusKm: 1_737, orbitDays: 27.3, distanceKm: 384_400, color: '#bbbbbb' }],
  },
  {
    id: 'mars', name: '火星', radiusKm: 3_390, distanceAu: 1.52, orbitDays: 687, rotationHours: 24.6, tiltDeg: 25.2, color: '#c1440e', atmosphere: '#e8a07a',
    moons: [
      { id: 'phobos', name: 'フォボス', radiusKm: 11.1, orbitDays: 0.319, distanceKm: 9_376, color: '#7a6a5c', shape: [1, 0.82, 0.67] },
      { id: 'deimos', name: 'ダイモス', radiusKm: 6.2, orbitDays: 1.263, distanceKm: 23_463, color: '#8f8070', shape: [1, 0.8, 0.73] },
    ],
  },
  {
    id: 'jupiter', name: '木星', radiusKm: 69_911, distanceAu: 5.2, orbitDays: 4_333, rotationHours: 9.9, tiltDeg: 3.1, color: '#d8b48a', atmosphere: '#e6cfa8',
    moons: [
      { id: 'io', name: 'イオ', radiusKm: 1_822, orbitDays: 1.77, distanceKm: 421_700, color: '#e8d34f' },
      { id: 'europa', name: 'エウロパ', radiusKm: 1_561, orbitDays: 3.55, distanceKm: 671_034, color: '#d9cdb8' },
      { id: 'ganymede', name: 'ガニメデ', radiusKm: 2_634, orbitDays: 7.15, distanceKm: 1_070_412, color: '#a39a8c' },
      { id: 'callisto', name: 'カリスト', radiusKm: 2_410, orbitDays: 16.7, distanceKm: 1_882_709, color: '#6e6559' },
    ],
  },
  {
    id: 'saturn', name: '土星', radiusKm: 58_232, distanceAu: 9.58, orbitDays: 10_759, rotationHours: 10.7, tiltDeg: 26.7, color: '#e3d3a4', atmosphere: '#efe0b0',
    ring: { inner: 1.25, outer: 2.3, color: '#cbb994' },
    moons: [
      { id: 'mimas', name: 'ミマス', radiusKm: 198, orbitDays: 0.942, distanceKm: 185_539, color: '#c8c6c2' },
      { id: 'enceladus', name: 'エンケラドゥス', radiusKm: 252, orbitDays: 1.37, distanceKm: 237_948, color: '#f4f8ff' },
      { id: 'tethys', name: 'テティス', radiusKm: 531, orbitDays: 1.89, distanceKm: 294_619, color: '#e6e4df' },
      { id: 'dione', name: 'ディオネ', radiusKm: 561, orbitDays: 2.74, distanceKm: 377_396, color: '#d8d8d8' },
      { id: 'rhea', name: 'レア', radiusKm: 764, orbitDays: 4.52, distanceKm: 527_108, color: '#cccccc' },
      { id: 'titan', name: 'タイタン', radiusKm: 2_575, orbitDays: 15.9, distanceKm: 1_221_870, color: '#d9a441' },
      { id: 'iapetus', name: 'イアペトゥス', radiusKm: 735, orbitDays: 79.3, distanceKm: 3_560_820, color: '#e2ddd2' },
    ],
  },
  {
    id: 'uranus', name: '天王星', radiusKm: 25_362, distanceAu: 19.2, orbitDays: 30_687, rotationHours: -17.2, tiltDeg: 97.8, color: '#9fd8e0', atmosphere: '#a8e6ef',
    moons: [
      { id: 'miranda', name: 'ミランダ', radiusKm: 236, orbitDays: 1.41, distanceKm: 129_390, color: '#bdbab4' },
      { id: 'ariel', name: 'アリエル', radiusKm: 579, orbitDays: 2.52, distanceKm: 191_020, color: '#c9c6c0' },
      { id: 'umbriel', name: 'ウンブリエル', radiusKm: 585, orbitDays: 4.14, distanceKm: 266_300, color: '#6f6c68' },
      { id: 'titania', name: 'ティタニア', radiusKm: 789, orbitDays: 8.71, distanceKm: 435_910, color: '#aaa39b' },
      { id: 'oberon', name: 'オベロン', radiusKm: 761, orbitDays: 13.46, distanceKm: 583_520, color: '#9b9087' },
    ],
  },
  {
    id: 'neptune', name: '海王星', radiusKm: 24_622, distanceAu: 30.05, orbitDays: 60_190, rotationHours: 16.1, tiltDeg: 28.3, color: '#3f5fd1', atmosphere: '#5a7dff',
    moons: [
      { id: 'proteus', name: 'プロテウス', radiusKm: 210, orbitDays: 1.12, distanceKm: 117_647, color: '#5e5a56', shape: [1, 0.9, 0.85] },
      { id: 'triton', name: 'トリトン', radiusKm: 1_353, orbitDays: -5.88, distanceKm: 354_759, color: '#c9bfb4' },
    ],
  },
  {
    id: 'pluto', name: '冥王星', radiusKm: 1_188, distanceAu: 39.48, orbitDays: 90_560, rotationHours: -153.3, tiltDeg: 122.5, color: '#c7a585', dwarf: true, inclinationDeg: 17.1, nodeDeg: 110.3, lockedToMoon: true,
    moons: [{ id: 'charon', name: 'カロン', radiusKm: 606, orbitDays: 6.39, distanceKm: 19_591, color: '#a9a39b' }],
  },
]
