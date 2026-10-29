import { formatTime, useRace } from '../state/race'
import { t, useLang } from '../i18n/lang'

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
      <section className="race-result" aria-label={t('レースの結果', 'Race results')}>
        <h2>{win ? t('ゴール！ライバルに勝ちました', 'Finish! You beat your rival') : t('ゴール！ライバルの勝ち', 'Finish! Your rival won')}</h2>
        <dl>
          <div>
            <dt>{t('あなた', 'You')}</dt>
            <dd>{formatTime(time)}</dd>
          </div>
          <div>
            <dt>{t('ライバル', 'Rival')}</dt>
            <dd>{rivalTime === null ? t('まだ飛行中', 'still flying') : formatTime(rivalTime)}</dd>
          </div>
          <div>
            <dt>{t('ベスト', 'Best')}</dt>
            <dd>
              {formatTime(best)}
              {newBest && <span className="badge">{t('新記録', 'New record')}</span>}
            </dd>
          </div>
        </dl>
        <div className="race-buttons">
          <button className="engage" onClick={r.start}>
            {t('もう一度', 'Race again')}
          </button>
          <button className="secondary" onClick={r.stop}>
            {t('終わる', 'Done')}
          </button>
        </div>
      </section>
    )
  }
  return (
    <div className="race-bar">
      <span className="race-time">{formatTime(r.elapsed)}</span>
      <span>
        {t('輪', 'Rings')} {Math.min(r.gate, r.gateCount)} / {r.gateCount}
      </span>
      <span className="muted">
        {t('ライバル', 'Rival')} {Math.min(r.rivalGate, r.gateCount)} / {r.gateCount}
      </span>
      {r.boosted && <span className="race-boost">{t('スイングバイ加速', 'Swing-by boost')}</span>}
      <button className="race-quit" onClick={r.stop}>
        {t('やめる', 'Quit')}
      </button>
    </div>
  )
}
