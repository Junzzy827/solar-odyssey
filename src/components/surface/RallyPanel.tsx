import { useEffect, useState } from 'react'
import { t, useLang } from '../../i18n/lang'
import { COUNT_SEC, RALLY_COLORS, loadBest, quitRally, rallyNow, setRallyColor, startRally, useRally } from '../../state/rally'
import { roverInput } from '../../state/rover'
import { TRACKS } from '../../data/rallyTracks'
import { useLanding } from '../../state/landing'
import { RallyHiscore } from './RallyHiscore'

// 峡谷レースの画面の表示：色えらびとスタート、3・2・1、タイム・順位・次の門、門の区間タイム、結果。

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`
}

const colorName = (i: number) => t(RALLY_COLORS[i].ja, RALLY_COLORS[i].en)

/** スタート前のカード：色をえらぶ・自己ベスト・スタート */
export function RallyStart({ track, compact = false }: { track: string; compact?: boolean }) {
  useLang()
  const tr = TRACKS[track]
  const color = useRally((r) => r.color)
  const best = loadBest()
  return (
    <div className={`rally-start${compact ? ' compact' : ''}`}>
      <div className="rally-title">🏁 {t(tr.title[0], tr.title[1])}</div>
      {!compact && (
        <p>
          {t(tr.intro[0], tr.intro[1])}
        </p>
      )}
      <div className="rally-colors" role="radiogroup" aria-label={t('ローバーの色', 'Rover colour')}>
        {RALLY_COLORS.map((c, i) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={i === color}
            className={i === color ? 'on' : ''}
            style={{ ['--c' as string]: c.hex }}
            onClick={() => setRallyColor(i)}
            title={colorName(i)}
          >
            <span className="dot" />
            <span className="nm">{colorName(i)}</span>
          </button>
        ))}
      </div>
      {!compact && <RallyHiscore track={track} top={3} />}
      <div className="rally-row">
        {best && <span className="rally-best">{t('自己ベスト', 'Best')} {fmtTime(best.time)}</span>}
        <button className="primary rally-go" onClick={startRally}>
          {t('スタート', 'Start')}
        </button>
      </div>
    </div>
  )
}

/** レース中の表示 */
export function RallyPanel() {
  useLang()
  const phase = useRally((r) => r.phase)
  const since = useRally((r) => r.since)
  const time = useRally((r) => r.time)
  const place = useRally((r) => r.place)
  const gate = useRally((r) => r.gate)
  const gates = useRally((r) => r.gates)
  const toGate = useRally((r) => r.toGate)
  const split = useRally((r) => r.split)
  const lost = useRally((r) => r.lost)
  const result = useRally((r) => r.result)
  const color = useRally((r) => r.color)
  const chase = useRally((r) => r.chase)
  const track = useLanding((l) => l.site)
  const isChase = !!(track && TRACKS[track]?.chase)
  // 3・2・1 の数字を変えるため、数え中だけ画面を書き換える
  const [, tick] = useState(0)
  useEffect(() => {
    if (phase !== 'count' && phase !== 'run') return
    const id = window.setInterval(() => tick((n) => n + 1), 100)
    return () => window.clearInterval(id)
  }, [phase])
  if (phase === 'off') return null
  const now = rallyNow()
  const left = COUNT_SEC - (now - since)
  const showGo = phase === 'run' && now - since < 1.2
  const showSplit = split && now - split.at < 2.5
  return (
    <div className="rally-ui">
      {phase === 'deploy' && <div className="rally-banner">{t('ローバーを準備中…', 'Getting the rover ready…')}</div>}
      {phase === 'count' && left > 0 && (
        <div className="rally-count" key={Math.ceil(left)}>
          {left > COUNT_SEC - 0.6 ? t('位置について', 'On your marks') : Math.ceil(Math.min(3, left))}
        </div>
      )}
      {showGo && <div className="rally-count go">GO!</div>}
      {(phase === 'run' || phase === 'count') && (
        <div className="rally-hud" style={{ ['--c' as string]: RALLY_COLORS[color].hex }}>
          <span className="rally-time">{fmtTime(time)}</span>
          {isChase ? (
            <span className="rally-place" title={t('つかまえたローバー', 'Rovers caught')}>
              {t('つかまえた ', 'Caught ')}
              <b>{chase?.caught.length ?? 0}</b>
              <small>/3</small>
            </span>
          ) : (
            <span className="rally-place">
              <b>{place}</b>
              {t('位', '')}
              <small>/4</small>
            </span>
          )}
          <span className="rally-gate">
            {gate >= gates ? t('ゴール', 'Finish') : gate === gates - 1 ? t('次はゴール', 'Next: finish') : t(`門 ${gate + 1}/${gates}`, `Gate ${gate + 1}/${gates}`)}
            {toGate && (
              <>
                <span className="rally-arrow" style={{ transform: `rotate(${toGate.rel}deg)` }}>
                  ▲
                </span>
                {toGate.dist} m
              </>
            )}
          </span>
        </div>
      )}
      {phase === 'run' && showSplit && split && (
        <div className={`rally-split${split.diff === null ? '' : split.diff <= 0 ? ' faster' : ' slower'}`}>
          {split.gate >= gates ? t('ゴール！', 'Finish!') : t(`門 ${split.gate}`, `Gate ${split.gate}`)} {fmtTime(split.time)}
          {split.diff !== null && <b>{(split.diff <= 0 ? '−' : '+') + Math.abs(split.diff).toFixed(1)}</b>}
        </div>
      )}
      {phase === 'run' && chase && chase.last >= 0 && now - chase.at < 2.5 && (
        <div className="rally-count chase-caught" style={{ ['--c' as string]: RALLY_COLORS[chase.last].hex }}>
          {t(`${RALLY_COLORS[chase.last].name[0]}をつかまえた！`, `Caught ${RALLY_COLORS[chase.last].name[1]}!`)}
        </div>
      )}
      {phase === 'run' && lost && (
        <div className="rover-edge">
          {t('門を通っていません', 'You missed a gate')}
          <small>{t('矢印の門へもどるか、R（もどる）で直前の門へ', 'Head back to the arrowed gate, or press R (Back) to return to the last gate')}</small>
        </div>
      )}
      {phase === 'done' && result && (
        <div className="rally-result">
          <div className="rally-title">
            {isChase
              ? (chase?.caught.length ?? 0) === 3
                ? t('3台ぜんぶつかまえた！🏆', 'You caught all three! 🏆')
                : t(`${chase?.caught.length ?? 0}台つかまえた`, `You caught ${chase?.caught.length ?? 0} of 3`)
              : result.place === 1
                ? t('優勝！🏆', 'You won! 🏆')
                : t(`${result.place}位でゴール`, `Finished ${['1st', '2nd', '3rd', '4th'][result.place - 1]}`)}
          </div>
          <div className="rally-big">{fmtTime(result.time)}</div>
          {result.newBest ? <div className="rally-new">{t('自己ベスト更新！', 'New personal best!')}</div> : <div className="muted">{t(`自己ベスト ${fmtTime(result.best)}`, `Best ${fmtTime(result.best)}`)}</div>}
          {isChase ? (
            <ul className="rally-chase-result">
              {result.order
                .filter((e) => !e.you)
                .map((e) => {
                  const got = chase?.caught.includes(e.color)
                  return (
                    <li key={e.color} className={got ? 'got' : ''} style={{ ['--c' as string]: RALLY_COLORS[e.color].hex }}>
                      <span className="dot" />
                      {t(RALLY_COLORS[e.color].name[0], RALLY_COLORS[e.color].name[1])}
                      <span className="t">{got ? t('つかまえた！', 'Caught!') : t('にげられた', 'Got away')}</span>
                    </li>
                  )
                })}
            </ul>
          ) : (
          <ol>
            {result.order.map((e, i) => (
              <li key={e.color} className={e.you ? 'you' : ''} style={{ ['--c' as string]: RALLY_COLORS[e.color].hex }}>
                <span className="n">{i + 1}.</span>
                <span className="dot" />
                {e.you ? t('あなた', 'You') : t(RALLY_COLORS[e.color].name[0], RALLY_COLORS[e.color].name[1])}
                <span className="t">{e.time !== null ? fmtTime(e.time) : '—'}</span>
              </li>
            ))}
          </ol>
          )}
          {track && <RallyHiscore track={track} top={10} mark={result.at} />}
          <div className="rally-row">
            <button className="secondary" onClick={quitRally}>
              {t('自由に走る', 'Free drive')}
            </button>
            <button className="primary" onClick={startRally}>
              {t('もう一度', 'Race again')}
            </button>
          </div>
        </div>
      )}
      {(phase === 'run' || phase === 'count') && (
        <div className="rally-actions">
          <button className="secondary" disabled={phase !== 'run'} onClick={() => (roverInput.reset = true)} title={t('直前の門へもどる', 'Back to the last gate')}>
            ↺ {t('もどる', 'Back')} <kbd>R</kbd>
          </button>
          <button className="secondary" onClick={quitRally}>
            {t('レースをやめる', 'Quit race')}
          </button>
        </div>
      )}
    </div>
  )
}
