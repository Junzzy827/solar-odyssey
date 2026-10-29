// テクスチャは Solar System Scope（CC BY 4.0）の 2K 版を public/textures/ に置く。
// ファイルが無い天体は bodies.ts の色で描画する。

const base = `${import.meta.env.BASE_URL}textures/`

export const TEXTURES: Record<string, string> = {
  sun: '2k_sun.jpg',
  mercury: '2k_mercury.jpg',
  venus: '2k_venus_atmosphere.jpg',
  earth: '2k_earth_daymap.jpg',
  earthNight: '2k_earth_nightmap.jpg',
  earthClouds: '2k_earth_clouds.jpg',
  moon: '2k_moon.jpg',
  mars: '2k_mars.jpg',
  jupiter: '2k_jupiter.jpg',
  saturn: '2k_saturn.jpg',
  saturnRing: '2k_saturn_ring_alpha.png',
  uranus: '2k_uranus.jpg',
  neptune: '2k_neptune.jpg',
  milkyWay: '2k_stars_milky_way.jpg',
}

export const textureUrl = (key: string) => (TEXTURES[key] ? base + TEXTURES[key] : undefined)
