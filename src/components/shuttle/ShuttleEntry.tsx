import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'
import { SHUTTLE_SAMPLE, openShuttle, useShuttle } from '../../state/shuttle'

// 試しの URL（?shuttle=sample）のときだけ出す、乗員室へ入るボタン（出たあとにもう一度入れるように）
export function ShuttleEntry() {
  useLang()
  const none = useShuttle((s) => s.phase === 'none')
  if (!SHUTTLE_SAMPLE || !none) return null
  return (
    <button
      className="shuttle-entry"
      style={{ position: 'fixed', left: 12, bottom: 150, zIndex: 40, padding: '8px 14px', borderRadius: 16, border: '1px solid rgba(160,200,240,0.6)', background: 'rgba(12,20,34,0.85)', color: '#e3eefa', cursor: 'pointer' }}
      title={ui().shuttle.enterTip} onClick={() => openShuttle()}>
      {ui().shuttle.enter}
    </button>
  )
}
