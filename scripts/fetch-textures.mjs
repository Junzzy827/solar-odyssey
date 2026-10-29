// Solar System Scope（CC BY 4.0）から 2K テクスチャを public/textures/ に取得する
// 使い方: npm run textures
import { mkdir, writeFile, access } from 'node:fs/promises'

const files = [
  '2k_sun.jpg',
  '2k_mercury.jpg',
  '2k_venus_atmosphere.jpg',
  '2k_earth_daymap.jpg',
  '2k_earth_nightmap.jpg',
  '2k_earth_clouds.jpg',
  '2k_moon.jpg',
  '2k_mars.jpg',
  '2k_jupiter.jpg',
  '2k_saturn.jpg',
  '2k_saturn_ring_alpha.png',
  '2k_uranus.jpg',
  '2k_neptune.jpg',
  '2k_stars_milky_way.jpg',
]

const dir = new URL('../public/textures/', import.meta.url)
await mkdir(dir, { recursive: true })

for (const name of files) {
  const dest = new URL(name, dir)
  try {
    await access(dest)
    console.log(`skip ${name}`)
    continue
  } catch {}
  const res = await fetch(`https://www.solarsystemscope.com/textures/download/${name}`)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
  console.log(`saved ${name}`)
}
