import { useState } from 'react'
import { useRover, ROVER_RANGE, ROVER_TOP } from '../../state/rover'
import { LANDER_POS } from './terrain'
import { useMapTerrain, useRelief, type ReliefLayer } from './mapRelief'
import { t, useLang } from '../../i18n/lang'
import { isTouchDevice } from '../../state/input'

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

/** ミニマップ：着陸船を中心に、走れる範囲（正方形）・採集の岩・ローバーの位置と向き。
 * 広い天体（3 km 四方）では、ローバーのまわり 400 m と、範囲全体を、地図の右上のボタンで切り替える */
export function RoverMap() {
  useLang()
  const hud = useRover((r) => r.hud)
  const sites = useRover((r) => r.sites)
  const taken = useRover((r) => r.taken)
  const edge = useRover((r) => r.edge)
  const R = useRover((r) => r.range)
  const [whole, setWhole] = useState(false)
  const map = useRover((r) => r.map)
  const menu = useRover((r) => r.menu)
  const wide = R > ROVER_RANGE
  const pad = 6
  // 地図の座標は、今までの 200 m 四方の地図と同じ大きさ（半分の幅 V）。世界の座標は (x - cx) / k で地図へ
  const V = ROVER_RANGE + Math.max(Math.abs(LANDER_POS.x), Math.abs(LANDER_POS.y)) + pad
  let cx = LANDER_POS.x
  let cz = LANDER_POS.y
  let k = 1
  let gridStep = 50
  let label = '200 m'
  if (wide && whole) {
    cx = 0
    cz = 0
    k = (R * 1.04) / V
    gridStep = R >= 1000 ? 500 : 100
    label = R * 2 >= 1000 ? `${(R * 2) / 1000} km` : `${R * 2} m`
  } else if (wide) {
    cx = hud.x
    cz = hud.z
    k = 200 / V
    label = '400 m'
  }
  const mx = (x: number) => (x - cx) / k
  const mz = (z: number) => (z - cz) / k
  // 地形の陰影と等高線。広い天体では範囲全体の 1 枚と、近くを見るときのローバーのまわり 600 m の細かい 1 枚。
  // 細かいほうは 100 m ごとの位置に合わせて作るので、ローバーが 50 m 以上動いたときだけ作り直す
  const terrain = useMapTerrain((m) => m.terrain)
  const pois = wide ? (terrain?.pois ?? []) : []
  /** 見どころに残っている、まだ採っていない岩の数 */
  const left = (id: string) => sites.filter((s, i) => s.poi === id && !taken.includes(i)).length
  const coarse = useRelief(terrain, wide ? { cx: 0, cz: 0, half: R * 1.04 } : { cx: LANDER_POS.x, cz: LANDER_POS.y, half: V })
  const fine = useRelief(terrain, wide && !whole ? { cx: Math.round(hud.x / 100) * 100, cz: Math.round(hud.z / 100) * 100, half: 300 } : null)
  const relief = (l: ReliefLayer | null) =>
    l && <image href={l.url} x={mx(l.x0)} y={mz(l.z0)} width={l.size / k} height={l.size / k} preserveAspectRatio="none" opacity={0.9} />
  const half = V * k
  const lines: number[] = []
  if (wide) {
    for (let g = Math.ceil((cx - half) / gridStep) * gridStep; g <= cx + half; g += gridStep) lines.push(g)
  }
  const gridZ: number[] = []
  if (wide) for (let g = Math.ceil((cz - half) / gridStep) * gridStep; g <= cz + half; g += gridStep) gridZ.push(g)
  const grid = [-100, -50, 0, 50, 100]
  const lx = mx(LANDER_POS.x)
  const lz = mz(LANDER_POS.y)
  // スマホでは、メニューを開いているあいだは地図を小さなボタンにたたむ（画面がふさがらないように）。
  // そのボタンを押すと、メニューを閉じて地図を出す
  const touch = isTouchDevice()
  if (!map || (touch && menu)) {
    return (
      <button
        type="button"
        className={`rover-map-chip${edge ? ' edge' : ''}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          useRover.setState(touch ? { map: true, menu: false } : { map: true })
        }}
        title={t('ミニマップを出す', 'Show the minimap')}
      >
        <span className="chip-icon">▦</span> {t('地図', 'Map')}
      </button>
    )
  }
  return (
    <div className={`rover-map${edge ? ' edge' : ''}`}>
      <svg viewBox={`${-V} ${-V} ${V * 2} ${V * 2}`} aria-label={t('ミニマップ', 'Minimap')}>
        {relief(coarse)}
        {wide && !whole && relief(fine)}
        {wide ? (
          <>
            {lines.map((g) => (
              <line key={`x${g}`} className="m-grid-line" x1={mx(g)} y1={-V} x2={mx(g)} y2={V} />
            ))}
            {gridZ.map((g) => (
              <line key={`z${g}`} className="m-grid-line" x1={-V} y1={mz(g)} x2={V} y2={mz(g)} />
            ))}
          </>
        ) : (
          grid.map((g) => (
            <g key={g} className="m-grid">
              <line x1={mx(g)} y1={mz(-R)} x2={mx(g)} y2={mz(R)} />
              <line x1={mx(-R)} y1={mz(g)} x2={mx(R)} y2={mz(g)} />
            </g>
          ))
        )}
        <rect x={mx(-R)} y={mz(-R)} width={(R * 2) / k} height={(R * 2) / k} className="m-range" />
        <circle cx={lx} cy={lz} r={6} className="m-lander" />
        <path d={`M ${lx} ${lz - 11} L ${lx + 9} ${lz + 7} L ${lx - 9} ${lz + 7} Z`} className="m-lander-mark" />
        {/* 見どころ：広さの円と名前。近くの地図で範囲の外にあるときは、地図のふちに向きの三角だけ */}
        {pois.map((p) => {
          const x = mx(p.x)
          const z = mz(p.z)
          const rr = Math.max(p.r / k, 6)
          const inside = Math.abs(x) < V - 8 && Math.abs(z) < V - 8
          // 円が地図にかかっているか（地図の四角から円の中心までの距離 < 半径）
          const near = Math.hypot(Math.max(0, Math.abs(x) - V), Math.max(0, Math.abs(z) - V)) < rr
          const a = Math.atan2(z, x)
          const e = (V - 9) / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)))
          return (
            <g key={p.id}>
              {near && <circle cx={x} cy={z} r={rr} className="m-poi-area" />}
              {inside ? (
                <>
                  <circle cx={x} cy={z} r={4} className="m-poi" />
                  <text x={x} y={z + 19} className="m-poi-name">
                    {t(p.name.ja, p.name.en)}
                    {left(p.id) > 0 && <tspan className="m-poi-rocks"> ◆{left(p.id)}</tspan>}
                  </text>
                </>
              ) : (
                <path d="M 0 -8 L 6 4 L -6 4 Z" className="m-poi-edge" transform={`translate(${Math.cos(a) * e} ${Math.sin(a) * e}) rotate(${(a * 180) / Math.PI + 90})`} />
              )}
            </g>
          )
        })}
        {sites.map((p, i) => {
          const x = mx(p.x)
          const z = mz(p.z)
          return taken.includes(i) ? <circle key={i} cx={x} cy={z} r={3.5} className="m-rock taken" /> : <rect key={i} x={x - 4.5} y={z - 4.5} width={9} height={9} transform={`rotate(45 ${x} ${z})`} className="m-rock" />
        })}
        <g transform={`translate(${mx(hud.x)} ${mz(hud.z)}) rotate(${hud.hdg})`}>
          <path d="M 0 -13 L 8 9 L 0 4 L -8 9 Z" className="m-rover" />
        </g>
      </svg>
      <span className="m-n">N</span>
      <span className="m-scale">{label}</span>
      <button
        type="button"
        className="m-fold"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          useRover.setState({ map: false })
        }}
        title={t('ミニマップをたたむ', 'Hide the minimap')}
        aria-label={t('ミニマップをたたむ', 'Hide the minimap')}
      >
        −
      </button>
      {wide && (
        <button
          type="button"
          className="m-swap"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            setWhole((w) => !w)
          }}
        >
          {whole ? t('近く', 'Near') : t('全体', 'All')}
        </button>
      )}
    </div>
  )
}
