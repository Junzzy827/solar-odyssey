import { APOLLO17, APOLLO17_TOTAL } from '../../data/apollo17'
import { openHistoricBook, useHistoric } from '../../state/historic'
import { useRover } from '../../state/rover'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { HistoricPhoto } from '../../ui/HistoricPhoto'

// アポロ17号の史跡：運転中の「ずかん n/13」ボタンと次の史跡への矢印、近づいたときのカード

const far = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

export function HistoricStatus() {
  useLang()
  const found = useHistoric((s) => s.found)
  const hud = useRover((r) => r.hud)
  let next: (typeof APOLLO17)[number] | null = null
  let d = Infinity
  for (const it of APOLLO17) {
    if (found.includes(it.id)) continue
    const k = Math.hypot(it.x - hud.x, it.z - hud.z)
    if (k < d) {
      d = k
      next = it
    }
  }
  // 北が 0、右回りの向き。ローバーの向き（hdg）からの角度で矢印を回す
  const rel = next ? (Math.atan2(next.x - hud.x, -(next.z - hud.z)) * 180) / Math.PI - hud.hdg : 0
  return (
    <div className="historic-status">
      <button className="historic-count" onClick={openHistoricBook} title={ui().historicPanel.openBook}>
        🚀 {ui().historicPanel.apollo17} {found.length}/{APOLLO17_TOTAL} <span className="sample-book">{ui().historicPanel.book} ▸</span>
      </button>
      {next ? (
        <span className="sample-guide historic-guide">
          <span className="sg-arrow" style={{ transform: `rotate(${rel}deg)` }}>
            ▲
          </span>
          {ui().historicPanel.toNextSite(ui().apollo17[next.id].name, far(d))}
        </span>
      ) : (
        <span className="sample-guide historic-guide">{ui().historicPanel.allVisited}</span>
      )}
    </div>
  )
}

export function HistoricCard() {
  useLang()
  const card = useHistoric((s) => s.card)
  const found = useHistoric((s) => s.found)
  const it = APOLLO17.find((x) => x.id === card)
  if (!it) return null
  return (
    <div className="sample-card historic-card">
      <div className="sample-head">
        <span className="historic-icon">{it.icon}</span>
        <div>
          <div className="sample-kicker">{ui().historicPanel.siteFound}</div>
          <div className="sample-name">{ui().apollo17[it.id].name}</div>
          <div className="historic-when">{ui().apollo17[it.id].when}</div>
        </div>
      </div>
      <p className="sample-note">{ui().apollo17[it.id].story}</p>
      <HistoricPhoto it={it} />
      <div className="sample-foot">
        <span>
          {ui().historicPanel.sitesVisited} {found.length} / {APOLLO17_TOTAL}
        </span>
        <button className="secondary" onClick={() => useHistoric.setState({ card: null })}>
          {ui().historicPanel.close}
        </button>
      </div>
    </div>
  )
}
