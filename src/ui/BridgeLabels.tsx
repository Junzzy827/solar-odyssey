import { BRIDGE_PARTS } from '../data/bridgeParts'
import { bridgeAnchors, useBridge } from '../state/bridge'
import { useStore } from '../state/store'
import { named, useLang } from '../i18n/lang'

const anchor = (id: string, pos: [number, number, number]) => (el: HTMLDivElement | null) => {
  if (el) bridgeAnchors.set(id, { el, pos })
  else bridgeAnchors.delete(id)
}

/** 艦橋の見どころの名札（押すと説明）。位置は BridgeInterior が毎フレーム決める */
export function BridgeLabels() {
  useLang()
  const show = useStore((s) => s.mode === 'flight' && s.cameraMode === 'bridge' && !s.scope)
  const { labels, viewpoint, part, selectPart } = useBridge()
  if (!show || !(labels || viewpoint !== 'captain')) return null
  return (
    <div className="gallery-labels bridge-labels">
      {BRIDGE_PARTS.map((p) => (
        <div key={p.id} ref={anchor(p.id, p.pos)} className="gallery-anchor">
          <button className={part === p.id ? 'on' : ''} onClick={() => selectPart(part === p.id ? null : p.id)}>
            {named(p)}
          </button>
        </div>
      ))}
    </div>
  )
}
