import { useState } from 'react'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'
import { useStore } from '../../state/store'
import { engage } from '../../state/flight'
import { build, nameColony, resetPioneer, stopPioneer, togglePanel, usePioneer } from '../../state/pioneer'
import { canPay, FIELD_ID, holdCapacity, RESOURCES, shortfall, STAGE_COUNT, STAGES, total, type Amounts } from '../../data/pioneer'
import { COLONY_ID, DOCK_ID } from '../../data/sf'
import './pioneer.css'

// 開拓の画面：いつも出る小さな積み荷のゲージと、開いたときの端末（倉庫・次の段階・行き先・建設）

function go(id: string) {
  const st = useStore.getState()
  st.setTarget(id)
  togglePanel(false)
  engage()
}

const fmt = (a: Amounts) =>
  RESOURCES.filter((r) => a[r] > 0)
    .map((r) => `${ui().pioneer.resource[r]} ${a[r]}`)
    .join(' · ')

export function PioneerPanel() {
  useLang()
  const p = usePioneer()
  const shipId = useStore((s) => s.settings.ship)
  const world = useStore((s) => s.settings.world)
  const mode = useStore((s) => s.mode)
  const [name, setName] = useState('')
  if (!p.active || world !== 'sf') return null
  const t = ui().pioneer
  const cap = holdCapacity(shipId)
  const next = STAGES[p.stage] ?? null
  const ready = !!next && canPay(p.store, next.cost)
  const short = next ? shortfall(p.store, next.cost) : null
  // 着陸・EVA・公園などの場面では、ゲージだけ隠す（開拓は続いている）
  const flying = mode === 'flight' || mode === 'map'

  return (
    <>
      {flying && (
        <div className="pioneer-hud" role="group" aria-label={t.title}>
          <span className="pio-title">{t.title}</span>
          <span className="pio-hold" aria-label={`${t.hold} ${total(p.hold)}/${cap}`}>
            {RESOURCES.map((r) => (
              <span key={r} className={`pio-bar pio-${r}`} style={{ width: `${(p.hold[r] / cap) * 100}%` }} />
            ))}
          </span>
          <span className="pio-count">
            {total(p.hold)}/{cap}
          </span>
          <button type="button" className="pio-open" onClick={() => togglePanel()} aria-expanded={p.panel}>
            {t.open}
          </button>
        </div>
      )}
      {p.panel && !p.naming && (
        <div className="pioneer-panel" role="dialog" aria-label={t.terminal}>
          <header>
            <h2>{t.terminal}</h2>
            <span className="pio-stage">{p.stage >= STAGE_COUNT ? `${t.doneBadge} · ${p.colonyName}` : t.stages(p.stage, STAGE_COUNT)}</span>
            <button type="button" className="close" onClick={() => togglePanel(false)} aria-label={t.close}>
              ×
            </button>
          </header>
          {p.stage === 0 && total(p.store) === 0 && (
            <ol className="pio-intro">
              {t.intro.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          )}
          <div className="pio-steps" aria-hidden>
            {STAGES.map((s, i) => (
              <span key={s.id} className={i < p.stage ? 'done' : i === p.stage ? 'now' : ''}>
                {t.stageName[s.id]}
              </span>
            ))}
          </div>
          <div className="pio-rows">
            <div>
              <h3>{t.hold}</h3>
              <p>{fmt(p.hold) || '—'}</p>
            </div>
            <div>
              <h3>{t.store}</h3>
              <p>{fmt(p.store) || '—'}</p>
            </div>
          </div>
          {next && short && (
            <div className="pio-next">
              <h3>{t.nextStage(t.stageName[next.id])}</h3>
              <p>
                {t.needLine(fmt(next.cost))}
                {ready ? <strong> · {t.ready}</strong> : <span className="pio-short"> · {t.short(fmt(short))}</span>}
              </p>
              <p className="pio-science">{t.stageScience[next.id]}</p>
              <button type="button" className="pio-build" disabled={!ready} onClick={() => build()}>
                {t.build}
              </button>
            </div>
          )}
          <div className="pio-go">
            <button type="button" onClick={() => go(FIELD_ID)}>
              {t.goField}
            </button>
            <button type="button" onClick={() => go('jupiter')}>
              {t.goJupiter}
            </button>
            <button type="button" onClick={() => go(DOCK_ID)}>
              {t.goDock}
            </button>
            <button type="button" onClick={() => go(COLONY_ID)}>
              {t.goSite}
            </button>
          </div>
          <footer>
            <button type="button" className="pio-quit" onClick={() => stopPioneer()}>
              {t.quit}
            </button>
            <button
              type="button"
              className="pio-reset"
              onClick={() => {
                if (window.confirm(t.resetConfirm)) resetPioneer()
              }}
            >
              {t.reset}
            </button>
          </footer>
        </div>
      )}
      {p.naming && (
        <form
          className="pioneer-panel pio-naming"
          role="dialog"
          aria-label={t.complete}
          onSubmit={(e) => {
            e.preventDefault()
            nameColony(name)
          }}
        >
          <h2>{t.complete}</h2>
          <p>{t.completeText}</p>
          <input value={name} maxLength={24} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} autoFocus />
          <button type="submit" className="pio-build">
            {t.nameOk}
          </button>
        </form>
      )}
    </>
  )
}
