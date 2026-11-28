// 発射台の章と打ち上げの映画を撮る（確かめ用）。dev サーバー（5202）か dist を配るサーバーを先に起動：
//   node tools/shuttle/padshots.mjs <出力先> [url] [phone] [名前,名前…]
// 撮る所：発射台（全体・光る点のカード）、乗り込み、席の秒読み、点火のボタン、映画の各カット
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
const [out, url = 'http://localhost:5202/', kind, only] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const want = only ? new Set(only.split(',')) : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext(kind === 'phone' ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } })
await ctx.addInitScript(() => localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja' })))
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(url + '#debug', { timeout: 300000 })
await page.waitForFunction(() => window.__sv?.shuttle, null, { timeout: 300000 })
await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'high' }))
await sleep(6000)
await page.evaluate(() => window.__sv.shuttle.open('pad'))
await page.waitForFunction(() => window.__sv.shuttle.state.getState().phase === 'pad', null, { timeout: 400000 })
await sleep(6000)
const pre = kind === 'phone' ? 'phone-' : ''
const shot = async (name, wait = 4000) => {
  await sleep(wait)
  await page.screenshot({ path: `${out}/${pre}${name}.jpg`, type: 'jpeg', quality: 85, timeout: 180000 })
  console.log('shot', name)
}
const on = (n) => !want || want.has(n)
if (on('pad')) await shot('pad', 1000)
if (on('pad-et')) {
  await page.evaluate(() => window.__sv.shuttle.padSpot('et'))
  await shot('pad-et', 6000)
  await page.evaluate(() => window.__sv.shuttle.padSpot(null))
}
if (on('pad-cam')) {
  // 確かめ：通路と白い部屋、ハッチのあたり
  await page.evaluate(() => window.__sv.shuttle.debug.padCam(-30, 40, -30, -6.9, 32, -3, 40))
  await shot('pad-arm', 3000)
  await page.evaluate(() => window.__sv.shuttle.debug.padCam(-40, 6, 30, -9, 6, 0, 45))
  await shot('pad-aft', 3000)
  await page.evaluate(() => window.__sv.shuttle.debug.padCam(-150, 90, -170, 0, 35, 0, 40))
  await shot('pad-nw', 3000)
}
await page.evaluate(() => document.querySelector('.shuttle-board').click())
if (on('board')) await shot('board', 2500)
await page.waitForFunction(() => window.__sv.shuttle.state.getState().stage === 'count', null, { timeout: 200000 })
const at = async (t, name, wait = 4000) => {
  await page.evaluate((t) => window.__sv.shuttle.debug.launchAt(t), t)
  if (on(name)) await shot(name, wait)
}
await at(-28, 'seat')
await at(-20, 'night')
await page.evaluate(() => window.__sv.shuttle.debug.launchAt(-7.15))
await page.waitForFunction(() => window.__sv.shuttle.state.getState().stage === 'hold', null, { timeout: 200000 })
if (on('hold')) await shot('hold', 2000)
await page.evaluate(() => window.__sv.shuttle.ignite())
await at(-4.5, 'engines')
await at(1.5, 'wide')
await at(7.5, 'tower')
await at(14, 'below')
await at(24, 'seat-shake')
await at(36, 'chase')
await at(47, 'far')
await at(122, 'skip', 3000)
await at(128, 'sep')
console.log(errors.slice(0, 10).join('\n'))
await browser.close()
