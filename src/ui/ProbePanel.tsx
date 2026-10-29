import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { PROBES, dateMs } from '../data/probes'
import { EPOCH_MS, formatDate } from '../data/ephemeris'
import { closeProbes, pathAt, playProbe, probeById, probeClock, probePath, realDistanceNow, togglePlay, useProbes } from '../state/probes'
import { useStore } from '../state/store'
import { raceActive, useRace } from '../state/race'

const YEAR_MS = 365.25 * 86_400_000
/** 1天文単位（億km） */
const AU_OKU_KM = 1.496

/** 再生中の日付と、太陽からの距離（0.2秒おきに読む） */
function useReplayReadout(probeId: string | null) {
  const [now, setNow] = useState({ ms: 0, au: 0 })
  const path = useRef<ReturnType<typeof probePath> | null>(null)
  useEffect(() => {
    const probe = probeById(probeId)
    path.current = probe ? probePath(probe) : null
    if (!probe) return
    const p = new THREE.Vector3()
    // 最後の天体を過ぎて1年たったら、本物の距離（まっすぐ遠ざかる速さから）を出す。道すじの形はおおよそなので
    const last = probe.stops[probe.stops.length - 1]
    const realFrom = dateMs(last.until ?? last.date) + YEAR_MS
    const read = () => {
      const d = probe.distance
      const real = d && probeClock.ms > realFrom ? d.au + (d.auPerYear * (probeClock.ms - dateMs(d.date))) / YEAR_MS : null
      setNow({ ms: probeClock.ms, au: real ?? (path.current ? pathAt(path.current, probeClock.ms, p).point.length() : 0) })
    }
    read()
    const id = setInterval(read, 200)
    return () => clearInterval(id)
  }, [probeId])
  return now
}

/** 今も飛んでいる探査機の、今の距離の説明 */
function nowText(id: string) {
  const probe = probeById(id)
  const au = probe ? realDistanceNow(probe) : null
  if (!probe || au === null) return null
  const hours = (au * 8.317) / 60
  return `今日（${formatDate(new Date(EPOCH_MS))}）は太陽から約${Math.round(au)}天文単位、約${Math.round(au * AU_OKU_KM)}億km。電波が届くのに約${Math.round(hours)}時間かかります。`
}

/** 探査機の旅：一覧から選ぶと、打ち上げから順に、惑星をその日の位置に動かしながら道すじをたどる */
export function ProbePanel() {
  const { open, probeId, playing, event, finished } = useProbes()
  const mode = useStore((s) => s.mode)
  const racePhase = useRace((r) => r.phase)
  const readout = useReplayReadout(open ? probeId : null)
  const list = useRef<HTMLOListElement>(null)
  const probe = probeById(probeId)

  // 全体マップを離れたり、レースが始まったりしたら閉じる（惑星を元の時間に戻す）
  useEffect(() => {
    if (open && (mode !== 'map' || raceActive())) closeProbes()
  }, [open, mode, racePhase])

  // 今のできごとが見えるように
  useEffect(() => {
    list.current?.querySelector('.now')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [event])

  if (!open) return null

  return (
    <section className="probe-panel" aria-label="探査機の旅">
      <header>
        <h2>探査機の旅{probe && <span style={{ color: probe.color }}>：{probe.name}</span>}</h2>
        <button className="close" onClick={closeProbes} aria-label="閉じる">
          ×
        </button>
      </header>

      {!probe ? (
        <>
          <p className="muted">本物の探査機がたどった道を、打ち上げの日から再生します。惑星も、その日の本当の位置に動きます。</p>
          <div className="probe-list">
            {PROBES.map((p) => (
              <button key={p.id} className="nav-item" onClick={() => playProbe(p.id)}>
                <span className="probe-dot" style={{ background: p.color }} />
                <span>
                  {p.name}
                  <span className="muted small"> {p.summary}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="probe-date">
            {formatDate(new Date(readout.ms))}
            <span className="muted">太陽から約{readout.au < 10 ? readout.au.toFixed(1) : Math.round(readout.au)}天文単位</span>
          </div>
          <ol className="probe-events" ref={list}>
            {probe.events.map((e, i) => (
              <li key={e.date} className={i === event ? 'now' : i < event ? 'past' : ''}>
                <span className="probe-when">{formatDate(new Date(dateMs(e.date)))}</span>
                {e.text}
              </li>
            ))}
            {finished && (
              <li className="now">
                {probe.last} {nowText(probe.id)}
              </li>
            )}
          </ol>
          <div className="probe-controls">
            <button className="secondary" onClick={togglePlay}>
              {finished ? 'もう一度' : playing ? '一時停止' : '再生'}
            </button>
            <button className="secondary" onClick={() => useProbes.setState({ probeId: null, playing: false })}>
              ほかの探査機
            </button>
          </div>
        </>
      )}
      <p className="muted small">道すじは、通った天体を太陽のまわりの弧でつないだ、おおよその形です。日付と、通った天体は本物です。</p>
    </section>
  )
}
