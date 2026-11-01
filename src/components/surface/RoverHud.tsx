import { useRover, ROVER_RANGE, ROVER_TOP } from '../../state/rover'
import { LANDER_POS } from './terrain'
import { t, useLang } from '../../i18n/lang'

// ローバーの計器：速度計（0〜60 km/h の弧）と、向き・傾き・着陸船からの距離・宙に浮いているかの表示

const TOP_KMH = Math.round(ROVER_TOP * 3.6)
const CX = 100
const CY = 92
const R = 78
const SWEEP = 240
const START = 210 // 0 km/h の向き（度、右が 0、上が 90）

function at(kmh: number, r: number) {
  const a = ((START - (SWEEP * kmh) / TOP_KMH) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const
}

function arc(from: number, to: number, r: number) {
  const [x0, y0] = at(from, r)
  const [x1, y1] = at(to, r)
  const large = ((to - from) / TOP_KMH) * SWEEP > 180 ? 1 : 0
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

const TICKS = Array.from({ length: TOP_KMH / 5 + 1 }, (_, i) => i * 5)
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function RoverHud() {
  useLang()
  const kmh = useRover((r) => r.kmh)
  const hud = useRover((r) => r.hud)
  const next = useRover((r) => r.next)
  const v = Math.min(kmh, TOP_KMH)
  const [nx, ny] = at(v, R - 16)
  const [bx, by] = at(v, R - 34)
  return (
    <div className={`rover-hud${hud.air ? ' air' : ''}`}>
      <svg className="rover-gauge" viewBox="0 0 200 140" aria-label={`${kmh} km/h`}>
        <defs>
          <linearGradient id="rover-gauge-fill" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#5fd4ff" />
            <stop offset="0.65" stopColor="#ffc46b" />
            <stop offset="1" stopColor="#ff5a3c" />
          </linearGradient>
          <filter id="rover-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* 弧の地と、速さのぶんだけ光る弧 */}
        <path d={arc(0, TOP_KMH, R)} className="g-track" />
        <path d={arc(TOP_KMH * 0.83, TOP_KMH, R)} className="g-red" />
        {v > 0.2 && <path d={arc(0, v, R)} className="g-fill" filter="url(#rover-glow)" />}
        {TICKS.map((k) => {
          const major = k % 10 === 0
          const [x0, y0] = at(k, R - 9)
          const [x1, y1] = at(k, R - (major ? 19 : 14))
          const [tx, ty] = at(k, R - 29)
          return (
            <g key={k}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} className={major ? 'g-tick major' : 'g-tick'} />
              {major && (
                <text x={tx} y={ty + 3.5} className="g-num">
                  {k}
                </text>
              )}
            </g>
          )
        })}
        <line x1={bx} y1={by} x2={nx} y2={ny} className="g-needle" filter="url(#rover-glow)" />
        <text x={CX} y={CY + 14} className="g-speed">
          {kmh}
        </text>
        <text x={CX} y={CY + 30} className="g-unit">
          km/h
        </text>
      </svg>
      <div className="rover-readouts">
        <div className="rr-row">
          <span className="rr-k">{t('方位', 'HDG')}</span>
          <span className="rr-v">
            {String(hud.hdg).padStart(3, '0')}° <small>{DIRS[Math.round(hud.hdg / 45) % 8]}</small>
          </span>
        </div>
        <div className="rr-row">
          <span className="rr-k">{t('傾き', 'TILT')}</span>
          <span className="rr-tilt" title={`${hud.pitch}° / ${hud.roll}°`}>
            <span className="rr-horizon" style={{ transform: `translateY(${Math.max(-8, Math.min(8, hud.pitch * 0.4))}px) rotate(${-hud.roll}deg)` }} />
            <span className="rr-wings" />
          </span>
          <span className="rr-v small">
            {hud.pitch > 0 ? '+' : ''}
            {hud.pitch}°
          </span>
        </div>
        <div className="rr-row">
          <span className="rr-k">{t('距離', 'DIST')}</span>
          <span className="rr-v">
            {hud.dist} <small>m</small>
          </span>
        </div>
        <div className="rr-row">
          <span className="rr-k">{t('岩', 'ROCK')}</span>
          {next ? (
            <>
              <span className="rr-next" style={{ transform: `rotate(${next.rel}deg)` }}>
                ▲
              </span>
              <span className="rr-v">
                {next.dist} <small>m</small>
              </span>
            </>
          ) : (
            <span className="rr-v small">{t('完了', 'done')}</span>
          )}
        </div>
        <div className={`rr-air${hud.air ? ' on' : ''}`}>{t('空中', 'AIR')}</div>
      </div>
      <div className="rover-badge">ORV-7</div>
    </div>
  )
}

/** ミニマップ：着陸船を中心に、走れる範囲（正方形）・採集の岩・ローバーの位置と向き */
export function RoverMap() {
  useLang()
  const hud = useRover((r) => r.hud)
  const sites = useRover((r) => r.sites)
  const taken = useRover((r) => r.taken)
  const edge = useRover((r) => r.edge)
  const R = ROVER_RANGE
  const pad = 6
  // 着陸船を真ん中に。範囲の正方形は原点が中心なので、少しずれる
  const cx = LANDER_POS.x
  const cz = LANDER_POS.y
  const half = R + Math.max(Math.abs(cx), Math.abs(cz)) + pad
  const grid = [-100, -50, 0, 50, 100]
  return (
    <div className={`rover-map${edge ? ' edge' : ''}`}>
      <svg viewBox={`${cx - half} ${cz - half} ${half * 2} ${half * 2}`} aria-label={t('ミニマップ', 'Minimap')}>
        {grid.map((g) => (
          <g key={g} className="m-grid">
            <line x1={g} y1={-R} x2={g} y2={R} />
            <line x1={-R} y1={g} x2={R} y2={g} />
          </g>
        ))}
        <rect x={-R} y={-R} width={R * 2} height={R * 2} className="m-range" />
        <circle cx={cx} cy={cz} r={6} className="m-lander" />
        <path d={`M ${cx} ${cz - 11} L ${cx + 9} ${cz + 7} L ${cx - 9} ${cz + 7} Z`} className="m-lander-mark" />
        {sites.map((p, i) => (taken.includes(i) ? <circle key={i} cx={p.x} cy={p.z} r={3.5} className="m-rock taken" /> : <rect key={i} x={p.x - 4.5} y={p.z - 4.5} width={9} height={9} transform={`rotate(45 ${p.x} ${p.z})`} className="m-rock" />))}
        <g transform={`translate(${hud.x} ${hud.z}) rotate(${hud.hdg})`}>
          <path d="M 0 -13 L 8 9 L 0 4 L -8 9 Z" className="m-rover" />
        </g>
      </svg>
      <span className="m-n">N</span>
      <span className="m-scale">200 m</span>
    </div>
  )
}
