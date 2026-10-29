// 天体データ（NASA Planetary Fact Sheet の概数）
// distanceAu: 太陽からの平均距離 / orbitDays: 公転周期 / rotationHours: 自転周期（負は逆回転）

export type Moon = {
  id: string
  name: string
  radiusKm: number
  orbitDays: number
  color: string
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
  moons: Moon[]
}

export const SUN = { name: '太陽', radiusKm: 696_340, color: '#ffcc66' }

export const PLANETS: Planet[] = [
  { id: 'mercury', name: '水星', radiusKm: 2_440, distanceAu: 0.39, orbitDays: 88, rotationHours: 1_408, tiltDeg: 0, color: '#9c9890', moons: [] },
  { id: 'venus', name: '金星', radiusKm: 6_052, distanceAu: 0.72, orbitDays: 225, rotationHours: -5_833, tiltDeg: 177, color: '#e3c58f', atmosphere: '#f3d9a0', moons: [] },
  {
    id: 'earth', name: '地球', radiusKm: 6_371, distanceAu: 1.0, orbitDays: 365.25, rotationHours: 23.9, tiltDeg: 23.4, color: '#3a7bd5', atmosphere: '#5aa9ff',
    moons: [{ id: 'moon', name: '月', radiusKm: 1_737, orbitDays: 27.3, color: '#bbbbbb' }],
  },
  { id: 'mars', name: '火星', radiusKm: 3_390, distanceAu: 1.52, orbitDays: 687, rotationHours: 24.6, tiltDeg: 25.2, color: '#c1440e', atmosphere: '#e8a07a', moons: [] },
  {
    id: 'jupiter', name: '木星', radiusKm: 69_911, distanceAu: 5.2, orbitDays: 4_333, rotationHours: 9.9, tiltDeg: 3.1, color: '#d8b48a', atmosphere: '#e6cfa8',
    moons: [
      { id: 'io', name: 'イオ', radiusKm: 1_822, orbitDays: 1.77, color: '#e8d34f' },
      { id: 'europa', name: 'エウロパ', radiusKm: 1_561, orbitDays: 3.55, color: '#d9cdb8' },
      { id: 'ganymede', name: 'ガニメデ', radiusKm: 2_634, orbitDays: 7.15, color: '#a39a8c' },
      { id: 'callisto', name: 'カリスト', radiusKm: 2_410, orbitDays: 16.7, color: '#6e6559' },
    ],
  },
  {
    id: 'saturn', name: '土星', radiusKm: 58_232, distanceAu: 9.58, orbitDays: 10_759, rotationHours: 10.7, tiltDeg: 26.7, color: '#e3d3a4', atmosphere: '#efe0b0',
    ring: { inner: 1.25, outer: 2.3, color: '#cbb994' },
    moons: [
      { id: 'enceladus', name: 'エンケラドゥス', radiusKm: 252, orbitDays: 1.37, color: '#f4f8ff' },
      { id: 'dione', name: 'ディオネ', radiusKm: 561, orbitDays: 2.74, color: '#d8d8d8' },
      { id: 'rhea', name: 'レア', radiusKm: 764, orbitDays: 4.52, color: '#cccccc' },
      { id: 'titan', name: 'タイタン', radiusKm: 2_575, orbitDays: 15.9, color: '#d9a441' },
    ],
  },
  { id: 'uranus', name: '天王星', radiusKm: 25_362, distanceAu: 19.2, orbitDays: 30_687, rotationHours: -17.2, tiltDeg: 97.8, color: '#9fd8e0', atmosphere: '#a8e6ef', moons: [] },
  {
    id: 'neptune', name: '海王星', radiusKm: 24_622, distanceAu: 30.05, orbitDays: 60_190, rotationHours: 16.1, tiltDeg: 28.3, color: '#3f5fd1', atmosphere: '#5a7dff',
    moons: [{ id: 'triton', name: 'トリトン', radiusKm: 1_353, orbitDays: -5.88, color: '#c9bfb4' }],
  },
]
