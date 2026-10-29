import { useStore } from '../state/store'
import { useBridge } from '../state/bridge'
import { VIEWPOINTS } from '../data/bridge'
import { isTouchDevice } from '../state/input'
import { t, useLang } from '../i18n/lang'

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
        {touch && atSeat && (
          <button className={`bridge-look ${looking ? 'active' : ''}`} onClick={() => setLooking(!looking)}>
            {looking ? t('操縦にもどる', 'Back to flying') : t('見回す', 'Look around')}
          </button>
        )}
      </div>
    </div>
  )
}
