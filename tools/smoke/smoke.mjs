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
  // 場面の受け皿：公園の場面でわざと失敗させて「問題が起きました」が出て、「もどる」で宇宙の自由探索にもどる
  'scene-error': {
    ctx: desktop,
    hash: '#debug&sf',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.walk.start())
      // 歩く場面が出来てから壊す（遅い CI でも読み込み途中で壊さない）
      await page.waitForFunction(() => window.__sv.walk.debug.scene, null, { timeout: 120000 })
      await page.evaluate(() => window.__sv.crashScene('walk'))
      await page.waitForSelector('.scene-error[data-scene="walk"]', { timeout: 20000 })
      await visibleButton(page, '.scene-error-back')
      // 3D が重い CI ではクリックの安定待ちが終わらないので、DOM から直接押す
      await page.evaluate(() => document.querySelector('.scene-error-back').click())
      await page.waitForFunction(() => !document.querySelector('.scene-error') && window.__sv.walk.state.getState().phase === 'none', null, { timeout: 60000 })
      await sleep(2000)
    },
  },
  // スマホ
  phone: { ctx: phone, hash: '#debug' },
  // 天体カード（PC とスマホ）：開いて、めくるボタンと閉じるボタンが隠れていない
  cards: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.bodyCards.open('mars'))
      await sleep(800)
      for (const sel of ['.body-cards .bc-step', '.body-cards .close']) await visibleButton(page, sel)
    },
  },
  // 今日の宇宙（スマホ）：閉じるボタンが隠れていない
  'today-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.today.open())
      await sleep(800)
      await visibleButton(page, '.today-panel .close')
    },
  },
  // 発見スキャン：小惑星帯の岩のそばでスキャンすると、発見のカードが出る
  scan: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(async () => {
        const sv = window.__sv
        sv.discovery.start()
        // 出発点では船が地球に合わせて動くので、それを外してから帯の岩のそばへ
        sv.flightControl.releaseHold = true
        await new Promise((r) => setTimeout(r, 300))
        const mesh = sv.discovery.asteroids.meshes[0]
        const m = new sv.THREE.Matrix4()
        mesh.getMatrixAt(0, m)
        const p = new sv.THREE.Vector3().setFromMatrixPosition(m.premultiply(mesh.matrixWorld))
        sv.ship.position.copy(p).add(new sv.THREE.Vector3(2, 0.5, 2))
        sv.ship.velocity.set(0, 0, 0)
      })
      await page.waitForFunction(() => window.__sv.discovery.state.getState().candidate, null, { timeout: 30000 })
      await page.evaluate(() => window.__sv.discovery.state.setState({ progress: 0.95 }))
      await page.waitForFunction(() => window.__sv.discovery.state.getState().fresh, null, { timeout: 30000 })
      await visibleButton(page, '.scan-fresh button')
    },
  },
  // 発見スキャン（スマホ）：スキャナーの表示と発見ノートが画面に収まる
  'scan-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.discovery.start())
      await sleep(800)
      await visibleButton(page, '.scanner-hud .scan-stop')
      await page.evaluate(() => window.__sv.discovery.note())
      await sleep(500)
      await visibleButton(page, '.discovery-note .close')
    },
  },
  'cards-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.bodyCards.open('phobos'))
      await sleep(800)
      for (const sel of ['.body-cards .bc-step', '.body-cards .close']) await visibleButton(page, sel)
    },
  },
  // 到着の瞬間：木星に着くと、木星の前に地球が 11 個ならび、「もっと知る」が押せる（時間を止めて撮る）
  arrival: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => {
        const sv = window.__sv
        sv.store.getState().setTarget('jupiter')
        sv.flightControl.jumpTo = 'jupiter'
      })
      await page.waitForFunction(() => window.__sv.arrival.state.getState().id === 'jupiter', null, { timeout: 60000 })
      await page.evaluate(() => (window.__sv.arrival.debug.freeze = 6))
      await page.waitForFunction(() => document.querySelector('.arrival .arr-head-text'), null, { timeout: 30000 })
      await sleep(1500)
      await visibleButton(page, '.arrival .arr-more')
      const n = await page.evaluate(() => {
        let count = 0
        window.__sv.root(0).scene.traverse((o) => {
          if (o.isInstancedMesh && o.renderOrder === 12) count = o.count
        })
        return count
      })
      if (n !== 11) throw new Error(`expected 11 Earths in front of Jupiter, got ${n}`)
    },
  },
  // 到着の瞬間（スマホ）：月に着くと、地球の円に月がならんだ絵が出て、ボタンが隠れない
  'arrival-phone': {
    ctx: phone,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => {
        const sv = window.__sv
        sv.store.getState().setTarget('moon')
        sv.flightControl.jumpTo = 'moon'
      })
      await page.waitForFunction(() => window.__sv.arrival.state.getState().id === 'moon', null, { timeout: 60000 })
      await page.evaluate(() => (window.__sv.arrival.debug.freeze = 6))
      await page.waitForFunction(() => document.querySelectorAll('.arrival .arr-slot.on').length === 4, null, { timeout: 30000 })
      for (const sel of ['.arrival .arr-more', '.arrival .arr-close']) await visibleButton(page, sel)
    },
  },
  // SF の世界
  sf: { ctx: desktop, hash: '#debug&sf', settle: 8000 },
  // 火星の峡谷レース：着陸してレース場へ行き、スタートして 3・2・1 と表示が出ること、「レースをやめる」で自由走行に戻ること
  race: {
    ctx: desktop,
    hash: '#debug',
    run: async (page) => {
      await page.evaluate(() => window.__sv.store.getState().updateSettings({ quality: 'low' }))
      await page.evaluate(() => window.__sv.landing.start('mars'))
      await sleep(3000)
      await page.evaluate(() => window.__sv.landing.skip())
      await page.waitForFunction(() => window.__sv.landing.state.getState().phase === 'surface', null, { timeout: 180000, polling: 500 })
      await page.evaluate(() => window.__sv.landing.site('coprates'))
      await page.waitForFunction(() => window.__sv.landing.state.getState().phase === 'surface' && window.__sv.landing.state.getState().site === 'coprates', null, { timeout: 180000, polling: 500 })
      await page.waitForSelector('.rally-start .rally-medals', { timeout: 60000 })
      await page.evaluate(() => window.__sv.rally.start())
      await page.waitForFunction(() => ['count', 'run'].includes(window.__sv.rally.state.getState().phase), null, { timeout: 120000, polling: 500 })
      await page.waitForSelector('.rally-hud', { timeout: 30000 })
      await visibleButton(page, '.rally-actions .rally-auto')
      await sleep(4000)
      await page.evaluate(() => window.__sv.rally.quit())
      await page.waitForFunction(() => window.__sv.rally.state.getState().phase === 'off', null, { timeout: 10000 })
    },
  },
  // コロニーの公園を歩く
  // SF の開拓：端末が開き、建設が 3 段進み、建設中のコロニーのそばで描ける。「開拓をやめる」で抜けられる
  pioneer: {
    ctx: desktop,
    hash: '#debug&sf',
    settle: 8000,
    run: async (page) => {
      await page.evaluate(() => window.__sv.pioneer.start())
      // 初めて：遊び方の案内（4 枚）→ 閉じると「いまやること」のカード
      await page.waitForSelector('.pio-guide', { timeout: 60000 })
      for (let i = 0; i < 4; i++) await page.click('.pio-guide footer .pio-build')
      await visibleButton(page, '.pio-goal-go')
      const goal = await page.textContent('.pio-goal-text b')
      if (!goal) throw new Error('pioneer: no goal text')
      // 拾う → 納める：納品のカードが出る
      // （ソフト描画では 1 コマが遅く、カードが出て消えるまでに見逃すので、出たことを記録しておく）
      await page.evaluate(() => {
        window.__delivered = false
        new MutationObserver(() => {
          if (document.querySelector('.pio-delivery')) window.__delivered = true
        }).observe(document.body, { childList: true, subtree: true })
        const p = window.__sv.pioneer
        p.collect('metal', 12)
        p.deliver()
      })
      await page.waitForFunction(() => window.__delivered, null, { timeout: 30000 })
      await page.click('.pio-open')
      await visibleButton(page, '.pio-quit')
      await page.evaluate(() => {
        const p = window.__sv.pioneer
        p.give({ metal: 200, gas: 30 })
        p.build()
        p.build()
        p.build()
      })
      const stage = await page.evaluate(() => window.__sv.pioneer.state.getState().stage)
      if (stage !== 3) throw new Error(`pioneer: stage ${stage}, expected 3`)
      // 建てると建設の場面（とばせる）
      await page.waitForSelector('.pio-cinema-ui', { timeout: 30000 })
      await page.evaluate(() => window.__sv.pioneer.skip(true))
      await page.waitForSelector('.pio-cinema-ui', { state: 'detached', timeout: 30000 })
      // 場面のあとは建設中のコロニーのそばにいて、カードに戻る
      await sleep(3000)
      await visibleButton(page, '.pio-open')
    },
    after: async (page) => {
      await page.click('.pio-open')
      await page.click('.pio-quit')
      await sleep(300)
      if (await page.$('.pioneer-hud')) throw new Error('pioneer: still shown after quitting')
    },
  },
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
    // 撮ったあとに確かめること（「もどる」で抜けられるか など）
    if (sc.after) await sc.after(page)
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
