// エール輝星星表（Yale Bright Star Catalog 第5版、約9,100個、6.5等星まで）から、背景の星のデータ public/stars/bsc5.bin を作る
// 使い方: npm run stars
// 元データ: Hoffleit & Warren (1991), NASA/ADC・ハーバード CfA 配布。JSON 化は brettonw/YaleBrightStarCatalog
//
// 1つの星 = Int16 × 5（10 バイト）：
//   x, y, z … アプリの座標での向き（×32767）。黄道面が XZ 平面、+Y が黄道の北、黄経 λ・黄緯 β は
//             (cosβ cosλ, sinβ, −cosβ sinλ)（state/probes.ts と同じ向き）
//   mag     … 実視等級 ×1000
//   temp    … 表面温度（K）。色に使う
import { mkdir, writeFile } from 'node:fs/promises'

const URL_JSON = 'https://raw.githubusercontent.com/brettonw/YaleBrightStarCatalog/master/bsc5-short.json'
const EPS = (23.4392911 * Math.PI) / 180 // J2000 の黄道傾斜角

const nums = (s) => (s.match(/[\d.]+/g) ?? []).map(Number)
const ra = (s) => {
  const [h, m, sec] = nums(s)
  return ((h + m / 60 + sec / 3600) * 15 * Math.PI) / 180
}
const dec = (s) => {
  const [d, m, sec] = nums(s)
  const v = ((d + m / 60 + sec / 3600) * Math.PI) / 180
  return s.trim().startsWith('-') ? -v : v
}

const stars = await (await fetch(URL_JSON)).json()
const out = []
for (const s of stars) {
  if (!s.RA || !s.Dec || !s.V) continue
  const a = ra(s.RA)
  const d = dec(s.Dec)
  // 赤道座標 → 黄道座標
  const qx = Math.cos(d) * Math.cos(a)
  const qy = Math.cos(d) * Math.sin(a)
  const qz = Math.sin(d)
  const ex = qx
  const ey = Math.cos(EPS) * qy + Math.sin(EPS) * qz
  const ez = -Math.sin(EPS) * qy + Math.cos(EPS) * qz
  // 黄道座標 → アプリの座標
  out.push([ex, ez, -ey, Number(s.V), Number(s.K) || 6000])
}
// 明るい順（軽い画質では先頭だけ使う）
out.sort((p, q) => p[3] - q[3])
const buf = new Int16Array(out.length * 5)
out.forEach(([x, y, z, v, k], i) => {
  buf.set([Math.round(x * 32767), Math.round(y * 32767), Math.round(z * 32767), Math.round(v * 1000), Math.min(32767, Math.round(k))], i * 5)
})
const dir = new URL('../public/stars/', import.meta.url)
await mkdir(dir, { recursive: true })
await writeFile(new URL('bsc5.bin', dir), Buffer.from(buf.buffer))
console.log(`${out.length} stars, brightest V=${out[0][3]}`)
