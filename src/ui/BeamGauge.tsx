import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { CHARGE_STEPS, beamCharge, beamFx, now } from '../state/beam'
import { t, useLang } from '../i18n/lang'

const FULL = CHARGE_STEPS[CHARGE_STEPS.length - 1]
/** 段階ごとのゲージの色（青→水色→白） */
const LEVEL_COLORS = ['#5b7bd8', '#4f86ff', '#5fe3ff', '#f4fbff']
/** フラッシュのいちばん明るいときの白さ（強すぎないように） */
const FLASH_MAX = 0.42
/** フラッシュが消えるまでの秒数（1〜2フレームほど） */
const FLASH_SECONDS = 0.07

/**
 * チャージビームのゲージ（溜めた量と段階、撃ったあとのクールダウン）と、
 * 溜めているあいだ周りを暗くする幕、撃った瞬間の白いフラッシュ。
 * 毎フレームの値は beamCharge / beamFx から直接読み、React の再描画はしない
 */
export function BeamGauge() {
  useLang()
  const flight = useStore((s) => s.mode === 'flight')
  const gauge = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const dim = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let last = now()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const texts = { charge: t('チャージ', 'Charge'), cool: t('クールダウン', 'Cooldown'), firing: t('発射中', 'Firing') }
      const time = now()
      const dt = Math.min(0.1, time - last)
      last = time
      const c = beamCharge
      const g = gauge.current
      if (!g || !fill.current || !label.current) return

      let show = false
      if (c.charging) {
        const k = Math.min(1, (time - c.start) / FULL)
        show = true
        g.dataset.state = 'charge'
        g.dataset.level = String(c.level)
        fill.current.style.transform = `scaleX(${k})`
        fill.current.style.background = LEVEL_COLORS[c.level]
        label.current.textContent = c.level > 0 ? `${texts.charge} Lv${c.level}` : texts.charge
      } else if (time < c.readyAt) {
        const cooling = c.readyAt - time
        show = true
        if (cooling > c.cooldown) {
          g.dataset.state = 'firing'
          fill.current.style.transform = 'scaleX(1)'
          label.current.textContent = texts.firing
        } else {
          g.dataset.state = 'cool'
          fill.current.style.transform = `scaleX(${1 - cooling / c.cooldown})`
          label.current.textContent = `${texts.cool} ${cooling.toFixed(1)}s`
        }
        fill.current.style.background = ''
      }
      g.classList.toggle('show', show)

      if (dim.current) dim.current.style.opacity = beamFx.dim.toFixed(3)
      const allowFlash = useStore.getState().settings.beamFx.flash
      if (flash.current) flash.current.style.opacity = allowFlash ? (beamFx.flash * FLASH_MAX).toFixed(3) : '0'
      beamFx.flash = Math.max(0, beamFx.flash - dt / FLASH_SECONDS)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      <div ref={dim} className="beam-dim" aria-hidden="true" />
      <div ref={flash} className="beam-flash" aria-hidden="true" />
      <div ref={gauge} className="beam-gauge" hidden={!flight} aria-hidden="true">
        <span ref={label} className="beam-gauge-label" />
        <div className="beam-gauge-bar">
          <div ref={fill} className="beam-gauge-fill" />
          {CHARGE_STEPS.slice(0, -1).map((s) => (
            <i key={s} style={{ left: `${(s / FULL) * 100}%` }} />
          ))}
        </div>
      </div>
    </>
  )
}
