import type { SurfaceDef } from '../../data/surfaces'
import { t, useLang } from '../../i18n/lang'
import { dayHours, useSkyClock, type TimeRate } from './skyClock'

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

const RATES: { r: TimeRate; ja: string; en: string }[] = [
  { r: 0, ja: '止める', en: 'Pause' },
  { r: 1, ja: '1秒=1時間', en: '1 s = 1 h' },
  { r: 'day', ja: '1日を1分で', en: '1 day / min' },
]

export function TimeBar({ def }: { def: SurfaceDef }) {
  useLang()
  const clock = useSkyClock((c) => c.clock)
  const rate = useSkyClock((c) => c.rate)
  const setRate = useSkyClock((c) => c.setRate)
  const bodyLit = useSkyClock((c) => c.bodyLit)
  const waxing = useSkyClock((c) => c.waxing)
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
      {def.id === 'moon' && <MoonFromEarth earthLit={bodyLit} earthWaxing={waxing} />}
    </div>
  )
}
