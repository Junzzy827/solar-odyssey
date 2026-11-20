import { useState } from 'react'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'
import { useStore } from '../../state/store'
import { build, nameColony, resetPioneer, stopPioneer, togglePanel, usePioneer } from '../../state/pioneer'
import { canPay, FIELD_ID, NAME_MAX, RESOURCES, shortfall, STAGE_COUNT, STAGES, type Amounts } from '../../data/pioneer'
import { COLONY_ID, DOCK_ID } from '../../data/sf'
import { PioneerHud } from './PioneerHud'
import { PioneerGuide } from './PioneerGuide'
import { GasGauge } from './GasGauge'
import { PioneerFx } from './PioneerFx'
import { BuildCinemaUi } from './BuildCinemaUi'
import { go } from './go'
import './pioneer.css'

// 開拓の画面：飛んでいるあいだのカード（PioneerHud）・木星の高さのメーター・遊び方の案内と、
// 開いたときの端末（倉庫・次の段階・行き先・建設）

const fmt = (a: Amounts) =>
  RESOURCES.filter((r) => a[r] > 0)
    .map((r) => `${ui().pioneer.resource[r]} ${a[r]}`)
    .join(' · ')

export function PioneerPanel() {
  useLang()
  const p = usePioneer()
  const world = useStore((s) => s.settings.world)
  const mode = useStore((s) => s.mode)
  const [name, setName] = useState('')
  if (!p.active || world !== 'sf') return null
  const t = ui().pioneer
  const next = STAGES[p.stage] ?? null
  const ready = !!next && canPay(p.store, next.cost)
  const short = next ? shortfall(p.store, next.cost) : null
  // 着陸・EVA・公園などの場面では、ゲージだけ隠す（開拓は続いている）
  const flying = mode === 'flight' || mode === 'map'

  return (
    <>
      {flying && !p.guide && !p.cinema && <PioneerHud />}
      {flying && !p.cinema && <GasGauge />}
      <BuildCinemaUi />
      <PioneerFx />
      {p.guide && !p.naming && <PioneerGuide />}
      {p.panel && !p.naming && !p.guide && (
        <div className="pioneer-panel" role="dialog" aria-label={t.terminal}>
          <header>
            <h2>{t.terminal}</h2>
            <span className="pio-stage">{p.stage >= STAGE_COUNT ? `${t.doneBadge} · ${p.colonyName}` : t.stages(p.stage, STAGE_COUNT)}</span>
            <button type="button" className="close" onClick={() => togglePanel(false)} aria-label={t.close}>
              ×
            </button>
          </header>
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
      {p.naming && !p.cinema && (
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
          <input value={name} maxLength={NAME_MAX} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} autoFocus />
          <button type="submit" className="pio-build">
            {t.nameOk}
          </button>
        </form>
      )}
    </>
  )
}
