// ISS の見本（?iss=sample）をアプリの中で撮って、重さを測る。
//   npm run build && npx vite preview --port 5201 --strictPort &
//   node tools/iss/capture.mjs [--phone] [--out DIR] [--url http://localhost:5201/]
// 撮る：s1-app-<名前>.jpg（PC 1280×720 / スマホ 390×844）。重さ：weight-<pc|phone>.json
//   ダウンロード … ISS に入ってから読んだもの（models/iss/ と地球の絵）。ISS に入る前の宇宙の場面の分は数えない
//   テクスチャのメモリ … __sv.iss.texMemory()（部屋の絵と焼いた光）＋ 窓の地球の絵（2k の昼と雲、幅×高さ×4×4/3）
//   描画の数 … __sv.iss.debug.frame（部屋と窓の地球の 2 回をまとめた 1 コマ分）
import { chromium, devices } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const phone = args.includes('--phone')
const out = opt('--out', '/tmp/iss-work/app')
const url = opt('--url', 'http://localhost:5201/')
const only = opt('--only', '')
mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 撮る場所 [x, y, z, yaw, pitch]（three の座標 m。前は −Z、yaw 0 で前を見る）
const VIEWS = phone
  ? {
      'phone-enter': null,
      'phone-water': [0.05, 0.1, -3.4, 0.25, -0.05],
      'phone-window': 'window',
    }
  : {
      enter: null,
      aft: [0, 0.1, -9.6, Math.PI, 0],
      water: [0.05, 0.15, -3.5, 0.3, -0.05],
      bike: [0.35, 0.1, -6.2, 0.9, -0.35],
      window: 'window',
      drifters: [0, 0.0, -4.6, 0, 0.05],
      ceiling: [0, -0.2, -6.2, 0, 0.9],
      hatch: [0, 0.05, -9.2, 0, 0],
    }

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } })
await ctx.addInitScript(() => {
  if (!localStorage.getItem('solar-voyager:settings')) localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja', music: false, muted: true }))
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
const bytes = { iss: 0, earth: 0, other: 0 }
const files = []
let counting = false
page.on('response', async (r) => {
  if (!counting) return
  const u = r.url()
  try {
    const b = (await r.body()).length
    const k = u.includes('/models/iss/') ? 'iss' : /earth|clouds/.test(u) ? 'earth' : 'other'
    bytes[k] += b
    files.push([u.replace(/^.*?\/\/[^/]+\//, ''), b])
  } catch {
    // 本体の無い返事（リダイレクトなど）
  }
})
// ISS に入る前の分は数えない：#debug で起動してから、手で開く
await page.goto(`${url}#debug`)
await page.waitForFunction(() => !document.getElementById('boot') && window.__sv?.iss, null, { timeout: 240000, polling: 500 })
await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'high' }))
await sleep(2000)
counting = true
const t0 = Date.now()
await page.evaluate(() => window.__sv.iss.open())
await page.waitForFunction(() => window.__sv.iss.state.getState().phase === 'inside' && window.__sv.iss.debug.loaded, null, { timeout: 240000, polling: 500 })
const loadSec = (Date.now() - t0) / 1000
await sleep(4000)
await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'high' }))
counting = false

const stats = []
for (const [name, at] of Object.entries(VIEWS)) {
  if (only && !only.split(',').includes(name)) continue
  if (at === 'window') {
    await page.evaluate(() => window.__sv.iss.play('window'))
    await sleep(9000)
  } else {
    await page.evaluate(() => window.__sv.iss.play(null))
    if (at) await page.evaluate((at) => (window.__sv.iss.debug.goto = at), at)
    await sleep(name.endsWith('enter') ? 1500 : 5000)
  }
  const f = await page.evaluate(() => ({ ...window.__sv.iss.debug.frame }))
  stats.push({ name, ...f })
  await page.screenshot({ path: join(out, `s1-app-${name}.jpg`), type: 'jpeg', quality: 86, timeout: 180000 })
  console.log('shot', name, JSON.stringify(f))
}
await page.evaluate(() => window.__sv.iss.play(null))

const mem = await page.evaluate(() => {
  const roomMem = window.__sv.iss.texMemory()
  const tex = window.__sv.iss.tex()
  // 地球の絵（読み込んだ <img> の大きさから）
  const earth = [...performance.getEntriesByType('resource')].filter((e) => /2k_earth_(daymap|clouds)/.test(e.name)).map((e) => e.name)
  return { roomMem, tex, earth }
})
const earthImgs = await page.evaluate(async (names) => {
  const out = []
  for (const n of names) {
    const im = new Image()
    im.src = n
    await im.decode().catch(() => {})
    out.push([n.replace(/^.*\//, ''), im.naturalWidth, im.naturalHeight])
  }
  return out
}, mem.earth)
const earthMem = earthImgs.reduce((a, [, w, h]) => a + (w * h * 4 * 4) / 3, 0)
const report = {
  device: phone ? 'phone 390x844' : 'pc 1280x720',
  loadSec,
  download: { issMB: bytes.iss / 1e6, earthMB: bytes.earth / 1e6, otherMB: bytes.other / 1e6 },
  texMemory: { roomMB: mem.roomMem / 1e6, earthMB: earthMem / 1e6, earthImgs },
  frames: stats,
  maxCalls: Math.max(...stats.map((s) => s.calls)),
  maxTriangles: Math.max(...stats.map((s) => s.triangles)),
  tex: mem.tex,
  files,
}
writeFileSync(join(out, `weight-${phone ? 'phone' : 'pc'}.json`), JSON.stringify(report, null, 1))
console.log(JSON.stringify({ ...report, files: files.length, tex: undefined }, null, 1))
await browser.close()
