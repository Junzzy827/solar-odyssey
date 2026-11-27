import { NAV_SHELVES, navEntries, type NavEntry } from './registry'
import { NavEntryButton } from './NavEntryButton'
import { markTried, useTried } from './tried'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'
import './playCards.css'

// 航法コンピュータの「遊ぶ」タブ：入口を絵のカードにして、3 つの棚（歴史の偉業／物語／自由に遊ぶ）にならべる。
// まだ遊んでいないものの最初の 1 枚を「次のおすすめ」にして大きく出す。カードの無い入口は、棚の下にふつうのボタンで

/** 遊んだことがあるか（カードの tried が無ければ、カードを押したことがあるか） */
const triedOf = (e: NavEntry, ids: string[]) => e.card?.tried?.() || ids.includes(e.id)

/** 1 枚のカード（entry.use はこの部品の中で呼ぶ。フックの順番が入口ごとに決まる） */
function PlayCard({ entry, rec, tried, onPick }: { entry: NavEntry; rec: boolean; tried: boolean; onPick: () => void }) {
  const st = entry.use?.() ?? {}
  const card = entry.card!
  const t = ui().playCards
  const flag = st.on ? (
    <span className="nav-card-flag on">{t.playing}</span>
  ) : st.badge !== undefined ? (
    <span className="nav-card-flag">{st.badge}</span>
  ) : tried ? (
    <span className="nav-card-flag done">{t.tried}</span>
  ) : null
  return (
    <button
      className={`nav-entry nav-card${entry.className ? ` ${entry.className}` : ''}${st.on ? ' on' : ''}${rec ? ' rec' : ''}`}
      data-nav={entry.id}
      data-shelf={card.shelf}
      onClick={() => (markTried(entry.id), onPick(), entry.run())}
      disabled={st.disabled}
    >
      <span className="nav-card-pic">
        <img src={`${import.meta.env.BASE_URL}${card.image}`} alt="" loading="lazy" draggable={false} />
        {rec && <span className="nav-card-rec">{t.recommend}</span>}
        {flag}
        {st.progress !== undefined && (
          <span className="nav-card-bar">
            <i style={{ width: `${Math.round(Math.min(1, Math.max(0, st.progress)) * 100)}%` }} />
          </span>
        )}
      </span>
      <span className="nav-card-title">
        {card.title()}
        {entry.kbd && <kbd>{entry.kbd}</kbd>}
      </span>
      <span className="nav-card-desc">{card.desc()}</span>
    </button>
  )
}

export function PlayShelves({ sf, onPick }: { sf: boolean; onPick: () => void }) {
  useLang()
  const ids = useTried((s) => s.ids)
  const all = navEntries('play', sf ? 'sf' : 'real')
  const t = ui().playCards
  const shelves = NAV_SHELVES.map((shelf) => ({ shelf, cards: all.filter((e) => e.card?.shelf === shelf) })).filter((s) => s.cards.length > 0)
  const plain = all.filter((e) => !e.card)
  // 次のおすすめ：棚の順に見て、まだ遊んでいない最初の 1 枚
  const rec = shelves.flatMap((s) => s.cards).find((e) => !triedOf(e, ids))
  return (
    <div className="play-shelves">
      {shelves.map(({ shelf, cards }) => (
        <section key={shelf} className="play-shelf" data-shelf={shelf}>
          <h3 className="play-shelf-head">
            {t.shelves[shelf]}
            <span className="muted">{t.shelfNotes[shelf]}</span>
          </h3>
          <div className="play-cards">
            {cards.map((e) => (
              <PlayCard key={e.id} entry={e} rec={e === rec} tried={triedOf(e, ids)} onPick={onPick} />
            ))}
          </div>
        </section>
      ))}
      {plain.length > 0 && (
        <div className="play-more">
          {plain.map((e) => (
            <NavEntryButton key={e.id} entry={e} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  )
}
