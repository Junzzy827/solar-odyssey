import { formatTime, useRace } from '../state/race'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

/** レースの表示：カウントダウン、タイム、輪の数、ライバルの位置、結果 */
export function RacePanel() {
  const r = useRace()
  useLang()
  if (r.phase === 'idle') return null
  if (r.phase === 'countdown') {
    const n = Math.ceil(r.countdown)
    return <div className="race-countdown">{n > 3 ? 'READY' : n}</div>
  }
  if (r.phase === 'finished' && r.result) {
    const { time, rivalTime, win, best, newBest } = r.result
    return (
      <section className="race-result" aria-label={ui().racePanel.raceResults}>
        <h2>{win ? ui().racePanel.youWon : ui().racePanel.rivalWon}</h2>
        <dl>
          <div>
            <dt>{ui().racePanel.you}</dt>
            <dd>{formatTime(time)}</dd>
          </div>
          <div>
            <dt>{ui().racePanel.rival}</dt>
            <dd>{rivalTime === null ? ui().racePanel.stillFlying : formatTime(rivalTime)}</dd>
          </div>
          <div>
            <dt>{ui().racePanel.best}</dt>
            <dd>
              {formatTime(best)}
              {newBest && <span className="badge">{ui().racePanel.newRecord}</span>}
            </dd>
          </div>
        </dl>
        <div className="race-buttons">
          <button className="engage" onClick={r.start}>
            {ui().racePanel.raceAgain}
          </button>
          <button className="secondary" onClick={r.stop}>
            {ui().racePanel.done}
          </button>
        </div>
      </section>
    )
  }
  return (
    <div className="race-bar">
      <span className="race-time">{formatTime(r.elapsed)}</span>
      <span>
        {ui().racePanel.rings} {Math.min(r.gate, r.gateCount)} / {r.gateCount}
      </span>
      <span className="muted">
        {ui().racePanel.rival} {Math.min(r.rivalGate, r.gateCount)} / {r.gateCount}
      </span>
      {r.boosted && <span className="race-boost">{ui().racePanel.swingByBoost}</span>}
      <button className="race-quit" onClick={r.stop}>
        {ui().racePanel.quit}
      </button>
    </div>
  )
}
