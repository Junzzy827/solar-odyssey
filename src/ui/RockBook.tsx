import { useEffect } from 'react'
import { ROCK_GROUPS, ROCK_TOTAL, foundAt, rockCount, rockImage, type RockGroup } from '../data/rockCollection'
import type { RockSample } from '../data/rockSamples'
import { PLANETS } from '../data/bodies'
import { nearLander, spotsOf } from '../data/rockSpots'
import { useSampleLog } from '../state/rover'
import { closeRocks, useRockBook } from '../state/rockBook'
import { named, t, useLang } from '../i18n/lang'

function bodyName(id: string) {
  for (const p of PLANETS) {
    if (p.id === id) return named(p)
    const m = p.moons.find((x) => x.id === id)
    if (m) return named(m)
  }
  return id
}

const groupName = (g: RockGroup) => (g.name[0] ? t(g.name[0], g.name[1]) : bodyName(g.id))
const pick = (pair: [string, string]) => t(pair[0], pair[1])

function RockCard({ g, k, found }: { g: RockGroup; k: RockSample; found: boolean }) {
  return (
    <button className={`rock-card${found ? ' got' : ''}`} onClick={() => useRockBook.setState({ sel: `${g.id}:${k.id}` })}>
      <span className="rock-pic">
        <img src={rockImage(k.id)} alt="" loading="lazy" draggable={false} />
        {!found && <span className="rock-q">?</span>}
      </span>
      <span className="rock-name">{found ? pick(k.name) : '？？？'}</span>
    </button>
  )
}

function RockDetail({ g, k }: { g: RockGroup; k: RockSample }) {
  const log = useSampleLog((l) => l.log)
  const at = foundAt(g, k.id, log)
  const found = at.length > 0
  const where = g.bodies.length > 3 ? groupName(g) : g.bodies.map(bodyName).join('・')
  // どこで採れるか：着陸地点のまわりか、見どころ（名前がかぶるものは 1 つに）
  const atLander = g.bodies.some((b) => nearLander(b, k.id))
  const spots = [...new Set(g.bodies.flatMap((b) => spotsOf(b, k.id).map((p) => t(p.name.ja, p.name.en))))].slice(0, 3)
  const hint = atLander
    ? t(`${where}に着陸して、ローバーで光の柱の岩を探してみよう。`, `Land on ${where} and look for the rocks marked by light beams with the rover.`)
    : t(
        `${where}の見どころ「${spots.join('」「')}」で見つかるかも。ミニマップの ◆ をめざして走ろう。`,
        `Try the ${spots.join(', ')} on ${where}. Drive to the ◆ on the minimap.`,
      )
  const max = Math.max(...k.comp.map((c) => c[1]))
  return (
    <div className={`rock-detail${found ? ' got' : ''}`}>
      <button className="secondary rock-back" onClick={() => useRockBook.setState({ sel: null })}>
        ◀ {t('一覧へ', 'Back')}
      </button>
      <div className="rock-detail-body">
        <span className="rock-pic big">
          <img src={rockImage(k.id)} alt={found ? pick(k.name) : ''} draggable={false} />
          {!found && <span className="rock-q">?</span>}
        </span>
        <div className="rock-text">
          <h3>{found ? pick(k.name) : '？？？'}</h3>
          {found ? (
            <>
              <p>{pick(k.note)}</p>
              <div className="sample-comp">
                {k.comp.map(([label, v]) => (
                  <div className="sample-bar" key={label}>
                    <span className="sb-k">{label}</span>
                    <span className="sb-track">
                      <span className="sb-fill" style={{ width: `${(v / max) * 100}%` }} />
                    </span>
                    <span className="sb-v">{v}%</span>
                  </div>
                ))}
              </div>
              <p className="muted small">
                {t('見つけた場所：', 'Found on: ')}
                {at.map(bodyName).join('・')}
              </p>
            </>
          ) : (
            <p className="muted">
              {t('まだ見つけていない岩です。', 'Not found yet. ')}
              {hint}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** 岩石コレクション：ローバーで採集した岩の図鑑。まだの岩はシルエットと ？？？ */
export function RockBook() {
  const open = useRockBook((r) => r.open)
  const sel = useRockBook((r) => r.sel)
  const log = useSampleLog((l) => l.log)
  useLang()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.stopPropagation()
      if (useRockBook.getState().sel) useRockBook.setState({ sel: null })
      else closeRocks()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  const [gid, kid] = sel?.split(':') ?? []
  const g = ROCK_GROUPS.find((x) => x.id === gid)
  const k = g?.samples.find((s) => s.id === kid)

  return (
    <section className="rock-book" role="dialog" aria-label={t('岩石コレクション', 'Rock collection')}>
      <header>
        <h2>{t('岩石コレクション', 'Rock collection')}</h2>
        <span className="rock-total">
          {rockCount(log)} / {ROCK_TOTAL}
        </span>
        <button className="close" onClick={closeRocks} aria-label={t('閉じる', 'Close')}>
          ×
        </button>
      </header>
      {g && k ? (
        <RockDetail g={g} k={k} />
      ) : (
        <>
          <p className="muted small">
            {t(
              '惑星や衛星に着陸してローバーを出し、岩を採集すると、ここに標本が並びます。まだ見つけていない岩はシルエットだけ。タップすると説明が読めます。',
              'Land, send out the rover and collect rocks to fill this collection. Rocks you have not found yet show only as silhouettes. Tap one to read about it.',
            )}
          </p>
          {ROCK_GROUPS.map((grp) => {
            const got = grp.samples.filter((s) => foundAt(grp, s.id, log).length > 0).length
            return (
              <div key={grp.id} className="rock-group">
                <h3>
                  {groupName(grp)} <span className="muted">{got}/{grp.samples.length}</span>
                </h3>
                <div className="rock-grid">
                  {grp.samples.map((s) => (
                    <RockCard key={s.id} g={grp} k={s} found={foundAt(grp, s.id, log).length > 0} />
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
