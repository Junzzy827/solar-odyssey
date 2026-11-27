// アプリの中の乗員室を撮る＋重さ（ダウンロード・描画の回数・三角形）を測る。dev サーバー（5202）を先に起動：
//   node tools/shuttle/capture.mjs <出力先> [desktop|phone]
import { chromium, devices } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
const out = process.argv[2]
const kind = process.argv[3] || 'desktop'
mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext(kind === 'phone' ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } })
await ctx.addInitScript(() => localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja' })))
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto('http://localhost:5202/#debug', { timeout: 300000 })
await page.waitForFunction(() => window.__sv?.shuttle, null, { timeout: 300000 })
await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'high' }))
await sleep(8000)
const before = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name))
await page.evaluate(() => window.__sv.shuttle.open('orbit'))
await page.waitForFunction(() => window.__sv.shuttle.state.getState().phase === 'cabin', null, { timeout: 400000 })
await sleep(4000)
const res = await page.evaluate((before) => {
  const seen = new Set(before)
  return performance
    .getEntriesByType('resource')
    .filter((e) => !seen.has(e.name) && !/\.(js|ts|tsx|css|mjs)(\?|$)/.test(e.name) && !e.name.includes('/src/') && !e.name.includes('/node_modules/'))
    .map((e) => ({ name: e.name.split('/').slice(-2).join('/'), bytes: e.transferSize || e.encodedBodySize || 0 }))
}, before)
const shots =
  kind === 'phone'
    ? [
        ['aft-fwd', { place: [0.1, 3.3, -1.2, 0, -0.05] }],
        ['seat', { spot: 'seat' }],
        ['middeck', { place: [0.5, 1.25, -1.9, 0.0, -0.08] }],
      ]
    : [
        ['aft-fwd', { place: [0.1, 3.3, -1.2, 0, -0.05] }],
        ['seat', { spot: 'seat' }],
        ['arm', { spot: 'arm' }],
        ['overhead', { place: [0.0, 3.4, -1.3, 0, 1.25] }],
        ['aft-window', { place: [0.36, 3.65, -0.75, Math.PI, 0.05] }],
        ['middeck', { place: [0.5, 1.25, -1.9, 0.0, -0.08] }],
        ['hole', { place: [-1.15, 3.0, -0.75, 0.1, -1.1] }],
        ['dark', { place: [0.1, 3.3, -1.2, 0, -0.05], light: 'dark' }],
        ['bag', { spot: 'bag' }],
      ]
const info = {}
for (const [name, s] of shots) {
  await page.evaluate((s) => {
    const sh = window.__sv.shuttle
    sh.leave()
    sh.light(s.light || 'day')
    if (s.place) sh.debug.place(...s.place)
    if (s.spot) sh.spot(s.spot)
  }, s)
  await sleep(s.spot ? 14000 : s.light ? 6000 : 3000)
  if (name === 'aft-fwd') info.render = await page.evaluate(() => window.__sv.shuttle.debug.info())
  await page.screenshot({ path: `${out}/s1-app-${kind === 'phone' ? 'phone-' : ''}${name}.jpg`, type: 'jpeg', quality: 85, timeout: 180000 })
  console.log('shot', name)
}
await page.evaluate(() => window.__sv.shuttle.light('day'))
writeFileSync(`${out}/weight-${kind}.json`, JSON.stringify({ res, total: res.reduce((n, r) => n + r.bytes, 0), info, errors }, null, 1))
console.log(JSON.stringify({ total: res.reduce((n, r) => n + r.bytes, 0), info, errors: errors.slice(0, 5) }))
await browser.close()
