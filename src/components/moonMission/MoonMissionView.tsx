import { Suspense, memo, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useDpr } from '../../state/quality'
import { QualityGovernor } from '../QualityGovernor'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { isTouchDevice } from '../../state/input'
import {
  COUNT_FROM,
  IGNITION_AT,
  MISSION_FADE,
  TLI_WINDOW,
  TLI_WINDOW_OPEN,
  bindMissionKeys,
  cycleCam,
  endMission,
  missionInput,
  missionNow,
  missionReadout,
  pressGo,
  restartMission,
  setAuto,
  sim,
  useMoonMission,
  film,
} from '../../state/moonMission'

const debugOn = typeof location !== 'undefined' && location.hash.includes('debug')
import { LaunchWorld } from './LaunchWorld'
import { LunarWorld } from './LunarWorld'
import { LunarHud } from './LunarHud'
import { bindLunarKeys, lunarPhase, startLunar } from '../../state/moonLunar'
import './moonMission.css'

// 月ミッション（アポロ17号の追体験）の場面。宇宙の場面とは別の Canvas で描く（そのあいだ宇宙の場面は止める）。
// 画面の上に、時刻・高さ・速さ・G、機首の手本の目盛り、出来事の字幕、終わりのカードを重ねる。

/** 確認用の動画：コマを 1 枚ずつ進める（window.__moonFilm.step(dt)）。ふだんは使わない */
function FilmHook() {
  const advance = useThree((s) => s.advance)
  const setFrameloop = useThree((s) => s.setFrameloop)
  useEffect(() => {
    const w = window as unknown as { __moonFilm?: unknown }
    w.__moonFilm = {
      begin: () => {
        film.t = 1000
        setFrameloop('never')
      },
      step: (dt: number) => {
        film.t = (film.t ?? 1000) + dt
        advance(film.t)
      },
    }
    return () => {
      delete w.__moonFilm
    }
  }, [advance, setFrameloop])
  return null
}

const MissionCanvas = memo(function MissionCanvas({ moon }: { moon: boolean }) {
  const dpr = useDpr(1.75)
  return (
    <Canvas dpr={dpr} gl={{ alpha: false, logarithmicDepthBuffer: true, antialias: true }} camera={{ fov: 40, near: 0.3, far: 2e10, position: [0, 20, 300] }}>
      <color attach="background" args={['#000']} />
      {/* 第1弾（地球から月へ向かうまで）と第2弾（月のまわり）は、別の世界 */}
      <Suspense fallback={null}>{moon ? <LunarWorld /> : <LaunchWorld />}</Suspense>
      <QualityGovernor />
      {debugOn && <FilmHook />}
    </Canvas>
  )
})

/** 毎フレームの数字を、画面の部品に 10 回/秒ほどで渡す */
function useReadout() {
  const [r, setR] = useState(missionReadout)
  useEffect(() => {
    const id = setInterval(() => setR(missionReadout()), 100)
    return () => clearInterval(id)
  }, [])
  return r
}

/** 機首の目盛り：0°（真上）〜90°（水平）の扇。緑が手本、白い針が今の機首 */
function PitchDial({ pitch, guide }: { pitch: number; guide: number }) {
  const R = 70
  const pt = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180
    return [80 + Math.sin(a) * r, 84 - Math.cos(a) * r]
  }
  const g0 = pt(guide - 3, R)
  const g1 = pt(guide + 3, R)
  const [nx, ny] = pt(pitch, R - 4)
  const off = Math.abs(pitch - guide)
  return (
    <svg className="mm-dial" viewBox="0 0 170 92" aria-hidden>
      <path d={`M10 84 A${R} ${R} 0 0 1 150 84`} className="mm-dial-arc" />
      <path d={`M${pt(0, R)[0]} ${pt(0, R)[1]} A${R} ${R} 0 0 1 ${pt(90, R)[0]} ${pt(90, R)[1]}`} className="mm-dial-arc on" />
      <path d={`M80 84 L${g0[0]} ${g0[1]} A${R} ${R} 0 0 1 ${g1[0]} ${g1[1]} Z`} className="mm-dial-guide" />
      <line x1={80} y1={84} x2={nx} y2={ny} className={`mm-dial-nose ${off > 7 ? 'bad' : off > 3 ? 'ok' : 'good'}`} />
      <circle cx={80} cy={84} r={4} className="mm-dial-hub" />
    </svg>
  )
}

function TiltButtons() {
  const press = (v: number) => () => (missionInput.tilt = v)
  const up = () => (missionInput.tilt = 0)
  return (
    <>
      <button className="mm-tilt left" onPointerDown={press(-1)} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}>
        ◀
      </button>
      <button className="mm-tilt right" onPointerDown={press(1)} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}>
        ▶
      </button>
    </>
  )
}

function Caption() {
  useLang()
  const caption = useMoonMission((s) => s.caption)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])
  if (!caption || missionNow() - caption.at > 5.5) return null
  const [head, line] = ui().moonMission.captions[caption.key]
  return (
    <div className="mm-caption" key={caption.at}>
      <div className="mm-caption-head">{head}</div>
      <div className="mm-caption-line">{line}</div>
    </div>
  )
}

