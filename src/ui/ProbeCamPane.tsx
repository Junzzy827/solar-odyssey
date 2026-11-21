import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { Probe } from '../data/probes'
import { captionScene, flybyNumbers, planetRadiusKm, probeNow, type CaptionScene } from '../data/probeView'
import { probeClock, useProbes } from '../state/probes'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import '../styles/probeCam.css'

// 探査機の旅の右側（スマホの縦では上）：探査機の模型と、本物の速さ・距離、字幕の解説。
// 3D は別の Canvas（開いたときだけ読み込む）

const ProbeCamCanvas = lazy(() => import('../components/probeCam/ProbeCamCanvas'))

/** 光が1分に進む距離（km） */
const LIGHT_KM_PER_MIN = 299_792.458 * 60
/** 惑星と惑星のあいだの豆知識を変える間隔（ミリ秒） */
const CRUISE_MS = 6000

type Readout = { scene: CaptionScene; speed: number; relKm: number | null; body: string; earthKm: number; geoSpeed: number }

function useReadout(probe: Probe): Readout {
  const t = probe.trajectory!
  const read = (): Readout => {
    const now = probeNow(t, probeClock.ms)
    const relKm = now.rel ? Math.hypot(...now.rel) : null
    return {
      scene: captionScene(t, now),
      speed: now.speed,
      relKm,
      body: now.encounter.body,
      earthKm: now.earthKm,
      geoSpeed: now.relV ? Math.hypot(...now.relV) : 0,
    }
  }
  const [r, setR] = useState(read)
  useEffect(() => {
    const id = setInterval(() => setR(read()), 200)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe])
  return r
}

/** 字幕（2行まで）。場面が変わったら、ふわっと入れかえる */
function Caption({ probe, r }: { probe: Probe; r: Readout }) {
  useLang()
  const t = probe.trajectory!
  const numbers = useMemo(() => Object.fromEntries(t.encounters.slice(1).map((e) => [e.body, flybyNumbers(t, e)])), [t])
  const [tick, setTick] = useState(0)
  const after = r.scene.kind === 'cruise' ? r.scene.after : null
  useEffect(() => {
    if (!after) return
    setTick(0)
    const id = setInterval(() => setTick((k) => k + 1), CRUISE_MS)
    return () => clearInterval(id)
  }, [after])
  const c = ui().probeCam
  const s = r.scene
  let text = ''
  let key = s.kind
  if (s.kind === 'launch') {
    text = s.step === 0 ? c.launch.burnout(r.geoSpeed) : s.step === 1 ? c.launch.moon(c.distance(r.relKm ?? 0)) : c.launch.helio(r.speed)
    key += s.step
  } else if (s.kind === 'flyby') {
    const name = c.planet[s.body] ?? s.body
    const lines = c.flyby(name, numbers[s.body])
    text = lines[s.step]
    key += s.body + s.step
  } else if (s.kind === 'cruise') {
    // 通ったばかりの惑星の見どころ → 豆知識を順に
    const facts = [...(c.extra[s.after] ? [c.extra[s.after]] : []), ...c.cruise]
    const k = tick % facts.length
    const line = facts[k]
    text = typeof line === 'function' ? line(c.distance(r.earthKm), c.lightTime(r.earthKm / LIGHT_KM_PER_MIN)) : line
    key += s.after + k
  } else text = c.beyond(r.speed)
  return (
    <p className="pc-caption" key={key}>
      {text}
    </p>
  )
}

/** 太陽から見た速さの計器（0〜45 km/s） */
function SpeedGauge({ speed }: { speed: number }) {
  const c = ui().probeCam
  return (
    <div className="pc-speed">
      <span className="pc-speed-label">{c.speed}</span>
      <span className="pc-speed-value">{c.speedValue(speed)}</span>
      <span className="pc-speed-bar">
        <span style={{ width: `${Math.min(100, (speed / 45) * 100)}%` }} />
      </span>
    </div>
  )
}

export function ProbeCamPane({ probe }: { probe: Probe }) {
  useLang()
  const playing = useProbes((s) => s.playing)
  const r = useReadout(probe)
  const c = ui().probeCam
  const near = r.relKm !== null && r.body !== 'earth' ? c.toPlanet(c.planet[r.body] ?? r.body, c.distance(r.relKm)) : null
  const radii = r.relKm !== null ? r.relKm / planetRadiusKm(r.body) : 0
  return (
    <section className={`probe-cam${playing ? '' : ' paused'}`} aria-label={ui().probes[probe.id].name}>
      <Suspense fallback={<p className="pc-loading">{c.loading}</p>}>
        <ProbeCamCanvas trajectory={probe.trajectory!} model={probe.model!} />
      </Suspense>
      <div className="pc-top">
        <SpeedGauge speed={r.speed} />
        {near ? (
          <p className={`pc-near${radii < 12 ? ' close' : ''}`}>{near}</p>
        ) : (
          <p className="pc-near muted">{c.fromEarth(c.distance(r.earthKm), c.lightTime(r.earthKm / LIGHT_KM_PER_MIN))}</p>
        )}
      </div>
      <Caption probe={probe} r={r} />
      <p className="pc-credit">
        {c.credit} · {c.dragHint}
      </p>
    </section>
  )
}
