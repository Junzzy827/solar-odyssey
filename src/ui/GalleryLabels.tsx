import { SHIP_PARTS } from '../data/shipParts'
import { COMPARE_LABELS } from '../components/ship/CompareModels'
import { galleryAnchors, selectPart, useGallery } from '../state/gallery'
import { useStore } from '../state/store'
import { named, useLang } from '../i18n/lang'

/** 名札の要素を登録する（位置は GalleryCamera が毎フレーム決める） */
const anchor = (key: string, pos: [number, number, number], side: [number, number, number] | null) => (el: HTMLDivElement | null) => {
  if (el) galleryAnchors.set(key, { el, pos, side })
  else galleryAnchors.delete(key)
}

/** 鑑賞モードの名札：各部の名前（クリックで説明）と、大きさくらべの物の名前 */
export function GalleryLabels() {
  const mode = useStore((s) => s.mode)
  const { part, auto, compare, labels } = useGallery()
  useLang()
  if (mode !== 'gallery') return null
  return (
    <div className="gallery-labels">
      {labels &&
        !auto &&
        !compare &&
        SHIP_PARTS.map((p) => (
          <div key={p.id} ref={anchor(`part:${p.id}`, p.pos, p.id === part ? null : p.side)} className="gallery-anchor">
            <button className={part === p.id ? 'on' : ''} onClick={() => selectPart(part === p.id ? null : p.id)}>
              {named(p)}
            </button>
          </div>
        ))}
      {compare &&
        COMPARE_LABELS.map((c) => (
          <div key={c.id} ref={anchor(`compare:${c.id}`, c.pos, null)} className="gallery-anchor compare">
            <span>{c.text}</span>
          </div>
        ))}
    </div>
  )
}
