import { useStore } from '../state/store'
import { bodies } from '../state/registry'
import { canDock, dockAtPort, stopObserve, useObserve } from '../state/observe'
import { isTouchDevice } from '../state/input'
import { t, useLang } from '../i18n/lang'

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
      ? t('止まって観察', 'Holding still')
      : t(`${lap > 0 ? '右' : '左'}回り・1周 ${Math.round(Math.abs(lap))}秒`, `${lap > 0 ? 'Right' : 'Left'} · ${Math.round(Math.abs(lap))} s per lap`)
  return (
    <div className="observe-panel">
      <div className="observe-head">
        <span className="observe-tag">{t('周辺観察', 'Observing')}</span>
        <b>{name}</b>
        <span className="muted">{docking ? t('港の入口へ移動中…', 'Heading to the port…') : lapText}</span>
      </div>
      {!docking && (
        <div className="observe-hint muted">
          {touch
            ? t('スティック上下で距離・左右で回る速さ／なぞって位置と角度／上昇・下降で面を傾ける', 'Stick up/down: distance · left/right: orbit speed · drag: position and angle · up/down buttons: tilt')
            : t('W/S 距離・A/D 回る速さと向き・Space/Shift 面を傾ける・マウスで位置と角度', 'W/S distance · A/D orbit speed/direction · Space/Shift tilt · mouse: position and angle')}
        </div>
      )}
      <div className="observe-buttons">
        {canDock(id) && (
          <button className={docking ? 'on' : ''} onClick={dockAtPort}>
            {docking ? t('入港をやめる', 'Cancel') : t('入港（港の入口へ）', 'Dock (go to the port)')}
          </button>
        )}
        <button onClick={stopObserve}>
          {t('観察をやめる', 'Stop observing')} {!touch && <kbd>O</kbd>}
        </button>
      </div>
    </div>
  )
}
