import { COMPARE } from '../data/shipParts'
import { enterBridge } from '../state/bridge'
import { useShip } from '../data/ships'
import { ShipPicker } from './ShipPicker'
import { closeGallery, selectPart, toggleAuto, toggleCompare, useGallery } from '../state/gallery'
import { useStore } from '../state/store'
import { isTouchDevice } from '../state/input'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

/** 鑑賞モードの画面：見方の切り替え、各部の一覧と説明、大きさくらべ */

export function GalleryPanel() {
  const mode = useStore((s) => s.mode)
  const { part, auto, compare, labels } = useGallery()
  const ship = useShip()
  useLang()
  if (mode !== 'gallery') return null
  const selected = ship.parts.find((p) => p.id === part)
  const len = ship.lengthM

  return (
    <aside className="nav-panel gallery-panel">
      <h2>{ui().galleryPanel.viewingMode}</h2>
      <div className="muted">
        {ui().galleryPanel.shipSummary(ship.registry, ui().ships[ship.id].name, ui().ships[ship.id].kind, len)}
      </div>
      <ShipPicker compact />
      <div className="gallery-modes">
        <button className={`secondary${auto ? ' on' : ''}`} onClick={toggleAuto}>
          {ui().galleryPanel.autoTour}
        </button>
        <button className={`secondary${compare ? ' on' : ''}`} onClick={toggleCompare}>
          {ui().galleryPanel.compareSizes}
        </button>
        <button className={`secondary${labels ? ' on' : ''}`} onClick={() => useGallery.setState({ labels: !labels })}>
          {ui().galleryPanel.labels}
        </button>
      </div>

      <div className="gallery-info">
        {compare ? (
          <>
            <div className="nav-target-name">{ui().galleryPanel.comparedAtRealSize}</div>
            <ul className="gallery-compare">
              <li>
                {ui().galleryPanel.shipLength(ship.registry, len)}
                <span className="muted">{ui().galleryPanel.fromStory}</span>
              </li>
              {COMPARE.map((c) => (
                <li key={c.id}>
                  {ui().galleryPanel.compareLength(ui().compareItems[c.id].name, c.meters)}
                  <span className="muted">{ui().galleryPanel.compareNote(ui().compareItems[c.id].note)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : selected ? (
          <>
            <div className="nav-target-name">{ui().ships[ship.id].parts[selected.id].name}</div>
            <p>{ui().ships[ship.id].parts[selected.id].text}</p>
            {selected.id === 'bridge' && (
              <button className="bridge-enter" onClick={enterBridge}>
                {ui().galleryPanel.enterBridge}
              </button>
            )}
          </>
        ) : auto ? (
          <p className="muted">{ui().galleryPanel.autoTourNote}</p>
        ) : (
          <p className="muted">
            {isTouchDevice()
              ? ui().galleryPanel.touchHint
              : ui().galleryPanel.mouseHint}
          </p>
        )}
      </div>

      <div className="nav-heading">{ui().galleryPanel.shipParts}</div>
      <div className="nav-list gallery-parts">
        {ship.parts.map((p) => (
          <button key={p.id} className={`nav-item${part === p.id ? ' active' : ''}`} onClick={() => selectPart(part === p.id ? null : p.id)}>
            {ui().ships[ship.id].parts[p.id].name}
          </button>
        ))}
      </div>
      <div className="muted small">{ui().galleryPanel.fictionNote}</div>

      <button className="engage" onClick={closeGallery}>
        {ui().galleryPanel.backToCockpit} <kbd>V</kbd>
      </button>
    </aside>
  )
}
