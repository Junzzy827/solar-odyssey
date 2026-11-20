import { useRef, type ReactNode } from 'react'
import { useToastBelow } from '../toastOffset'
import { ui } from '../../i18n'
import { useStore } from '../../state/store'
import { isTouchDevice } from '../../state/input'
import { showGuide, togglePanel, usePioneer } from '../../state/pioneer'
import { FIELD_ID, goal, holdCapacity, RESOURCES, RING_COUNT, STAGES, total, type Goal } from '../../data/pioneer'
import { COLONY_ID, DOCK_ID } from '../../data/sf'
import { IconBuild, IconDock, IconDone, IconGas, IconMine } from './icons'
import { go } from './go'

// 飛んでいるあいだいつも出る開拓のカード：
// 段階の点・積み荷のゲージ・「いまやること」（行き先のボタン付き）・次の段階までの目盛り
// と、砕ける岩に重ねる輪（位置は PioneerScene が毎フレーム動かす）

type Step = { icon: ReactNode; text: string; hint?: string; action?: { label: string; run: () => void } }

function step(g: Goal, near: string | null, colonyName: string): Step {
  const t = ui().pioneer
  switch (g.kind) {
    case 'mine': {
      const res = t.resource[g.resource]
      if (near === 'field') return { icon: <IconMine />, text: t.goal.mineHere(res, t.ringColor[g.resource]), hint: isTouchDevice() ? t.beamTouch : t.beamKeys }
      return { icon: <IconMine />, text: t.goal.mine(res), action: { label: t.goButton, run: () => go(FIELD_ID) } }
    }
    case 'gas':
      if (near === 'jupiter') return { icon: <IconGas />, text: t.goal.gasHere }
      return { icon: <IconGas />, text: t.goal.gas, action: { label: t.goButton, run: () => go('jupiter') } }
    case 'deliver':
      if (near === 'dock') return { icon: <IconDock />, text: t.goal.deliverHere }
      return { icon: <IconDock />, text: g.full ? t.goal.deliverFull : t.goal.deliver, action: { label: t.goButton, run: () => go(DOCK_ID) } }
    case 'build':
      return { icon: <IconBuild />, text: t.goal.build, action: { label: t.buildButton, run: () => togglePanel(true) } }
    case 'name':
      return { icon: <IconDone />, text: t.goal.name }
    case 'done':
      return { icon: <IconDone />, text: t.goal.done(colonyName), action: { label: t.seeButton, run: () => go(COLONY_ID) } }
  }
}

/** カードの下端を CSS 変数に（スマホで木星のメーターをその下に置く） */
const markCardBottom = (bottom: number | null) => {
  if (bottom === null) document.documentElement.style.removeProperty('--pio-card-bottom')
  else document.documentElement.style.setProperty('--pio-card-bottom', `${bottom}px`)
}

export function PioneerHud() {
  const p = usePioneer()
  const shipId = useStore((s) => s.settings.ship)
  const t = ui().pioneer
  const cap = holdCapacity(shipId)
  const g = goal(p, cap)
  const s = step(g, p.near, p.colonyName)
  const next = STAGES[p.stage] ?? null
  const used = total(p.hold)
  // カードの文が変わったときだけ、ふわっと出し直す
  const card = useRef<HTMLDivElement>(null)
  useToastBelow('pioneer', card, markCardBottom)
  const goalKey = `${g.kind}-${'resource' in g ? g.resource : ''}-${p.near ?? ''}`

  return (
    <>
      <div ref={card} className={`pioneer-hud${g.kind === 'build' ? ' pio-hud-ready' : ''}`} role="group" aria-label={t.title}>
        <div className="pio-top">
          <span className="pio-title">{t.title}</span>
          <span className="pio-pips" aria-label={t.stages(p.stage, STAGES.length)}>
            {STAGES.map((st, i) => (
              <i key={st.id} className={i < p.stage ? 'done' : i === p.stage ? 'now' : ''} />
            ))}
          </span>
          <span className={`pio-hold${used >= cap ? ' full' : ''}`} aria-label={`${t.hold} ${used}/${cap}`}>
            {RESOURCES.map((r) => (
              <span key={r} className={`pio-bar pio-${r}`} style={{ width: `${(p.hold[r] / cap) * 100}%` }} />
            ))}
          </span>
          <span className="pio-count">
            {used}/{cap}
          </span>
          <button type="button" className="pio-help" onClick={() => showGuide(true)} aria-label={t.help} title={t.help}>
            ?
          </button>
          <button type="button" className="pio-open" onClick={() => togglePanel()} aria-expanded={p.panel}>
            {t.open}
          </button>
        </div>
        <div className="pio-goal" key={goalKey}>
          <span className="pio-goal-icon">{s.icon}</span>
          <span className="pio-goal-text">
            <small>{t.goalLabel}</small>
            <b>{s.text}</b>
            {s.hint && <small className="pio-goal-hint">{s.hint}</small>}
          </span>
          {s.action && (
            <button type="button" className="pio-goal-go" onClick={s.action.run}>
              {s.action.label}
            </button>
          )}
        </div>
        {next && (
          <div className="pio-need">
            <span className="pio-need-label">{t.untilStage(t.stageName[next.id])}</span>
            {RESOURCES.filter((r) => next.cost[r] > 0).map((r) => {
              const cost = next.cost[r]
              const inStore = Math.min(p.store[r], cost)
              const inHold = Math.min(p.hold[r], cost - inStore)
              return (
                <span key={r} className={`pio-need-row${inStore >= cost ? ' ok' : ''}`}>
                  <span className="pio-need-name">{t.resource[r]}</span>
                  <span className="pio-meter">
                    <span className={`pio-meter-store pio-${r}`} style={{ width: `${(inStore / cost) * 100}%` }} />
                    <span className={`pio-meter-hold pio-${r}`} style={{ width: `${(inHold / cost) * 100}%` }} />
                  </span>
                  <span className="pio-need-num">
                    {inStore}
                    {inHold > 0 && <em>+{inHold}</em>}/{cost}
                  </span>
                </span>
              )
            })}
          </div>
        )}
      </div>
      <div id="pio-rings" aria-hidden>
        {Array.from({ length: RING_COUNT }, (_, i) => (
          <span key={i} className="pio-ring">
            <em className="l-metal">{t.resource.metal}</em>
            <em className="l-rich">{t.ringRich}</em>
            <em className="l-ice">{t.resource.ice}</em>
            <em className="l-far">{t.ringFar}</em>
          </span>
        ))}
      </div>
    </>
  )
}
