import { useStore } from '../state/store'
import { useBridge } from '../state/bridge'
import { VIEWPOINTS } from '../data/bridge'
import { BRIDGE_PARTS } from '../data/bridgeParts'
import { isTouchDevice } from '../state/input'
import { named, t, useLang } from '../i18n/lang'

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
            ? t('「見回す」を押すと、なぞって首を振れます', 'Tap “Look around” and drag to turn your head')
            : t('右ボタンを押しながらマウスで見回す', 'Hold the right button and move the mouse to look around')
          : t('船は止まります。なぞって見回せます（艦長席にもどると操縦できます）', 'The ship coasts to a stop. Drag to look around (go back to the captain’s chair to fly)')}
      </div>
      <div className="bridge-actions">
        <button className={`bridge-look ${viewscreen ? 'active' : ''}`} onClick={() => setViewscreen(!viewscreen)}>
          {viewscreen ? t('窓にもどす', 'Back to the window') : targetId ? t('目標を拡大画面に', 'Zoom on target') : t('前を拡大画面に', 'Zoom ahead')}
          {!touch && <kbd>Z</kbd>}
        </button>
        {atSeat && (
          <button className={`bridge-look ${labels ? 'active' : ''}`} onClick={() => setLabels(!labels)}>
            {labels ? t('説明をしまう', 'Hide labels') : t('見どころの説明', 'Show labels')}
          </button>
        )}
        {touch && atSeat && (
          <button className={`bridge-look ${looking ? 'active' : ''}`} onClick={() => setLooking(!looking)}>
            {looking ? t('操縦にもどる', 'Back to flying') : t('見回す', 'Look around')}
          </button>
        )}
      </div>
      {part && (
        <div className="bridge-info">
          <b>{named(part)}</b>
          <p>{t(part.text, part.textEn)}</p>
          <button onClick={() => useBridge.getState().selectPart(null)} aria-label={t('閉じる', 'Close')}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
