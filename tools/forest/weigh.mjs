// 同じページの中で、森の見本を出したとき・隠したときの描画回数と三角形の数を比べる
//   npm run build のあと：node tools/forest/weigh.mjs [--phone]
import { chromium, devices } from 'playwright'
import { serve } from '../perf/serve.mjs'
const phone = process.argv.includes('--phone')
const HOOK = () => {
  const s = (window.__perf = { draws: 0, tris: 0, perFrame: [] })
  const P = WebGL2RenderingContext.prototype
  const tri = (mode, count, inst = 1) => (mode === 4 ? (count / 3) * inst : 0)
  for (const [name, f] of [['drawArrays', (m, f, c) => tri(m, c)], ['drawElements', (m, c) => tri(m, c)], ['drawArraysInstanced', (m, f, c, i) => tri(m, c, i)], ['drawElementsInstanced', (m, c, t, o, i) => tri(m, c, i)]]) {
    const orig = P[name]
    P[name] = function (...a) { s.draws++; s.tris += f(...a); return orig.apply(this, a) }
  }
  let d0 = 0, t0 = 0
  const tick = () => { s.perFrame.push([s.draws - d0, s.tris - t0]); d0 = s.draws; t0 = s.tris; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0
const server = await serve(new URL('../../dist/', import.meta.url).pathname)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } })
await ctx.addInitScript(HOOK)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.error('pageerror', e.message))
await page.goto(`http://localhost:${server.address().port}/?forest=sample#debug&sf`)
await page.waitForFunction(() => !document.getElementById('boot') && window.__sv, null, { timeout: 180000, polling: 250 })
await page.evaluate(() => window.__sv.walk.start())
await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
await page.waitForFunction(() => { let n = 0; window.__sv.walk.debug.scene.traverse((o) => { if (o.name?.startsWith('forest-')) n++ }); return n > 10 }, null, { timeout: 300000, polling: 2000 })
await page.waitForFunction(() => window.__sv.walk.mobs.mobs.some((m) => m.p.model), null, { timeout: 400000, polling: 2000 }).catch(() => console.log('mobs not loaded'))
await page.evaluate(() => Object.assign(window.__sv.walk.walker, { s: 250, y: 11766, turnTo: Math.PI }))
await sleep(20000)
const measure = async () => {
  await page.evaluate(() => { window.__perf.perFrame.length = 0 })
  await sleep(4000)
  for (let i = 0; i < 40 && (await page.evaluate(() => window.__perf.perFrame.length)) < 6; i++) await sleep(2000)
  const f = (await page.evaluate(() => window.__perf.perFrame)).slice(1)
  return { draws: median(f.map((x) => x[0])), ktris: Math.round(median(f.map((x) => x[1])) / 1000), frames: f.length }
}
const info = await page.evaluate(() => {
  const out = {}
  window.__sv.walk.debug.scene.traverse((o) => {
    if (!o.name?.startsWith('forest-')) return
    const g = o.geometry
    out[o.name] = [o.count ?? 1, Math.round(((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.count ?? 1)), o.castShadow]
  })
  return out
})
console.log(JSON.stringify(info))
console.log('shown ', JSON.stringify(await measure()))
await page.evaluate(() => window.__sv.walk.debug.scene.traverse((o) => { if (o.name?.startsWith('forest-')) o.visible = false }))
await sleep(6000)
console.log('hidden', JSON.stringify(await measure()))
await page.evaluate(() => window.__sv.walk.debug.scene.traverse((o) => { if (o.name?.startsWith('forest-')) o.visible = true }))
await sleep(6000)
console.log('shown2', JSON.stringify(await measure()))
await browser.close()
server.close()
