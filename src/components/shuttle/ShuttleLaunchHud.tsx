import { useEffect, useRef, useState } from 'react'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'
import { isTouchDevice } from '../../state/input'
import { boardShuttle, closeShuttle, igniteShuttle, openPadSpot, reachOrbit, shuttleLaunch, useShuttle } from '../../state/shuttle'
import { altitudeAt, SRB_SEP } from './launchPlan'
import { startLaunchAudio } from './rumble'

// 発射台の章と打ち上げの上に重ねる操作：
//   発射台：場所と日付、もどる、さわり方（しばらくで消える）、選んだ部品のカード、乗り込むボタン
//   打ち上げ：秒読みの時計と高さ、とばす、1 行の字幕、T−7 秒の点火のボタン、乗り込み・終わりの暗転
// 時計・高さ・暗転は毎フレーム変わるので、React で描き直さずに直接書きかえる。

type CaptionKey = 'count' | 'night' | 'ready' | 'hold' | 'ssme' | 'liftoff' | 'roll' | 'maxq' | 'far' | 'skip' | 'sep' | 'after'
/** 字幕を出す区間（T 秒） */
const CAPTIONS: [number, number, CaptionKey][] = [
  [-31, -25, 'count'],
  [-24, -16, 'night'],
  [-15, -7.01, 'ready'],
  [-6.6, -0.6, 'ssme'],
  [0, 6, 'liftoff'],
  [8, 18, 'roll'],
  [30, 41, 'maxq'],
  [43, 52, 'far'],
  [SRB_SEP - 5, SRB_SEP - 0.2, 'skip'],
  [SRB_SEP, SRB_SEP + 5, 'sep'],
  [SRB_SEP + 5, SRB_SEP + 9, 'after'],
]

function clockText(t: number) {
  const a = Math.abs(t)
  const sec = t < 0 ? Math.ceil(a) : Math.floor(a)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `T${t < 0 ? '−' : '+'}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function ShuttleLaunchHud() {
  useLang()
  const t = ui().shuttle
  const phase = useShuttle((s) => s.phase)
  const stage = useShuttle((s) => s.stage)
  const padSpot = useShuttle((s) => s.padSpot)
  const touch = isTouchDevice()
  const [help, setHelp] = useState(true)
  const [cap, setCap] = useState<CaptionKey | null>(null)
  const clock = useRef<HTMLDivElement>(null)
  const height = useRef<HTMLDivElement>(null)
  const fade = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== 'pad') return
    const timer = setTimeout(() => setHelp(false), 14000)
    return () => clearTimeout(timer)
  }, [phase])

  // 時計・高さ・字幕・暗転
  useEffect(() => {
    let raf = 0
    let last: CaptionKey | null = null
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const s = useShuttle.getState()
      const tt = shuttleLaunch.t
      if (clock.current) clock.current.textContent = clockText(tt)
      if (height.current) {
        const h = altitudeAt(tt)
        height.current.textContent = h > 50 ? `${ui().shuttle.launch.height} ${h < 10_000 ? (h / 1000).toFixed(1) : Math.round(h / 1000)} km` : ''
      }
      if (fade.current) fade.current.style.opacity = String(shuttleLaunch.fade)
      let k: CaptionKey | null = null
      if (s.phase === 'launch' && s.stage !== 'board') {
        if (s.stage === 'hold') k = 'hold'
        else for (const [a, b, key] of CAPTIONS) if (tt >= a && tt < b) k = key
      }
      if (k !== last) {
        last = k
        setCap(k)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (phase === 'pad') {
    return (
      <div className="surface-ui shuttle-ui shuttle-pad-ui" onPointerDown={startLaunchAudio}>
        <div className="shuttle-top">
          <div className="shuttle-deck">
            <b>{t.pad.title}</b>
            <span>{t.pad.when}</span>
          </div>
          <div className="shuttle-top-buttons">
            <button className="shuttle-btn shuttle-exit" title={t.exitTip} onClick={closeShuttle}>
              {t.exit}
            </button>
          </div>
        </div>
        {help && !padSpot && (
          <div className="shuttle-help" onClick={() => setHelp(false)}>
            <div>{t.pad.help[touch ? 'touch' : 'pc']}</div>
          </div>
        )}
        {padSpot && (
          <div className="shuttle-card" onClick={() => openPadSpot(null)}>
            <b>{t.pad.spot[padSpot].name}</b>
            {t.pad.spot[padSpot].card.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        )}
        <div className="shuttle-bottom">
          <button
            className="shuttle-btn shuttle-board"
            title={t.pad.boardTip}
            onClick={() => {
              startLaunchAudio()
              boardShuttle()
            }}
          >
            {t.pad.board}
          </button>
        </div>
      </div>
    )
  }

  const seated = phase === 'launch' && stage !== 'board'
  return (
    <div className="surface-ui shuttle-ui shuttle-launch-ui" onPointerDown={startLaunchAudio}>
      <div className="shuttle-top">
        <div className={`shuttle-clock${stage === 'hold' ? ' hold' : ''}`} style={{ visibility: seated ? 'visible' : 'hidden' }}>
          <div ref={clock} className="shuttle-clock-t" />
          {stage === 'hold' ? <small>{t.launch.hold}</small> : <small ref={height} />}
        </div>
        <div className="shuttle-top-buttons">
          <button className="shuttle-btn" title={t.launch.skipTip} onClick={reachOrbit}>
            {t.launch.skip}
          </button>
          <button className="shuttle-btn shuttle-exit" title={t.exitTip} onClick={closeShuttle}>
            {t.exit}
          </button>
        </div>
      </div>
      {cap && <div className={`shuttle-caption${cap === 'skip' ? ' big' : ''}`}>{t.launch.caption[cap]}</div>}
      {stage === 'hold' && (
        <div className="shuttle-bottom">
          <button className="shuttle-ignite" onClick={igniteShuttle}>
            <b>{t.launch.ignite}</b>
            <small>{t.launch.igniteSub}</small>
          </button>
        </div>
      )}
      <div ref={fade} className="shuttle-fade" />
    </div>
  )
}
