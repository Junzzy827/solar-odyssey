// 乗員室の好きな場所を撮る（確かめ用）。dev サーバーか dist を配るサーバーを先に起動：
//   node tools/shuttle/shots.mjs <出力先> <url> '<一覧の JSON>' [phone]
// 一覧：[["名前", {"place":[x,y,z,yaw,pitch], "spot":"seat", "light":"dark", "hide":["glass"], "show":["orbiter"], "keys":["KeyW"], "hold":5000}], ...]
// 座標は three.js（x 右、y 上、z 後ろ）。yaw 0 が前、π が後ろ、π/2 が左。
import { chromium, devices } from 'playwright'
const [out, url, json, kind] = process.argv.slice(2)
const shots = JSON.parse(json)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext(kind === 'phone' ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } })
await ctx.addInitScript(() => localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja' })))
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(url + '#debug', { timeout: 300000 })
await page.waitForFunction(() => window.__sv?.shuttle, null, { timeout: 300000 })
await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'high' }))
await sleep(6000)
await page.evaluate(() => window.__sv.shuttle.open('orbit'))
await page.waitForFunction(() => window.__sv.shuttle.state.getState().phase === 'cabin', null, { timeout: 400000 })
await sleep(5000)
for (const [name, s] of shots) {
  await page.evaluate((s) => {
    const sh = window.__sv.shuttle
    sh.leave()
    sh.light(s.light || 'day')
    if (s.place) sh.debug.place(...s.place)
    if (s.spot) sh.spot(s.spot)
    for (const n of s.hide || []) sh.debug.show(n, false)
    for (const n of s.show || []) sh.debug.show(n, true)
  }, s)
  await sleep(s.spot ? 14000 : s.light ? 7000 : 4000)
  if (s.keys) {
    // キーを押し続ける（アームやにぎりの動きを撮る）
    for (const k of s.keys) await page.keyboard.down(k)
    await sleep(s.hold || 5000)
    for (const k of s.keys) await page.keyboard.up(k)
    await sleep(1500)
  }
  await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 85, timeout: 180000 })
  console.log('shot', name)
}
console.log('info', JSON.stringify(await page.evaluate(() => window.__sv.shuttle.debug.info())))
console.log('errors', JSON.stringify(errors))
await browser.close()
