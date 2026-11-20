// スクリーンショットで動作を確かめる（CI でも動かす）。npm run build のあとに
//   node tools/smoke/smoke.mjs [場面...] [--out dir] [--firefox]
// 場面ごとに、起動して準備完了まで待ち、ページのエラーが出ていないこと・3D が真っ黒や一色でないことを確かめて、
// 画面を PNG に残す（CI では成果物として保存）。SwiftShader（GPU なし）なので遅いが、壊れたかどうかは分かる
import { chromium, firefox, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serve } from '../perf/serve.mjs'
import { decodePng, imageStats } from './png.mjs'

const args = process.argv.slice(2)
const outAt = args.indexOf('--out')
const outDir = outAt >= 0 ? args[outAt + 1] : 'smoke-shots'
const useFirefox = args.includes('--firefox')
const wanted = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1))
const DIST = process.env.DIST ?? new URL('../../dist/', import.meta.url).pathname

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const desktop = { viewport: { width: 1280, height: 720 } }
// Firefox は isMobile を使えないので、スマホは画面の大きさと指の操作だけまねる
const phone = useFirefox ? { viewport: { width: 390, height: 664 }, hasTouch: true } : { ...devices['iPhone 13'], deviceScaleFactor: 1 }

/** 画面の 3D が描けているか（文字やボタンを消して撮る） */
async function check3d(page, name, min = { std: 4, lit: 0.002 }) {
  await page.evaluate(() => document.documentElement.classList.add('clean-screen'))
  await sleep(600)
  const shot = await page.screenshot({ timeout: 120000 })
  await page.evaluate(() => document.documentElement.classList.remove('clean-screen'))
  const s = imageStats(decodePng(shot))
  if (s.std < min.std || s.lit < min.lit) throw new Error(`${name}: 3D looks blank (mean ${s.mean.toFixed(1)}, std ${s.std.toFixed(1)}, lit ${(s.lit * 100).toFixed(2)}%)`)
  return s
}

/** その要素が見えていて、ほかの物に隠れていないか（まん中の点で調べる） */
async function visibleButton(page, selector) {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return 'missing'
    const b = el.getBoundingClientRect()
    if (b.width === 0 || b.right > innerWidth || b.bottom > innerHeight || b.left < 0) return `off-screen ${JSON.stringify(b)}`
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return top && (top === el || el.contains(top)) ? 'ok' : `covered by ${top?.className || top?.tagName}`
  }, selector)
  if (r !== 'ok') throw new Error(`${selector}: ${r}`)
}

const SCENARIOS = {
  // 起動して、操縦席から見る
  flight: { ctx: desktop, hash: '#debug' },
  // 全体マップ：天体が描けているか（前に、名前だけ残って真っ黒になる不具合があった）
  map: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().setMode('map'))
      await sleep(4000)
    },
  },
  // 幅 960px のパソコン：アルカディアの「着陸船を発進」が航法パネルに隠れない
  narrow: {
    ctx: { viewport: { width: 960, height: 640 } },
    hash: '#debug&ship=arcadia',
    run: async (page) => {
      for (const sel of ['.launch-button', '.gallery-button', '.mode-button', '.bridge-button', '.eva-button']) await visibleButton(page, sel)
    },
  },
  // 共通のセーブ：前の版のキー（solar-voyager:settings、起動の前に入れたもの）が引き継がれ、セーブデータ画面に出る
  save: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solar-odyssey:save') ?? 'null'))
      if (!saved || saved.app !== 'solar-odyssey' || !saved.data?.settings) throw new Error(`save not migrated: ${JSON.stringify(saved)?.slice(0, 200)}`)
      await page.evaluate(() => document.querySelector('.save-data')?.setAttribute('open', ''))
      await page.evaluate(() => document.querySelector('.save-data')?.scrollIntoView())
      await sleep(500)
      await visibleButton(page, '.save-export')
    },
  },
  // スマホ
  phone: { ctx: phone, hash: '#debug' },
  // SF の世界
  sf: { ctx: desktop, hash: '#debug&sf', settle: 8000 },
  // コロニーの公園を歩く
  walk: {
    ctx: desktop,
    hash: '#debug&sf',
    run: async (page) => {
      // CI の機械（2 コア・GPU なし）では、公園を「標準」で描くと 1 コマに 30 秒以上かかるので「軽量」で
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.walk.start())
      await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
      await sleep(6000)
    },
  },
  // 公園の外（円筒のほかの所）：歩く人のまわりの区画（地面・家・木）が作られて、細かく描く範囲が切りかわる
  walkCity: {
    ctx: desktop,
    hash: '#debug&sf?colonytime=day',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.walk.start())
      await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
      // 住宅地（帯 1 の、港から 17 km）へ
      await page.evaluate(() => Object.assign(window.__sv.walk.walker, { s: 560, y: 17430, turnTo: -1.57 }))
      await page.waitForFunction(() => window.__sv.walk.chunks.shown && window.__sv.walk.chunks.shown.j0 > 80, null, { timeout: 240000, polling: 1000 })
      await sleep(3000)
    },
  },
}

await mkdir(outDir, { recursive: true })
const server = await serve(DIST)
const port = server.address().port
const browser = useFirefox
  ? // ヘッドレスの Firefox は GL を作れないので、CI では仮想画面（xvfb-run）で窓を出して Mesa のソフト描画を使う
    await firefox.launch({ headless: !process.env.DISPLAY, firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false } })
  : await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const failures = []
for (const name of wanted.length ? wanted : Object.keys(SCENARIOS)) {
  const sc = SCENARIOS[name]
  const t0 = Date.now()
  const ctx = await browser.newContext(sc.ctx)
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('solar-voyager:settings', JSON.stringify({ lang: 'ja', music: false, muted: true }))
    } catch {}
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // 起動しなかったときの手がかり（コンソールのエラーと警告）
  const consoleLines = []
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && consoleLines.length < 12) consoleLines.push(`${m.type()}: ${m.text().slice(0, 200)}`)
  })
  try {
    await page.goto(`http://localhost:${port}/${sc.hash}`)
    await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 240000, polling: 500 })
    await sleep(sc.settle ?? 3000)
    if (sc.run) await sc.run(page)
    const s = await check3d(page, name)
    await page.screenshot({ path: join(outDir, `${name}${useFirefox ? '-firefox' : ''}.png`), timeout: 120000 })
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
    console.log(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s, std ${s.std.toFixed(1)})`)
  } catch (e) {
    failures.push(name)
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`)
    const state = await page
      .evaluate(() => {
        const c = document.createElement('canvas')
        const gl = c.getContext('webgl2')
        const info = gl?.getExtension('WEBGL_debug_renderer_info')
        return { boot: document.querySelector('.boot-text')?.textContent ?? '(boot screen gone)', webgl2: !!gl, renderer: gl ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : null }
      })
      .catch((err) => ({ evalFailed: String(err).slice(0, 200) }))
    console.log(`     state: ${JSON.stringify(state)}`)
    for (const l of consoleLines) console.log(`     ${l}`)
    await page.screenshot({ path: join(outDir, `${name}${useFirefox ? '-firefox' : ''}-fail.png`) }).catch(() => {})
  }
  await ctx.close()
}
await browser.close()
server.close()
await writeFile(join(outDir, useFirefox ? 'result-firefox.txt' : 'result.txt'), failures.length ? `failed: ${failures.join(', ')}\n` : 'all ok\n')
process.exit(failures.length ? 1 : 0)
