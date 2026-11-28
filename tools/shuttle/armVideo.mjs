// シャトルの軌道の章の確認動画：扉を開ける → ハッブルが来る → アームでつかむ → 荷物室に立てる。
// コマを 1 枚ずつ進めて撮り、mp4 にする（CI では使わない。音は入らない）
//   OUT=/tmp/sharm URL=http://localhost:5202/ FPS=12 node tools/shuttle/armVideo.mjs   → $OUT/frames/*.jpg と $OUT/arm.mp4
// アームは、子どもが押すのと同じキー（WASD・Space）で動かす。届かなければ最後に狙いを置く（撮影用）
import { chromium, devices } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const OUT = process.env.OUT || '/tmp/sharm'
const URL = process.env.URL || 'http://localhost:5202/'
const W = Number(process.env.W || 960)
const H = Number(process.env.H || 540)
const FPS = Number(process.env.FPS || 12)
const PHONE = process.env.PHONE === '1'
rmSync(`${OUT}/frames`, { recursive: true, force: true })
mkdirSync(`${OUT}/frames`, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext(PHONE ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: W, height: H } })
await ctx.addInitScript((lang) => localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang, muted: true, music: false })), process.env.LANG_UI || 'ja')
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(URL + '?shuttle=sample&at=orbit#debug', { timeout: 300000 })
await page.waitForFunction(() => window.__sv?.shuttle, null, { timeout: 300000 })
await page.evaluate((q) => window.__sv.store.getState().updateSettings({ quality: q }), process.env.QUALITY || 'high')
await sleep(5000)
await page.evaluate(() => window.__sv.shuttle.open('orbit'))
await page.waitForFunction(() => window.__sv.shuttle.state.getState().phase === 'cabin' && window.__shuttleFilm, null, { timeout: 400000 })
await sleep(3000)
await page.evaluate(() => window.__shuttleFilm.begin())
let f = 0
const st = () => page.evaluate(() => window.__sv.shuttle.state.getState())
const step = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    await page.evaluate((dt) => window.__shuttleFilm.step(dt), 1 / FPS)
    if (f % 2 === 0) await sleep(20)
    await page.screenshot({ path: `${OUT}/frames/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 86, timeout: 180000 })
    f++
    if (f % (FPS * 5) === 0) console.log((f / FPS).toFixed(0), 's', (await st()).orbit, JSON.stringify(await page.evaluate(() => window.__sv.shuttle.debug.arm())))
  }
}
const sec = (s) => step(Math.round(s * FPS))
/** キーを押したまま s 秒 */
const hold = async (keys, s) => {
  for (const k of keys) await page.keyboard.down(k)
  await sec(s)
  for (const k of keys) await page.keyboard.up(k)
}
// 乗員室を少し見てから、扉を開けるボタン（アームの席へ移る）
await sec(1.5)
await page.evaluate(() => document.querySelector('.shuttle-go').click())
await sec(2)
while ((await st()).orbit === 'opening') await sec(0.5)
while ((await st()).orbit === 'approach') await sec(0.5)
// アームが起き上がるのを待つ
await sec(4.5)
// 先を上・奥へ、少し右へ（見ている向きで）。近づくと吸い寄せられる
await hold(['KeyW', 'Space'], 1.3)
await hold(['Space'], 0.9)
await hold(['KeyD'], 0.5)
for (let i = 0; i < 8 && !(await st()).armReady; i++) await sec(0.5)
if (!(await st()).armReady) {
  console.log('aim by hand (not ready)', JSON.stringify(await page.evaluate(() => window.__sv.shuttle.debug.arm())))
  await page.evaluate(() => {
    const g = window.__sv.shuttle.debug.arm().target
    window.__sv.shuttle.debug.aimAt(g[0], g[1], g[2])
  })
  await sec(1)
}
await sec(1)
await page.evaluate(() => document.querySelector('.shuttle-go:not([disabled])').click())
await sec(2.5)
// 下ろす：下へ、少し右へ。輪の上で止める
await hold(['KeyS', 'KeyD'], 0.4)
await hold(['KeyS'], 6)
for (let i = 0; i < 8 && !(await st()).armReady; i++) await sec(0.5)
if (!(await st()).armReady) {
  console.log('berth by hand (not ready)', JSON.stringify(await page.evaluate(() => window.__sv.shuttle.debug.arm())))
  await page.evaluate(() => {
    const g = window.__sv.shuttle.debug.arm().target
    window.__sv.shuttle.debug.aimAt(g[0], g[1], g[2])
  })
  await sec(1)
}
await sec(0.8)
await page.evaluate(() => document.querySelector('.shuttle-go:not([disabled])').click())
await sec(5)
await browser.close()
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${OUT}/frames/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-r', '30', `${OUT}/arm.mp4`])
console.log('done', `${OUT}/arm.mp4`, f, 'frames')
