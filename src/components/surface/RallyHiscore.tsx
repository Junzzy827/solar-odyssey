import { useMemo } from 'react'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'
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
        {ui().rallyHiscore.hiscores}
        {marked && <small> · {ui().rallyHiscore.thisRun(marked.rank)}</small>}
      </div>
      {list.length === 0 ? (
        <div className="muted small">{ui().rallyHiscore.noRecords}</div>
      ) : (
        <ol>
          {list.map(({ rank, result, gap }) => (
            <li key={result.at + ':' + rank} className={(result === marked?.result ? 'you' : '') + (gap ? ' gap' : '')} style={{ ['--c' as string]: RALLY_COLORS[result.color]?.hex ?? '#888' }}>
              <span className="n">{rank}.</span>
              <span className="dot" />
              <span className="who">{result.name ?? ui().rallyHiscore.you}</span>
              <span className="when">{day(result.at)}</span>
              {result.caught !== undefined ? (
                <span className="pl" title={ui().rallyHiscore.roversCaught}>
                  {result.caught}/3
                </span>
              ) : (
                <span className="pl">{ui().rallyHiscore.place(result.place)}</span>
              )}
              <span className="t">{fmt(result.time)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
