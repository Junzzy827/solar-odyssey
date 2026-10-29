import { formatTime, useRace } from '../state/race'

/** レースの表示：カウントダウン、タイム、輪の数、ライバルの位置、結果 */
export function RacePanel() {
  const r = useRace()
  if (r.phase === 'idle') return null
  if (r.phase === 'countdown') {
    const n = Math.ceil(r.countdown)
    return <div className="race-countdown">{n > 3 ? 'READY' : n}</div>
  }
  if (r.phase === 'finished' && r.result) {
    const { time, rivalTime, win, best, newBest } = r.result
    return (
      <section className="race-result" aria-label="レースの結果">
        <h2>{win ? 'ゴール！ライバルに勝ちました' : 'ゴール！ライバルの勝ち'}</h2>
        <dl>
          <div>
            <dt>あなた</dt>
            <dd>{formatTime(time)}</dd>
          </div>
          <div>
            <dt>ライバル</dt>
            <dd>{rivalTime === null ? 'まだ飛行中' : formatTime(rivalTime)}</dd>
          </div>
          <div>
            <dt>ベスト</dt>
            <dd>
              {formatTime(best)}
              {newBest && <span className="badge">新記録</span>}
            </dd>
          </div>
        </dl>
        <div className="race-buttons">
          <button className="engage" onClick={r.start}>
            もう一度
          </button>
          <button className="secondary" onClick={r.stop}>
            終わる
          </button>
        </div>
      </section>
    )
  }
  return (
    <div className="race-bar">
      <span className="race-time">{formatTime(r.elapsed)}</span>
      <span>
        輪 {Math.min(r.gate, r.gateCount)} / {r.gateCount}
      </span>
      <span className="muted">ライバル {Math.min(r.rivalGate, r.gateCount)} / {r.gateCount}</span>
      {r.boosted && <span className="race-boost">スイングバイ加速</span>}
      <button className="race-quit" onClick={r.stop}>
        やめる
      </button>
    </div>
  )
}
