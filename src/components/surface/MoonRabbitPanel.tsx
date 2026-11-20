import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { TALE_PAGES, followRabbit, isDusk, nextPage, quitRabbit, useMoonRabbit, waitForDusk } from '../../state/moonRabbit'
import { useSkyClock } from './skyClock'
import { useRover } from '../../state/rover'
import { useRally } from '../../state/rally'
import './moonRabbit.css'

// 月の光るウサギの画面の表示（state/moonRabbit.ts）：夕暮れのうわさ、現れたときのカード、ついていくあいだの表示、お話のカード

export function MoonRabbitPanel() {
  useLang()
  const phase = useMoonRabbit((r) => r.phase)
  const page = useMoonRabbit((r) => r.page)
  const left = useMoonRabbit((r) => r.left)
  const waiting = useMoonRabbit((r) => r.waiting)
  const met = useMoonRabbit((r) => r.met)
  const dusk = useSkyClock((c) => isDusk(c.clock))
  const rover = useRover((r) => r.phase)
  const racing = useRally((r) => r.phase !== 'off')
  const t = ui().moonRabbit
  if (racing) return null
  if (phase === 'off') {
    // まだ会ったことがなく、夕暮れでもないとき：うわさと「夕暮れを待つ」
    if (met || dusk || (rover !== 'none' && rover !== 'drive')) return null
    return (
      <div className="moon-rabbit-hint">
        <span>{t.hint}</span>
        <button className="secondary" onClick={waitForDusk}>
          {t.waitDusk}
        </button>
      </div>
    )
  }
  if (phase === 'appear')
    return (
      <div className="moon-rabbit-card">
        <div className="mr-title">{t.appearTitle}</div>
        <p>{met ? t.appearAgain : t.appearText}</p>
        <div className="mr-row">
          <button className="secondary" onClick={quitRabbit}>
            {t.later}
          </button>
          <button className="primary" onClick={followRabbit}>
            {rover === 'none' ? t.followRover : t.follow}
          </button>
        </div>
      </div>
    )
  if (phase === 'follow')
    return (
      <div className="moon-rabbit-chip">
        <span className="mr-k">{t.following}</span>
        <span>{waiting ? t.waiting : t.left(left)}</span>
        <button className="secondary" onClick={quitRabbit}>
          {t.quit}
        </button>
      </div>
    )
  if (phase === 'tale') {
    const last = page + 1 >= TALE_PAGES
    return (
      <div className="moon-rabbit-card tale">
        <div className="mr-page">{t.pageOf(page + 1, TALE_PAGES)}</div>
        <p className="mr-tale">{t.tale[page]}</p>
        {last && <p className="mr-note">{t.taleNote}</p>}
        <div className="mr-row">
          <button className="secondary" onClick={quitRabbit}>
            {t.quit}
          </button>
          <button className="primary" onClick={nextPage}>
            {last ? t.bye : `${t.next} ▸`}
          </button>
        </div>
      </div>
    )
  }
  return null
}
