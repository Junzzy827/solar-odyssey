import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { QUALITY, currentLevel, looksIntegrated, registerSwitcher, stepDown, stepUp, useQuality, wantedLevel, type Level } from '../state/quality'
import { useStore } from '../state/store'

/** FPS を測る区切り（秒） */
const WINDOW = 2
/** これより遅い区切りが2回続いたら一段下げる */
const SLOW_FPS = 30
/** これより速い区切りが4回続いたら一段上げる */
const FAST_FPS = 56
/** シェーダーの用意を待つ上限（秒）。これを過ぎたら、残りはその場で作らせて切り替える */
const PREPARE_LIMIT = 10
/** 画質を切り替えた直後は、残りのシェーダー作りなどで遅くなるので FPS を数えない（秒） */
const SETTLE = 3

/** 後処理（PostFx）を通して描く画質か。通すときは、場面を画面ではなく描画先（テクスチャ）に描くので、材質のシェーダーも別物になる */
function drawsThroughPostFx(level: Level) {
  const fx = useStore.getState().settings.fx
  return QUALITY[level].bloom && (fx.bloom || fx.ao || fx.film)
}

/**
 * その画質で使う材質のシェーダーを、描画を止めずに裏で用意する（KHR_parallel_shader_compile）。
 * 用意せずに切り替えると、最初のコマで全部の材質のシェーダーをその場で作るため、弱い GPU では何秒も描けなくなる
 */
function prepare(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, level: Level, target: THREE.WebGLRenderTarget) {
  const prev = gl.getRenderTarget()
  let done: Promise<unknown>
  try {
    // シェーダーの種類は「画面に描くか、描画先に描くか」で決まる（トーンマッピング・色空間）。中身の大きさは関係ない
    gl.setRenderTarget(drawsThroughPostFx(level) ? target : null)
    done = gl.compileAsync(scene, camera)
  } catch {
    done = Promise.resolve()
  } finally {
    gl.setRenderTarget(prev)
  }
  return Promise.race([done, new Promise((r) => setTimeout(r, PREPARE_LIMIT * 1000))])
}

/**
 * FPS を測り、画質が「自動」なら描画が追いつくところまで下げる（余裕があれば戻す）。
 * 画質の切り替え（自動・手動とも）は、新しい画質のシェーダーを裏で用意し終えてから行う
 */
export function QualityGovernor() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const m = useRef({ frames: 0, time: 0, slow: 0, fast: 0, lastDown: -Infinity, settleUntil: 0, tooSlow: new Set<Level>() })
  const job = useRef({ busy: false, warmed: false })
  // 後処理を通すときのシェーダーを用意するための、形だけの描画先
  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }), [])
  useEffect(() => () => target.dispose(), [target])

  useEffect(() => registerSwitcher(), [])

  useEffect(() => {
    // 内蔵 GPU やスマホは、はじめから「標準」で（まだ何も描いていないので、そのまま切り替える）
    const ctx = gl.getContext()
    const info = ctx.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER))
    const touch = matchMedia('(pointer: coarse)').matches
    if (looksIntegrated(renderer) || touch) {
      useQuality.getState().setAuto('medium')
      if (useStore.getState().settings.quality === 'auto') useQuality.setState({ level: 'medium' })
    }
    // GPU が描ききれずに画面を失ったら、戻ったときにいちばん軽くする
    const lost = () => {
      useQuality.getState().setAuto('low')
      m.current.tooSlow.add('medium').add('high')
    }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl])

  // 画質の切り替え：使いたい画質が描いている画質と違ったら、裏でシェーダーを用意してから切り替える
  useEffect(() => {
    let alive = true
    const check = () => {
      const want = wantedLevel()
      if (!alive || job.current.busy || want === currentLevel()) return
      job.current.busy = true
      void prepare(gl, scene, camera, want, target).then(() => {
        job.current.busy = false
        if (!alive) return
        // 待っているあいだにまた変わっていたら、その画質でやり直す
        if (wantedLevel() === want) {
          useQuality.setState({ level: want })
          m.current.settleUntil = performance.now() / 1000 + SETTLE
        }
        check()
      })
    }
    const offStore = useStore.subscribe(check)
    const offQuality = useQuality.subscribe(check)
    check()
    return () => {
      alive = false
      offStore()
      offQuality()
    }
  }, [gl, scene, camera, target])

  useFrame(({ clock }, dt) => {
    // 最初に描けたら、今は見えていない天体や構造物のシェーダーも裏で用意しておく
    // （全体マップを開いた瞬間に、初めて画面に入る物のシェーダー作りで止まらないように）
    if (!job.current.warmed && clock.elapsedTime > 1) {
      job.current.warmed = true
      void prepare(gl, scene, camera, currentLevel(), target)
    }
    const s = m.current
    // タブを切り替えた・テクスチャの読み込みで一瞬止まったなどの、とびぬけて長いフレームは数えない
    if (dt > 1 || document.hidden) return
    // 画質の切り替え中・直後は数えない
    if (job.current.busy || performance.now() / 1000 < s.settleUntil) {
      s.frames = 0
      s.time = 0
      return
    }
    s.frames++
    s.time += dt
    if (s.time < WINDOW) return
    const fps = s.frames / s.time
    s.frames = 0
    s.time = 0
    useQuality.getState().setFps(Math.round(fps))
    if (useStore.getState().settings.quality !== 'auto') return
    const now = clock.elapsedTime
    const level = useQuality.getState().auto
    s.slow = fps < SLOW_FPS ? s.slow + 1 : 0
    s.fast = fps > FAST_FPS ? s.fast + 1 : 0
    if (s.slow >= 2 && level !== 'low') {
      // 一度遅かった画質には、自動ではもう上げない（行ったり来たりすると、そのたびに画面が止まるので）
      s.tooSlow.add(level)
      useQuality.getState().setAuto(stepDown(level))
      s.slow = 0
      s.fast = 0
      s.lastDown = now
    } else if (s.fast >= 4 && level !== 'high' && !s.tooSlow.has(stepUp(level)) && now - s.lastDown > 10) {
      useQuality.getState().setAuto(stepUp(level))
      s.fast = 0
    }
  })

  return null
}
