import { useEffect } from 'react'
import { APOLLO17, APOLLO17_TOTAL, type Historic } from '../data/apollo17'
import { closeHistoricBook, useHistoric } from '../state/historic'
import { t, useLang } from '../i18n/lang'

// アポロ17号の史跡ずかん：タウルス・リットロウ谷で訪ねた場所の話。まだの場所は ？？？ と、着陸船からの向きと距離だけ

const pick = (p: [string, string]) => t(p[0], p[1])
const DIRS_JA = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
const DIRS_EN = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']

/** 着陸地点（レース場のスタート）からの向きと距離 */
function where(it: Historic) {
  const d = Math.hypot(it.x, it.z)
  const k = Math.round(((Math.atan2(it.x, -it.z) * 180) / Math.PI + 360) / 45) % 8
  const dist = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`
  return t(`着陸地点から${DIRS_JA[k]}へ ${dist}`, `${dist} ${DIRS_EN[k]} of the landing spot`)
}

function Detail({ it, got }: { it: Historic; got: boolean }) {
  return (
    <div className={`rock-detail${got ? ' got' : ''}`}>
      <button className="secondary rock-back" onClick={() => useHistoric.setState({ sel: null })}>
        ◀ {t('一覧へ', 'Back')}
      </button>
      <div className="historic-detail">
        <span className="historic-icon big">{got ? it.icon : '？'}</span>
        <div className="rock-text">
          <h3>{got ? pick(it.name) : '？？？'}</h3>
          {got ? (
            <>
              <p className="historic-when">{pick(it.when)}</p>
              <p>{pick(it.story)}</p>
            </>
          ) : (
            <p className="muted">
              {t('まだ訪ねていない場所です。', 'Not visited yet. ')}
              {t(`月のタウルス・リットロウ谷（月の追いかけっこ場）で、${where(it)}。光の柱をめざしてローバーで走ろう。`, `In the Taurus-Littrow valley on the Moon (the Moon chase track), ${where(it)}. Drive the rover to the light beam.`)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function HistoricBook() {
  useLang()
  const open = useHistoric((s) => s.book)
  const sel = useHistoric((s) => s.sel)
  const found = useHistoric((s) => s.found)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.stopPropagation()
      if (useHistoric.getState().sel) useHistoric.setState({ sel: null })
      else closeHistoricBook()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  const it = APOLLO17.find((x) => x.id === sel)
  return (
    <section className="rock-book historic-book" role="dialog" aria-label={t('アポロ17号の史跡ずかん', 'Apollo 17 site book')}>
      <header>
        <h2>{t('アポロ17号の史跡ずかん', 'Apollo 17 site book')}</h2>
        <span className="rock-total">
          {found.length} / {APOLLO17_TOTAL}
        </span>
        <button className="close" onClick={closeHistoricBook} aria-label={t('閉じる', 'Close')}>
          ×
        </button>
      </header>
      {it ? (
        <Detail it={it} got={found.includes(it.id)} />
      ) : (
        <>
          <p className="muted small">
            {t(
              '1972年12月、アポロ17号のセルナン船長とシュミット飛行士は、この谷で3日間、月面車で探検しました。人が月を歩いたのは、今のところこれが最後です。2人が残した物や、立ち寄った観測点を、ローバーで訪ねてみよう。',
              'In December 1972, Apollo 17 astronauts Eugene Cernan and Harrison Schmitt explored this valley for three days in their lunar rover. It is still the last time people walked on the Moon. Drive the rover to what they left behind and to the stations where they stopped.',
            )}
          </p>
          <div className="rock-grid historic-grid">
            {APOLLO17.map((x) => {
              const got = found.includes(x.id)
              return (
                <button key={x.id} className={`rock-card historic-item${got ? ' got' : ''}`} onClick={() => useHistoric.setState({ sel: x.id })}>
                  <span className="historic-icon">{got ? x.icon : '？'}</span>
                  <span className="rock-name">{got ? pick(x.name) : x.no ? t(`観測点${x.no}`, `Station ${x.no}`) : '？？？'}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
