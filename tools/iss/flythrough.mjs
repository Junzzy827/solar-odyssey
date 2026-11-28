// 段階 2：ステーションの中を通りぬける動画（きぼうの保管室 → きぼう → ハーモニー → デスティニー → ユニティ →
// トランクウィリティー → キューポラ）。道は src/components/iss/film.ts。
// 1 コマずつ、時刻 t を決めて場所・向きを置き（__sv.iss.film）、読みたい部屋が全部そろってから撮る（__sv.iss.debug.settled）。
// SwiftShader でも、時計に関係なく同じ動きになる。
//   npx vite --port 5201 --strictPort &
//   node tools/iss/flythrough.mjs [--fps 30] [--frames DIR] [--out FILE.mp4] [--from N]（N コマ目から続ける）
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const fps = Number(opt('--fps', '30'))
const dir = opt('--frames', '/tmp/iss-film/frames')
const outFile = opt('--out', '/tmp/iss-film/s2-flythrough.mp4')
const url = opt('--url', 'http://localhost:5201/')
const from = Number(opt('--from', '0'))
mkdirSync(dir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
await ctx.addInitScript(() => {
  localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja', music: false, muted: true }))
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(`${url}#debug&iss=sample&mod=jlp`)
await page.waitForFunction(() => !document.getElementById('boot') && window.__sv?.iss, null, { timeout: 240000, polling: 500 })
await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'high' }))
await page.waitForFunction(() => window.__sv.iss.state.getState().phase === 'inside', null, { timeout: 300000, polling: 500 })
// 画面の文字（名前・地図・ボタン）は隠して、部屋だけを撮る
await page.addStyleTag({ content: '.iss-hud { display: none !important; }' })
await page.evaluate(() => window.__sv.iss.film(0))
await page.waitForFunction(() => window.__sv.iss.debug.filmLength.seconds > 0, null, { timeout: 60000 })
const len = await page.evaluate(() => window.__sv.iss.debug.filmLength)
const total = Math.ceil(len.seconds * fps)
console.log(`path ${len.meters.toFixed(1)} m, ${len.seconds.toFixed(1)} s, ${total} frames`)

/** 2 回描き終わるのを待つ */
const frames2 = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))))
const t0 = Date.now()
for (let i = from; i < total; i++) {
  const file = join(dir, `${String(i).padStart(5, '0')}.jpg`)
  await page.evaluate((t) => window.__sv.iss.film(t), i / fps)
  await frames2()
  // 読みこみの計画は 0.25 秒ごと。新しい計画が出てから、全部そろうのを待つ
  await sleep(300)
  await page.waitForFunction(() => window.__sv.iss.debug.settled, null, { timeout: 300000, polling: 100 }).catch(() => console.log('not settled', i))
  await frames2()
  await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: 180000 })
  if (i % 30 === 0) {
    const s = await page.evaluate(() => ({ m: window.__sv.iss.state.getState().module, l: window.__sv.iss.loaded().join(',') }))
    console.log(`frame ${i}/${total} ${((Date.now() - t0) / 1000).toFixed(0)} s ${s.m} [${s.l}]`)
  }
}
await browser.close()
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', outFile])
console.log('wrote', outFile)
