import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { currentLevel, looksIntegrated, stepDown, stepUp, useQuality } from '../state/quality'
import { useStore } from '../state/store'

/** FPS を測る区切り（秒） */
const WINDOW = 2
/** これより遅い区切りが2回続いたら一段下げる */
const SLOW_FPS = 30
/** これより速い区切りが4回続いたら一段上げる */
const FAST_FPS = 56

/** FPS を測り、画質が「自動」なら描画が追いつくところまで下げる（余裕があれば戻す） */
export function QualityGovernor() {
  const gl = useThree((s) => s.gl)
  const m = useRef({ frames: 0, time: 0, slow: 0, fast: 0, lastDown: -Infinity, upAt: -Infinity, noUp: false })

  useEffect(() => {
    // 内蔵 GPU やスマホは、はじめから「標準」で
    const ctx = gl.getContext()
    const info = ctx.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER))
    const touch = matchMedia('(pointer: coarse)').matches
    if (looksIntegrated(renderer) || touch) useQuality.getState().setAuto('medium')
    // GPU が描ききれずに画面を失ったら、戻ったときにいちばん軽くする
    const lost = () => {
      useQuality.getState().setAuto('low')
      m.current.noUp = true
    }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl])

  useFrame(({ clock }, dt) => {
    const s = m.current
    // タブを切り替えた・テクスチャの読み込みで一瞬止まったなどの、とびぬけて長いフレームは数えない
    if (dt > 1 || document.hidden) return
    s.frames++
    s.time += dt
    if (s.time < WINDOW) return
    const fps = s.frames / s.time
    s.frames = 0
    s.time = 0
    useQuality.getState().setFps(Math.round(fps))
    if (useStore.getState().settings.quality !== 'auto') return
    const now = clock.elapsedTime
    const level = currentLevel()
    s.slow = fps < SLOW_FPS ? s.slow + 1 : 0
    s.fast = fps > FAST_FPS ? s.fast + 1 : 0
    if (s.slow >= 2 && level !== 'low') {
      // 上げてすぐ遅くなったなら、もう上げない（行ったり来たりしない）
      if (now - s.upAt < 20) s.noUp = true
      useQuality.getState().setAuto(stepDown(level))
      s.slow = 0
      s.fast = 0
      s.lastDown = now
    } else if (s.fast >= 4 && level !== 'high' && !s.noUp && now - s.lastDown > 10) {
      useQuality.getState().setAuto(stepUp(level))
      s.fast = 0
      s.upAt = now
    }
  })

  return null
}
