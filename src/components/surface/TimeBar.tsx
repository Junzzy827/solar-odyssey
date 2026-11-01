import type { SurfaceDef } from '../../data/surfaces'
import { t, useLang } from '../../i18n/lang'
import { useMemo } from 'react'
import { dayHours, useSkyClock, type TimeRate } from './skyClock'
import { PROFILE_N, dayProfile, sampleAt, type DayProfile } from './dayProfile'
import { WEATHER_BODIES, useWeather, type WeatherMode } from './weather'

// 地表の時計：現地の時刻と、時間の速さ（止める・1 秒で 1 時間・1 日を 1 分で）。
// 月では「地球から見た今の月」の小窓も出す。月面の昼と夜は、地球から見た月の満ち欠けと同じ周期で巡る。

const pad = (n: number) => String(n).padStart(2, '0')

function dayText(id: string) {
  const h = Math.abs(dayHours(id))
  if (h < 48) return t(`1日 = 地球の${h.toFixed(1)}時間`, `1 day = ${h.toFixed(1)} Earth hours`)
  return t(`1日 = 地球の約${(h / 24).toFixed(h > 240 ? 0 : 1)}日`, `1 day ≈ ${(h / 24).toFixed(h > 240 ? 0 : 1)} Earth days`)
}

/** 満ち欠けの形（k = 見えている昼側の割合、waxing = 満ちていく途中なら右側が光る） */
function phasePath(k: number, waxing: boolean, r: number) {
  // 明暗の境目は楕円。半月（k = 0.5）でまっすぐ、新月・満月で円になる
  const rx = Math.abs(1 - 2 * k) * r
  const s = waxing ? 1 : 0
  // 光る側の半円 ＋ 境目の半楕円
  const bulge = k > 0.5 ? s : 1 - s
  return `M 0 ${-r} A ${r} ${r} 0 0 ${s} 0 ${r} A ${rx} ${r} 0 0 ${bulge} 0 ${-r} Z`
}

function phaseName(k: number, waxing: boolean) {
  if (k < 0.04) return t('新月', 'New moon')
  if (k > 0.96) return t('満月', 'Full moon')
  if (Math.abs(k - 0.5) < 0.06) return waxing ? t('上弦の月', 'First quarter') : t('下弦の月', 'Last quarter')
  if (k < 0.5) return waxing ? t('三日月のころ', 'Waxing crescent') : t('明け方の細い月', 'Waning crescent')
  return waxing ? t('満月に向かう月', 'Waxing gibbous') : t('欠けていく月', 'Waning gibbous')
}

function MoonFromEarth({ earthLit, earthWaxing }: { earthLit: number; earthWaxing: boolean }) {
  // 月から見た地球と、地球から見た月は、ちょうど反対の満ち欠け
  const k = 1 - earthLit
  const waxing = !earthWaxing
  return (
    <div className="moon-inset">
      <svg viewBox="-32 -32 64 64" width="56" height="56" aria-hidden>
        <circle r="28" fill="#1b1d22" stroke="#3a3f4a" strokeWidth="1" />
        <path d={phasePath(k, waxing, 28)} fill="#e9e4d6" />
      </svg>
      <div>
        <div className="muted">{t('いま地球から見た月', 'The Moon from Earth now')}</div>
        <b>{phaseName(k, waxing)}</b>
        <div className="muted small">{t(`空の地球は${k < 0.5 ? '満ちて' : '欠けて'}見えます`, `Earth in this sky looks ${k < 0.5 ? 'full-ish' : 'thin'}`)}</div>
      </div>
    </div>
  )
}


// ---- 1 日の温度と明るさのグラフ ------------------------------------------------------------

const GW = 210
const GH = 64
/** グラフの上端：水星の真昼（地球の約 7 倍）まで入るように */
const LUX_TOP = Math.log10(1e6)

/** 明るさの数字と、身近なたとえ（ルクス） */
function luxText(lx: number) {
  const value =
    lx >= 10000 ? t(`約${Math.round(lx / 10000)}万`, `~${Math.round(lx / 1000)}k`) :
    lx >= 10 ? t(`約${Math.round(lx)}`, `~${Math.round(lx)}`) :
    lx >= 0.1 ? t(`約${lx.toFixed(1)}`, `~${lx.toFixed(1)}`) : '0'
  const like =
    lx > 30000 ? t('真夏の日なた', 'bright summer sun') :
    lx > 3000 ? t('くもりの日の外', 'an overcast day') :
    lx > 300 ? t('明るい部屋', 'a bright room') :
    lx > 10 ? t('夕方の薄暗さ', 'dusk') :
    lx > 0.1 ? t('満月の夜', 'a full-moon night') :
    t('星明かりだけ', 'starlight only')
  return { value, unit: t('ルクス', ' lux'), like }
}

