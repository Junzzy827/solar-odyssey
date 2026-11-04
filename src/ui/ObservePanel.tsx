import { useStore } from '../state/store'
import { bodies } from '../state/registry'
import { canDock, dockAtPort, isBerth, stopObserve, useObserve } from '../state/observe'
import { isTouchDevice } from '../state/input'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

/** 周辺観察中に、画面の下のまんなか（スマホでは上）に出す札：何を回っているか、回る速さ、操作、入港・解除のボタン */
export function ObservePanel() {
  useLang()
  const id = useObserve((o) => o.id)
  const docking = useObserve((o) => o.docking)
  const lap = useObserve((o) => o.lap)
  const mode = useStore((s) => s.mode)
  const scope = useStore((s) => s.scope)
  if (!id || mode !== 'flight' || scope) return null
  const name = bodies.get(id)?.name ?? ''
  const touch = isTouchDevice()
  const lapText =
    lap === 0
      ? ui().observePanel.holdingStill
      : ui().observePanel.lapTime(lap > 0, Math.round(Math.abs(lap)))
  return (
    <div className="observe-panel">
      <div className="observe-head">
        <span className="observe-tag">{ui().observePanel.observing}</span>
        <b>{name}</b>
        <span className="muted">{docking ? (isBerth(id) ? ui().observePanel.headingToBerth : ui().observePanel.headingToPort) : lapText}</span>
      </div>
      {!docking && (
        <div className="observe-hint muted">
          {touch
            ? ui().observePanel.touchHint
            : ui().observePanel.keysHint}
        </div>
      )}
      <div className="observe-buttons">
        {canDock(id) && (
          <button className={docking ? 'on' : ''} onClick={dockAtPort}>
            {docking ? (isBerth(id) ? ui().observePanel.cancelBerth : ui().observePanel.cancelDock) : isBerth(id) ? ui().observePanel.berth : ui().observePanel.dock}
          </button>
        )}
        <button onClick={stopObserve}>
          {ui().observePanel.stopObserving} {!touch && <kbd>O</kbd>}
        </button>
      </div>
    </div>
  )
}