function Hud() {
  useLang()
  const t = ui().moonMission
  const s = useMoonMission()
  const r = useReadout()
  const touch = isTouchDevice()
  const flying = s.phase === 'ascent' || s.phase === 'orbit' || s.phase === 'tli' || s.phase === 'outbound'
  const orbitT = r.t - sim.orbitAt
  const windowPos = (orbitT - TLI_WINDOW_OPEN + 300) / (TLI_WINDOW + 600)
  return (
    <div className="mm-hud">
      {s.phase === 'pad' && (
        <div className="mm-pad">
          {s.countdown > COUNT_FROM - 5 && (
            <div className="mm-intro">
              <div className="mm-intro-title">{t.title}</div>
              <div>{t.intro}</div>
              <div className="mm-intro-crew">{t.crew}</div>
              {s.ignitedAt === null && (
                <button className="mm-chapter" onClick={() => startLunar()}>
                  {t.lunar.chapterMoon}
                </button>
              )}
            </div>
          )}
          <div className="mm-count">{t.tMinus(s.countdown)}</div>
          {s.ignitedAt === null ? (
            <>
              <button className={`mm-go ${s.countdown <= IGNITION_AT + 0.6 ? 'ready' : ''}`} onPointerDown={() => pressGo()} disabled={s.countdown > IGNITION_AT + 0.6}>
                {t.igniteHold}
              </button>
              <div className="mm-hint">{t.igniteHint}</div>
            </>
          ) : (
            <div className="mm-go-done">{t.ignitionGo}</div>
          )}
        </div>
      )}
      {flying && (
        <div className="mm-panel">
          <div className="mm-met">{t.met(r.t)}</div>
          <div className="mm-stage">{t.stageName[r.stage]}</div>
          <div className="mm-row">
            <span>{t.altitude}</span>
            <b>{t.km(r.alt / 1000)}</b>
          </div>
          <div className="mm-row">
            <span>{t.speed}</span>
            <b>{t.kms(r.speed / 1000)}</b>
          </div>
          <div className="mm-row">
            <span>{t.gee}</span>
            <b>{r.g.toFixed(1)}</b>
            <i className="mm-gbar">
              <i style={{ width: `${Math.min(100, (r.g / 4) * 100)}%` }} />
            </i>
          </div>
          {(s.phase === 'orbit' || s.phase === 'tli') && r.apo < 1e9 && <div className="mm-orbit">{t.orbitInfo(r.peri, r.apo)}</div>}
          {r.warp > 1.5 && <div className="mm-warp">{t.warp(r.warp)}</div>}
        </div>
      )}
      {s.phase === 'ascent' && r.stage < 2 && r.t > 10 && (
        <div className="mm-steer">
          <PitchDial pitch={r.pitch} guide={r.guide} />
          {!s.auto && <div className="mm-hint">{t.tiltHint}</div>}
        </div>
      )}
      {s.phase === 'ascent' && touch && !s.auto && r.stage < 2 && <TiltButtons />}
      {s.phase === 'orbit' && orbitT > TLI_WINDOW_OPEN - 300 && (
        <div className="mm-tli">
          <div className="mm-tli-label">{t.tliBar}</div>
          <div className="mm-tli-bar">
            <i className="mm-tli-window" style={{ left: `${(300 / (TLI_WINDOW + 600)) * 100}%`, width: `${(TLI_WINDOW / (TLI_WINDOW + 600)) * 100}%` }} />
            <i className="mm-tli-mark" style={{ left: `${Math.max(0, Math.min(1, windowPos)) * 100}%` }} />
          </div>
          <button className="mm-go ready" onPointerDown={() => pressGo()} disabled={orbitT < TLI_WINDOW_OPEN}>
            {t.tliGo}
          </button>
          <div className="mm-hint">{t.tliHint}</div>
        </div>
      )}
      <Caption />
      <div className="mm-buttons">
        <button onClick={() => cycleCam()}>
          {t.camLabel(t.camNames[s.cam])}
        </button>
        {s.phase === 'ascent' && (
          <button className={s.auto ? 'on' : ''} onClick={() => setAuto(!s.auto)}>
            {s.auto ? t.autoOn : t.auto}
          </button>
        )}
        <button className="mm-quit" onClick={() => endMission()}>
          {t.quit}
        </button>
      </div>
      {s.phase === 'outbound' && missionNow() - s.since > 9 && (
        <div className="mm-end">
          <div className="mm-end-title">{t.endTitle}</div>
          <div className="mm-end-stars">{t.stars(s.stars)}</div>
          <div className="mm-end-note">{t.starsNote}</div>
          <div className="mm-end-next">{t.endNext}</div>
          <div className="mm-end-buttons">
            <button className="mm-continue" onClick={() => startLunar()}>
              {t.lunar.continue}
            </button>
            <button onClick={() => restartMission()}>{t.again}</button>
            <button onClick={() => endMission()}>{t.back}</button>
          </div>
          {s.best.stars > 0 && <div className="mm-end-best">{t.best(s.best.stars)}</div>}
        </div>
      )}
    </div>
  )
}

/** 暗転の幕 */
function Fade() {
  const phase = useMoonMission((s) => s.phase)
  const dark = phase === 'fadeIn' || phase === 'leave'
  return <div className="mm-fade" style={{ opacity: dark ? 1 : 0, transitionDuration: `${MISSION_FADE}s` }} />
}

export function MoonMissionView() {
  const phase = useMoonMission((s) => s.phase)
  useEffect(() => bindMissionKeys(), [])
  useEffect(() => bindLunarKeys(), [])
  // スマホ：長押しの点火ボタンを離したとき
  useEffect(() => {
    const up = () => (missionInput.ignite = false)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])
  const shown = phase !== 'none' && phase !== 'fadeIn'
  const moon = lunarPhase(phase)
  return (
    <div className="mm-root" data-phase={phase}>
      {shown && <MissionCanvas moon={moon} />}
      {shown && !moon && <Hud />}
      {shown && moon && (
        <div className="mm-hud">
          <LunarHud />
          <Caption />
        </div>
      )}
      <Fade />
    </div>
  )
}