function DayGraph({ p, clock, extraLux, dim = 1 }: { p: DayProfile; clock: number; extraLux: number; dim?: number }) {
  const x = (k: number) => (k / PROFILE_N) * GW
  const ty = (c: number) => {
    const span = Math.max(1, p.max - p.min)
    return GH - 6 - ((c - p.min) / span) * (GH - 14)
  }
  const ly = (lx: number) => GH - (Math.log10(lx + 1) / LUX_TOP) * (GH - 4)
  const { night, lightPath, tempPath } = useMemo(() => {
    const night: [number, number][] = []
    let start = -1
    for (let k = 0; k <= PROFILE_N; k++) {
      const dark = k < PROFILE_N && p.el[k] <= 0
      if (dark && start < 0) start = k
      if (!dark && start >= 0) {
        night.push([x(start), x(k)])
        start = -1
      }
    }
    let lightPath = `M 0 ${GH}`
    let tempPath = ''
    for (let k = 0; k <= PROFILE_N; k++) {
      const i = k % PROFILE_N
      lightPath += ` L ${x(k).toFixed(1)} ${ly(p.lux[i]).toFixed(1)}`
      tempPath += `${k ? ' L' : 'M'} ${x(k).toFixed(1)} ${ty(p.temp[i]).toFixed(1)}`
    }
    lightPath += ` L ${GW} ${GH} Z`
    return { night, lightPath, tempPath }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p])
  const now = (clock / 24) * GW
  const temp = sampleAt(p.temp, clock)
  const lux = sampleAt(p.lux, clock) * dim + extraLux
  const L = luxText(lux)
  return (
    <div className="day-graph">
      <div className="day-now">
        <span className="temp-chip">{t('地表', 'Ground')} <b>{Math.round(temp)}℃</b></span>
        <span className="lux-chip">
          {t('明るさ', 'Light')} <b>{L.value}</b>
          {L.unit}
        </span>
      </div>
      <div className="muted small">{t(`いまは「${L.like}」くらい`, `About like ${L.like}`)}</div>
      <svg viewBox={`0 0 ${GW} ${GH + 12}`} width="100%" aria-hidden>
        {night.map(([a, b], i) => (
          <rect key={i} x={a} y={0} width={b - a} height={GH} fill="rgba(40,60,120,0.28)" />
        ))}
        <path d={lightPath} fill="rgba(255,200,90,0.35)" stroke="rgba(255,210,120,0.9)" strokeWidth="1" />
        <path d={tempPath} fill="none" stroke="#ff6a4a" strokeWidth="2" strokeLinejoin="round" />
        <line x1={now} x2={now} y1={0} y2={GH} stroke="#fff" strokeWidth="1.2" />
        <circle cx={now} cy={ty(temp)} r="3.2" fill="#ff6a4a" stroke="#fff" strokeWidth="1" />
        <text x={2} y={9} className="g-label">{`${p.max}℃`}</text>
        <text x={2} y={GH - 2} className="g-label">{`${p.min}℃`}</text>
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={Math.min(GW - 8, Math.max(0, (h / 24) * GW - 4))} y={GH + 10} className="g-label">
            {h}
          </text>
        ))}
      </svg>
      <div className="g-legend muted small">
        <span><i className="sw-temp" />{t('地表の温度', 'Ground temp')}</span>
        <span><i className="sw-light" />{t('明るさ', 'Light')}</span>
        <span><i className="sw-night" />{t('夜', 'Night')}</span>
      </div>
    </div>
  )
}

const RATES: { r: TimeRate; ja: string; en: string }[] = [
  { r: 0, ja: '止める', en: 'Pause' },
  { r: 1, ja: '1秒=1時間', en: '1 s = 1 h' },
  { r: 'day', ja: '1日を1分で', en: '1 day / min' },
]

const MODES: { m: WeatherMode; ja: string; en: string }[] = [
  { m: 'auto', ja: '自動', en: 'Auto' },
  { m: 'storm', ja: '砂嵐', en: 'Storm' },
  { m: 'clear', ja: '晴れ', en: 'Clear' },
]

/** 天気（火星）：自動で移り変わる。砂嵐を呼んだり、晴れにしたりもできる */
function WeatherRow() {
  const mode = useWeather((w) => w.mode)
  const setMode = useWeather((w) => w.setMode)
  const storm = useWeather((w) => w.storm)
  const now =
    storm > 0.6 ? t('砂嵐', 'Dust storm') : storm > 0.2 ? t('砂ぼこり', 'Dusty') : t('晴れ', 'Clear')
  return (
    <div className="weather-row">
      <span className="muted small">
        {t('天気', 'Weather')} <b>{now}</b>
      </span>
      <div className="time-rates">
        {MODES.map((x) => (
          <button key={x.m} className={mode === x.m ? 'active' : ''} onClick={() => setMode(x.m)}>
            {t(x.ja, x.en)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TimeBar({ def }: { def: SurfaceDef }) {
  useLang()
  const clock = useSkyClock((c) => c.clock)
  const rate = useSkyClock((c) => c.rate)
  const setRate = useSkyClock((c) => c.setRate)
  const bodyLit = useSkyClock((c) => c.bodyLit)
  const waxing = useSkyClock((c) => c.waxing)
  const profile = useMemo(() => dayProfile(def), [def])
  // 月の夜は、満ちた地球が地面を照らす（地球照：満月の数十倍の明るさ）
  const extraLux = def.id === 'moon' ? 12 * bodyLit * bodyLit : 0
  // 砂嵐の間は、地面に届く光が 1/4 ほどまで減る
  const storm = useWeather((w) => w.storm)
  const dim = WEATHER_BODIES.has(def.id) ? 1 - 0.75 * storm : 1
  const h = Math.floor(clock)
  const m = Math.floor((clock - h) * 60)
  return (
    <div className="surface-time">
      <div className="time-now">
        <span className="muted">{t('現地時刻', 'Local time')}</span> <b>{`${pad(h)}:${pad(m)}`}</b>
        <span className="muted small"> {dayText(def.id)}</span>
      </div>
      <div className="time-rates">
        {RATES.map((x) => (
          <button key={String(x.r)} className={rate === x.r ? 'active' : ''} onClick={() => setRate(x.r)}>
            {t(x.ja, x.en)}
          </button>
        ))}
      </div>
      {WEATHER_BODIES.has(def.id) && <WeatherRow />}
      <DayGraph p={profile} clock={clock} extraLux={extraLux} dim={dim} />
      {def.id === 'moon' && <MoonFromEarth earthLit={bodyLit} earthWaxing={waxing} />}
    </div>
  )
}
