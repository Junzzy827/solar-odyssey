import { useStore } from '../state/store'
import { leaveBridge, useBridge } from '../state/bridge'
import { VIEWPOINTS } from '../data/bridge'
import { BRIDGE_PARTS } from '../data/bridgeParts'
import { isTouchDevice } from '../state/input'
import { named, t, useLang } from '../i18n/lang'
import { ui } from '../i18n'

/** ブリッジ視点の見どころ（ワンタップで移る）と、艦長席での見回しの切り替え */
export function BridgePanel() {
  useLang()
  const mode = useStore((s) => s.mode)
  const cameraMode = useStore((s) => s.cameraMode)
  const scope = useStore((s) => s.scope)
  const current = useBridge((b) => b.viewpoint)
  const looking = useBridge((b) => b.looking)
  const setViewpoint = useBridge((b) => b.setViewpoint)
  const setLooking = useBridge((b) => b.setLooking)
  const viewscreen = useBridge((b) => b.viewscreen)
  const setViewscreen = useBridge((b) => b.setViewscreen)
  const targetId = useStore((s) => s.targetId)
  const labels = useBridge((b) => b.labels)
  const setLabels = useBridge((b) => b.setLabels)
  const partId = useBridge((b) => b.part)
  const part = BRIDGE_PARTS.find((p) => p.id === partId)
  if (mode !== 'flight' || cameraMode !== 'bridge' || scope) return null
  const touch = isTouchDevice()
  const atSeat = current === 'captain'

  return (
    <div className="bridge-panel">
      {/* パソコンは画面下の「外にもどる」ボタン（Esc）。スマホはここにも大きく出す */}
      {touch && (
        <button className="bridge-exit" onClick={leaveBridge}>
          {ui().bridgePanel.leaveBridge}
        </button>
      )}
      <div className="bridge-views">
        {VIEWPOINTS.map((vp) => (
          <button key={vp.id} className={vp.id === current ? 'active' : ''} onClick={() => setViewpoint(vp.id)}>
            {vp.name()}
          </button>
        ))}
      </div>
      <div className="bridge-hint">
        {atSeat
          ? touch
            ? ui().bridgePanel.lookTouchHint
            : ui().bridgePanel.lookMouseHint
          : ui().bridgePanel.coastingHint}
      </div>
      <div className="bridge-actions">
        <button className={`bridge-look ${viewscreen ? 'active' : ''}`} onClick={() => setViewscreen(!viewscreen)}>
          {viewscreen ? ui().bridgePanel.backToWindow : targetId ? ui().bridgePanel.zoomOnTarget : ui().bridgePanel.zoomAhead}
          {!touch && <kbd>Z</kbd>}
        </button>
        {atSeat && (
          <button className={`bridge-look ${labels ? 'active' : ''}`} onClick={() => setLabels(!labels)}>
            {labels ? ui().bridgePanel.hideLabels : ui().bridgePanel.showLabels}
          </button>
        )}
        {touch && atSeat && (
          <button className={`bridge-look ${looking ? 'active' : ''}`} onClick={() => setLooking(!looking)}>
            {looking ? ui().bridgePanel.backToFlying : ui().bridgePanel.lookAround}
          </button>
        )}
      </div>
      {part && (
        <div className="bridge-info">
          <b>{named(part)}</b>
          <p>{t(part.text, part.textEn)}</p>
          <button onClick={() => useBridge.getState().selectPart(null)} aria-label={ui().bridgePanel.close}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
