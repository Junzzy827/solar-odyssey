import { useMemo } from 'react'
import { t, useLang } from '../../i18n/lang'
import { RALLY_COLORS } from '../../state/rally'
import { hiscoreTable, useRallyHiscore } from '../../state/rallyHiscore'

// ローバーレースのハイスコア表（レース場ごと）：結果のカードに上位 10、スタートのカードに上位 3。
// 自分の記録（このブラウザ）と、ゲームに入っている記録（data/rallyRecords.ts）がいっしょに並ぶ。

const fmt = (s: number) => {
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`
}
const day = (ms: number) => {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`
}
const ORD = ['1st', '2nd', '3rd', '4th']

/** top 位まで。mark（今回の走りの日時）が top より下なら、すきまをあけてその行も出す */
export function RallyHiscore({ track, top, mark }: { track: string; top: number; mark?: number }) {
  useLang()
  const rev = useRallyHiscore((h) => h.rev)
  const rows = useMemo(() => hiscoreTable(track), [track, rev])
  const marked = mark === undefined ? undefined : rows.find((r) => r.result.at === mark && r.result.name === undefined)
  const list = rows.slice(0, top).map((r) => ({ ...r, gap: false }))
  if (marked && marked.rank > top) list.push({ ...marked, gap: true })
  return (
    <div className="rally-hiscore">
      <div className="rally-hiscore-title">
        {t('ハイスコア', 'Hiscores')}
        {marked && <small> · {t(`今回 ${marked.rank}位`, `this run: #${marked.rank}`)}</small>}
      </div>
      {list.length === 0 ? (
        <div className="muted small">{t('まだ記録がありません', 'No finished races yet')}</div>
      ) : (
        <ol>
          {list.map(({ rank, result, gap }) => (
            <li key={result.at + ':' + rank} className={(result === marked?.result ? 'you' : '') + (gap ? ' gap' : '')} style={{ ['--c' as string]: RALLY_COLORS[result.color]?.hex ?? '#888' }}>
              <span className="n">{rank}.</span>
              <span className="dot" />
              <span className="who">{result.name ?? t('あなた', 'You')}</span>
              <span className="when">{day(result.at)}</span>
              {result.caught !== undefined ? (
                <span className="pl" title={t('つかまえたローバー', 'Rovers caught')}>
                  {result.caught}/3
                </span>
              ) : (
                <span className="pl">{t(`${result.place}位`, ORD[result.place - 1])}</span>
              )}
              <span className="t">{fmt(result.time)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
