import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { R_EARTH, STAGES, G0, CENTER_CUTOFF, S2_CENTER_CUTOFF } from '../../data/saturnAscent'
import { sim, showBeat, trackPoint, missionNow, useMoonMission, type missionReadout } from '../../state/moonMission'
import './ascentCards.css'

// 上昇の後半（第2段・第3段）に、画面の左下で入れかわる計器のカード（「8 秒ルール」：8 秒に 1 度は画面の何かが変わる）。
//   断面図：地球の丸み・宇宙の入口（100 km）・飛んできた道・海へ落ちていく第1段
//   エンジン：何基燃えているか（中央のエンジンを止めるのも本物の時刻）・燃料の残り・G
//   速さのものさし：音・ライフルの弾・地球を回る速さ（秒速 7.8 km）
// カメラの切り替え（LaunchWorld）と同じ拍で、4 秒ずらして入れかえる。

type Readout = ReturnType<typeof missionReadout>
type Card = 'profile' | 'engines' | 'speed'
/** 断面図は 2 回に 1 回（いちばん大事な絵） */
const ORDER: Card[] = ['profile', 'engines', 'profile', 'speed']
export const CARD_SEC = 8
/** エンジンのことを言う見出しが出たら、しばらくエンジンのカード */
const ENGINE_KEYS = new Set(['s2CenterCutoff', 'stage3Ign'])
const ENGINE_SEC = 6

export function AscentCards({ r, raised }: { r: Readout; raised: boolean }) {
  useLang()
  const phase = useMoonMission((s) => s.phase)
  const caption = useMoonMission((s) => s.caption)
  const beat = showBeat()
  if (phase !== 'ascent' || beat === null) return null
  let card = ORDER[Math.floor(beat / CARD_SEC) % ORDER.length]
  if (caption && ENGINE_KEYS.has(caption.key) && missionNow() - caption.at < ENGINE_SEC) card = 'engines'
  return (
    <div className={`ac-card ${raised ? 'raised' : ''}`} key={card} data-dull={card}>
      {card === 'profile' ? <Profile r={r} /> : card === 'engines' ? <Engines r={r} /> : <Speed r={r} />}
    </div>
  )
}

// ---- 断面図 ----------------------------------------------------------------------------------

const W = 300
const H = 150
const R_KM = R_EARTH / 1000
/** 高さの目盛り（px / km）。横より何倍か伸ばす */
const VS = 0.52
const ORBIT_KM = 170

let span: { d0: number; d1: number; ideal: [number, number][] } | null = null
/** 手本の道すじの長さから、横の目盛りを決める（1 度だけ） */
function profileSpan() {
  if (span && span.ideal.length) return span
  const ideal = sim.path.map(([x, y]) => trackPoint(x, y))
  const end = ideal.length ? ideal[ideal.length - 1][0] : 2000
  span = { d0: -60, d1: end * 1.08, ideal }
  return span
}

