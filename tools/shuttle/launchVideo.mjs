// シャトルの発射台と打ち上げの確認動画：コマを 1 枚ずつ進めて撮り、mp4 にする（CI では使わない。音は入らない）
//   OUT=/tmp/shvid URL=http://localhost:5202/ FPS=15 node tools/shuttle/launchVideo.mjs   → $OUT/frames/*.jpg と $OUT/launch.mp4
// 流れ：夜の発射台（PAD 秒）→ 乗り込む → 席で T−10 秒から → 点火のボタン（HOLD 秒）→ 押す → 映画の終わり（軌道へ）
import { chromium, devices } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const OUT = process.env.OUT || '/tmp/shvid'
const URL = process.env.URL || 'http://localhost:5202/'
const W = Number(process.env.W || 960)
const H = Number(process.env.H || 540)
const FPS = Number(process.env.FPS || 15)
const PAD = Number(process.env.PAD || 4)
const HOLD = Number(process.env.HOLD || 1.5)
const FROM = Number(process.env.FROM || -10)
const PHONE = process.env.PHONE === '1'
rmSync(`${OUT}/frames`, { recursive: true, force: true })
mkdirSync(`${OUT}/frames`, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext(PHONE ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: W, height: H } })
await ctx.addInitScript((lang) => localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang, muted: true, music: false })), process.env.LANG_UI || 'ja')
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(URL + '#debug', { timeout: 300000 })
await page.waitForFunction(() => window.__sv?.shuttle, null, { timeout: 300000 })
await page.evaluate((q) => window.__sv.store.getState().updateSettings({ quality: q }), process.env.QUALITY || 'high')
await sleep(5000)
await page.evaluate(() => window.__sv.shuttle.open('pad'))
await page.waitForFunction(() => window.__sv.shuttle.state.getState().phase === 'pad' && window.__shuttleFilm, null, { timeout: 400000 })
await sleep(3000)
await page.evaluate(() => window.__shuttleFilm.begin())
let f = 0
const step = async () => {
  await page.evaluate((dt) => window.__shuttleFilm.step(dt), 1 / FPS)
  // 字幕・ボタンの React の描き直しを待つ
  if (f % 2 === 0) await sleep(20)
  await page.screenshot({ path: `${OUT}/frames/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 86, timeout: 180000 })
  f++
  if (f % (FPS * 5) === 0) console.log((f / FPS).toFixed(0), 's', await page.evaluate(() => `${window.__sv.shuttle.state.getState().stage} T${window.__sv.shuttle.launch.t.toFixed(1)}`))
}
const st = () => page.evaluate(() => window.__sv.shuttle.state.getState())
for (let i = 0; i < PAD * FPS; i++) await step()
await page.evaluate(() => document.querySelector('.shuttle-board').click())
while ((await st()).stage !== 'count') await step()
await page.evaluate((t) => window.__sv.shuttle.debug.launchAt(t), FROM)
while ((await st()).stage !== 'hold') await step()
for (let i = 0; i < HOLD * FPS; i++) await step()
await page.evaluate(() => document.querySelector('.shuttle-ignite').click())
while ((await st()).phase === 'launch' && f < FPS * 400) await step()
await browser.close()
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${OUT}/frames/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-r', '30', `${OUT}/launch.mp4`])
console.log('done', `${OUT}/launch.mp4`, f, 'frames')
