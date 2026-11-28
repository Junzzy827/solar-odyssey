// 段階 2：ISS の見本（?iss=sample）をアプリの中で撮って、重さを測る。
//   npx vite --port 5201 --strictPort &            （または npm run build && npx vite preview --port 5201 --strictPort）
//   node tools/iss/capture_s2.mjs [--phone] [--out DIR] [--url http://localhost:5201/] [--only node2,cupola]
// PC（1280×720）：部屋ごとの見本 s2-<部屋>.jpg と、重さ weight-s2-pc.json
// スマホ（390×844）：s2-phone-<名前>.jpg と、重さ weight-s2-phone.json
// 重さ：
//   はじめの部屋のダウンロード … ISS を開いてから、はじめの部屋が見えるまでに読んだもの（形・絵・ISS のプログラム。宇宙の場面と、ほかの場面の先読みの分は数えない）
//   テクスチャのメモリ … 撮る場所ごとに __sv.iss.texMemory()（部屋の絵と焼いた光）＋窓の地球の絵。いちばん大きい所
//   描画の数・三角形 … __sv.iss.debug.frame（部屋と窓の地球の 2 回をまとめた 1 コマ分）。いちばん大きい所
//   ステーション全部のダウンロード … station.json から（形・光の絵 near/far・色の絵 near/far、全部の部屋を回ったとき）
//   いちばん長いコマ … 部屋を読んでいるあいだ（SwiftShader なので本物の GPU よりずっと遅い。くらべる用）
import { chromium, devices } from 'playwright'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const phone = args.includes('--phone')
const out = opt('--out', '/tmp/iss-capture')
const url = opt('--url', 'http://localhost:5201/')
const only = opt('--only', '')
mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 撮る場所 [x, y, z, yaw, pitch]（three の座標 m。前は −Z、yaw 0 で前（−Z）を、π/2 で左舷（−X）を見る）
const H = Math.PI / 2
const PC_VIEWS = {
  us_lab: [0, 0.05, -2.75, 0, 0],
  // 水の玉と自転車（デスティニーの遊び）を近くで
  water: [0.05, 0.15, -3.5, 0.3, -0.05],
  bike: [0.35, 0.1, -6.2, 0.9, -0.35],
  node1: [0.95, 0.05, 0.25, H, -0.05],
  node2: [0, 0.05, -12.0, 0, 0],
  node3: [-2.7, 0.1, 0.35, H, -0.12],
  // キューポラ：窓の上から、下の地球を見る（手で置いた場所）
  cupola: [-6.43, -2.15, 0.25, 0.2, -1.2],
  airlock: [2.35, 0.1, 0.2, -H, -0.08],
  columbus: [2.45, 0.1, -14.75, -H, -0.05],
  // きぼう：実験室の入口から奥（左舷）へ。保管室：下から天井の旗と棚を見上げる（手で置いた場所）
  jpm: [-2.55, 0.15, -14.7, H + 0.08, -0.04],
  jlp: [-9.76, 3.4, -15.05, 1.37, 1.3],
  pmm: [-6.43, 0.1, -2.55, 0, -0.05],
  beam: [-6.43, 0.05, 2.2, Math.PI, -0.03],
  bishop: [-9.45, 0.05, 0.1, -H, 0],
}
const PHONE_VIEWS = {
  'phone-enter': null,
  'phone-harmony': [0, 0.05, -12.0, 0, 0],
  'phone-kibo': [-2.55, 0.15, -14.7, H + 0.08, -0.04],
  'phone-cupola': [-6.43, -2.15, 0.25, 0.2, -1.2],
  'phone-map': 'map',
}
const VIEWS = phone ? PHONE_VIEWS : PC_VIEWS

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } })
await ctx.addInitScript(() => {
  localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja', music: false, muted: true }))
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
const bytes = { iss: 0, earth: 0, code: 0, other: 0 }
const files = []
let counting = false
// アプリは起動の 12 秒あとに、ほかの場面（地表・EVA・歩き）を手すきのときに先読みする（LazyScenes）。
// ISS の重さに入らないように、それが終わってから数えはじめる
let prefetched = false
page.on('response', async (r) => {
  const u = r.url()
  if (/assets\/WalkView-[^/]*\.js/.test(u)) prefetched = true
  // blob: はネットから読んだものではない
  if (!counting || u.startsWith('blob:')) return
  try {
    const b = (await r.body()).length
    const k = u.includes('/models/iss/') ? 'iss' : /earth|clouds/.test(u) ? 'earth' : /\/assets\//.test(u) ? 'code' : 'other'
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
for (let i = 0; i < 120 && !prefetched; i++) await sleep(500)
await sleep(2000)
counting = true
const t0 = Date.now()
await page.evaluate(() => window.__sv.iss.open('us_lab'))
// はじめの部屋が見えた所で数えるのをやめる（そのすぐあとに、となりの部屋を読みはじめる）
await page.waitForFunction(() => window.__sv.iss.loaded().includes('us_lab'), null, { timeout: 240000, polling: 50 })
const loadSec = (Date.now() - t0) / 1000
const firstRoom = { ...bytes, files: files.length }
counting = false
const firstFiles = files.slice()
await page.waitForFunction(() => window.__sv.iss.state.getState().phase === 'inside' && window.__sv.iss.debug.loaded, null, { timeout: 240000, polling: 250 })
await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'high' }))
await sleep(3000)

/** 窓の地球の絵のメモリ（窓のある部屋 デスティニー・キューポラ が見えているときだけ作る）：昼と雲の 2 枚。スマホは 1024×512 に縮める */
const EARTH_MB = (2 * (phone ? 1024 * 512 : 2048 * 1024) * 4 * 4) / 3 / 1e6

const stats = []
for (const [name, at] of Object.entries(VIEWS)) {
  if (only && !only.split(',').includes(name)) continue
  if (at === 'map') {
    await page.click('.iss-map')
    await sleep(1500)
  } else if (at) {
    await page.evaluate((at) => (window.__sv.iss.debug.goto = at), at)
    await sleep(800)
    await page.waitForFunction(() => window.__sv.iss.debug.settled, null, { timeout: 300000, polling: 300 }).catch(() => console.log('not settled', name))
    // 入ったときの大きな名前が小さくなるまで
    await sleep(5000)
  } else {
    await sleep(1500)
  }
  const f = await page.evaluate(() => ({ ...window.__sv.iss.debug.frame, module: window.__sv.iss.state.getState().module, loaded: window.__sv.iss.loaded(), texMB: window.__sv.iss.texMemory() / 1e6 }))
  const e = f.loaded.some((m) => m === 'cupola' || m === 'us_lab') ? EARTH_MB : 0
  stats.push({ name, ...f, earthMB: e, totalMB: f.texMB + e })
  await page.screenshot({ path: join(out, `s2-${name}.jpg`), type: 'jpeg', quality: 86, timeout: 180000 })
  console.log('shot', name, JSON.stringify(stats[stats.length - 1]))
  if (at === 'map') await page.click('.iss-map-big')
}

// 全部の部屋を回ったときのダウンロード（station.json から、ディスクの大きさで）
const root = new URL('../../public/models/iss/', import.meta.url)
const station = JSON.parse(readFileSync(new URL('station.json', root)))
const plat = phone ? 'phone' : 'pc'
const size = (f) => {
  try {
    return statSync(new URL(f, root)).size
  } catch {
    return 0
  }
}
const seen = new Set()
let whole = size('station.json')
for (const m of station.modules) {
  whole += size(m.glb)
  for (const s of new Set(m.light[plat])) whole += size(`${m.id}.light.${s}.jpg`)
}
for (const [n, t] of Object.entries(station.textures)) {
  for (const s of new Set(t[plat])) {
    const f = `tex/${n}.${s}.webp`
    if (!seen.has(f)) whole += size(f)
    seen.add(f)
  }
}
const stream = await page.evaluate(() => ({ ...window.__sv.iss.debug.stream }))
const report = {
  device: phone ? 'phone 390x844' : 'pc 1280x720',
  loadSec,
  firstRoomMB: { iss: firstRoom.iss / 1e6, earth: firstRoom.earth / 1e6, code: firstRoom.code / 1e6, other: firstRoom.other / 1e6, total: (firstRoom.iss + firstRoom.earth + firstRoom.code + firstRoom.other) / 1e6, files: firstRoom.files },
  wholeStationMB: whole / 1e6,
  maxTexMB: Math.max(...stats.map((s) => s.totalMB)),
  maxCalls: Math.max(...stats.map((s) => s.calls)),
  maxTriangles: Math.max(...stats.map((s) => s.triangles)),
  stream,
  frames: stats,
  firstFiles,
}
writeFileSync(join(out, `weight-s2-${plat}.json`), JSON.stringify(report, null, 1))
console.log(JSON.stringify({ ...report, frames: undefined, firstFiles: undefined }, null, 1))
await browser.close()