function Profile({ r }: { r: Readout }) {
  const t = ui().moonMission
  const c = t.cards
  const { d0, d1, ideal } = profileSpan()
  const hs = (W - 24) / (d1 - d0)
  const X = (d: number) => 12 + (d - d0) * hs
  const dm = (d0 + d1) / 2
  // 地表：本当の丸み（横と同じ目盛り）。端ほど下がる
  const surf = (d: number) => 124 + ((d - dm) * (d - dm) * hs) / (2 * R_KM)
  const P = (d: number, h: number) => `${X(d).toFixed(1)},${(surf(d) - h * VS).toFixed(1)}`
  const line = (pts: [number, number][]) => (pts.length ? 'M' + pts.map(([d, h]) => P(d, h)).join(' L') : '')
  const curve = (h: number) => {
    const pts: [number, number][] = []
    for (let i = 0; i <= 24; i++) pts.push([d0 + ((d1 - d0) * i) / 24, h])
    return line(pts)
  }
  const now = trackPoint(sim.a.x, sim.a.y)
  const track = [...sim.track, now]
  // 落ちていく第1段：いまの物理の時刻のところ
  const fall = sim.s1Fall
  let s1: [number, number] | null = null
  if (fall.length) {
    const i = fall.findIndex((p) => p[0] > r.t)
    const p = i < 0 ? fall[fall.length - 1] : i === 0 ? fall[0] : fall[i - 1]
    s1 = [p[1], p[2]]
  }
  const ground = `${curve(0)} L${W},${H} L0,${H} Z`
  const [nx, ny] = P(now[0], now[1]).split(',').map(Number)
  return (
    <>
      <div className="ac-title">{c.profile}</div>
      <svg className="ac-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <defs>
          <linearGradient id="ac-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3d7fc4" />
            <stop offset="1" stopColor="#0b1d33" />
          </linearGradient>
        </defs>
        <path d={`${curve(40)} L${W},${H} L0,${H} Z`} className="ac-air" />
        <path d={ground} fill="url(#ac-sea)" />
        <path d={curve(100)} className="ac-space" />
        <text x={X(d0) + 4} y={surf(d0 + 30) - 100 * VS - 4} className="ac-label">
          {c.space}
        </text>
        <path d={curve(ORBIT_KM)} className="ac-orbit" />
        <text x={W - 14} y={surf(d1) - ORBIT_KM * VS - 4} className="ac-label end">
          {c.orbitLine} {ORBIT_KM} km
        </text>
        <path d={line(ideal)} className="ac-ideal" />
        {fall.length > 0 && <path d={line(fall.map((p) => [p[1], p[2]] as [number, number]))} className="ac-fall" />}
        {s1 && (
          <>
            <circle cx={X(s1[0])} cy={surf(s1[0]) - s1[1] * VS} r={2.6} className="ac-s1" />
            <text x={X(s1[0]) + 5} y={surf(s1[0]) - s1[1] * VS + 12} className="ac-label s1">
              {c.s1}
            </text>
          </>
        )}
        <path d={line(track)} className="ac-track" />
        <polygon points={`${X(0) - 4},${surf(0)} ${X(0) + 4},${surf(0)} ${X(0)},${surf(0) - 7}`} className="ac-pad" />
        <text x={X(0)} y={surf(0) + 12} className="ac-label mid">
          {c.pad}
        </text>
        <circle cx={nx} cy={ny} r={7} className="ac-you-glow" />
        <circle cx={nx} cy={ny} r={3.4} className="ac-you" />
        <text x={nx} y={ny - 10} className="ac-label mid you">
          {c.you} {t.km(r.alt / 1000)}
        </text>
      </svg>
      <div className="ac-note">{c.profileScale(Math.round(VS / hs))}</div>
    </>
  )
}

// ---- エンジン --------------------------------------------------------------------------------

/** 4 基は四隅、1 基はまん中（サターンV の第1段・第2段の並び） */
const FIVE: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [0, 0],
]

function Engines({ r }: { r: Readout }) {
  const t = ui().moonMission
  const c = t.cards
  const a = sim.a
  const stage = Math.min(2, r.stage)
  const firing = r.thrust > 0
  const centerOff = (stage === 0 && r.t >= CENTER_CUTOFF) || (stage === 1 && a.s2Start >= 0 && r.t - a.s2Start >= S2_CENTER_CUTOFF)
  const spots: [number, number][] = stage === 2 ? [[0, 0]] : FIVE
  const lit = spots.map((_, i) => firing && !(centerOff && i === 4))
  const n = lit.filter(Boolean).length
  const def = STAGES[stage]
  const frac = Math.max(0, Math.min(1, r.prop / def.prop))
  const flow = r.thrust / (def.ispVac * G0)
  const left = flow > 0 ? Math.round(r.prop / flow) : 0
  const hot = stage === 0 ? 'f1' : 'j2'
  return (
    <>
      <div className="ac-title">
        {c.engines}　<span className="ac-sub">{t.stageName[stage]}</span>
      </div>
      <div className="ac-engines">
        <svg viewBox="-40 -40 80 80" className="ac-bells" aria-hidden>
          <circle r={38} className="ac-base" />
          {spots.map(([x, y], i) => (
            <g key={i} transform={`translate(${x * 19} ${y * 19})`}>
              {lit[i] && <circle r={13} className={`ac-flame ${hot}`} />}
              <circle r={8.5} className={`ac-bell ${lit[i] ? 'on ' + hot : 'off'}`} />
              {!lit[i] && <path d="M-4 -4 L4 4 M4 -4 L-4 4" className="ac-x" />}
            </g>
          ))}
        </svg>
        <div className="ac-lines">
          <div className="ac-big">{c.lit(n, spots.length)}</div>
          {centerOff && <div>{c.centerOff}</div>}
          <div className="ac-row">
            <span>{c.prop}</span>
            <i className="ac-bar">
              <i style={{ width: `${frac * 100}%` }} className={frac < 0.15 ? 'low' : ''} />
            </i>
            <b>{Math.round(frac * 100)}%</b>
          </div>
          <div className="ac-small">{stage === 2 ? c.keepTli : firing ? c.burnLeft(left) : ''}</div>
          <div className="ac-row">
            <span>G</span>
            <i className="ac-bar g">
              <i style={{ width: `${Math.min(100, (r.g / 4) * 100)}%` }} />
            </i>
            <b>{r.g.toFixed(1)}</b>
          </div>
          <div className="ac-small">{c.gee(r.g)}</div>
        </div>
      </div>
    </>
  )
}

// ---- 速さのものさし ----------------------------------------------------------------------------

const MAX_KMS = 8.2
const MARKS: { v: number; key: 'sound' | 'bullet' | 'orbitSpeed' }[] = [
  { v: 0.34, key: 'sound' },
  { v: 1.0, key: 'bullet' },
  { v: 7.8, key: 'orbitSpeed' },
]

function Speed({ r }: { r: Readout }) {
  const t = ui().moonMission
  const c = t.cards
  const v = r.speed / 1000
  const X = (k: number) => 10 + (k / MAX_KMS) * 280
  return (
    <>
      <div className="ac-title">{c.speedTitle}</div>
      <svg className="ac-svg short" viewBox="0 0 300 74" aria-hidden>
        <rect x={10} y={34} width={280} height={10} rx={5} className="ac-rail" />
        <rect x={10} y={34} width={Math.max(0, X(Math.min(v, MAX_KMS)) - 10)} height={10} rx={5} className="ac-fill" />
        {Array.from({ length: 9 }, (_, k) => (
          <g key={k}>
            <line x1={X(k)} x2={X(k)} y1={46} y2={51} className="ac-tick" />
            <text x={X(k)} y={61} className="ac-label mid dim">
              {k}
            </text>
          </g>
        ))}
        <text x={290} y={72} className="ac-label end dim">
          km/s
        </text>
        {MARKS.map((m, i) => (
          <g key={m.key}>
            <line x1={X(m.v)} x2={X(m.v)} y1={30} y2={46} className="ac-mark" />
            <text x={X(m.v) + (i === 1 ? 3 : 0)} y={i === 0 ? 14 : 26} className={`ac-label ${i === 2 ? 'end' : ''}`}>
              {c[m.key]}
            </text>
          </g>
        ))}
        <polygon points={`${X(v) - 5},${30} ${X(v) + 5},${30} ${X(v)},${37}`} className="ac-you" />
      </svg>
      <div className="ac-big">{c.perSec(v)}</div>
      <div className="ac-small">{c.toGo(Math.min(100, Math.round((v / 7.8) * 100)))}</div>
    </>
  )
}
