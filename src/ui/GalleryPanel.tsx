import { COMPARE, SHIP_LENGTH_M, SHIP_PARTS } from '../data/shipParts'
import { closeGallery, selectPart, toggleAuto, toggleCompare, useGallery } from '../state/gallery'
import { useStore } from '../state/store'

/** 鑑賞モードの画面：見方の切り替え、各部の一覧と説明、大きさくらべ */
export function GalleryPanel() {
  const mode = useStore((s) => s.mode)
  const { part, auto, compare, labels } = useGallery()
  if (mode !== 'gallery') return null
  const selected = SHIP_PARTS.find((p) => p.id === part)

  return (
    <aside className="nav-panel gallery-panel">
      <h2>鑑賞モード</h2>
      <div className="muted">SV-01 ソーラーボイジャー（全長 約{SHIP_LENGTH_M}m）</div>
      <div className="gallery-modes">
        <button className={`secondary${auto ? ' on' : ''}`} onClick={toggleAuto}>
          おまかせ
        </button>
        <button className={`secondary${compare ? ' on' : ''}`} onClick={toggleCompare}>
          大きさくらべ
        </button>
        <button className={`secondary${labels ? ' on' : ''}`} onClick={() => useGallery.setState({ labels: !labels })}>
          名札
        </button>
      </div>

      <div className="gallery-info">
        {compare ? (
          <>
            <div className="nav-target-name">本物の大きさでくらべる</div>
            <ul className="gallery-compare">
              <li>
                SV-01：{SHIP_LENGTH_M}m<span className="muted">（この船の設定）</span>
              </li>
              {COMPARE.map((c) => (
                <li key={c.id}>
                  {c.name}：{c.meters}m<span className="muted">（{c.note}）</span>
                </li>
              ))}
            </ul>
          </>
        ) : selected ? (
          <>
            <div className="nav-target-name">{selected.name}</div>
            <p>{selected.text}</p>
          </>
        ) : auto ? (
          <p className="muted">いくつかの角度から、ゆっくり順に見せます。ドラッグすると自分で動かせます。</p>
        ) : (
          <p className="muted">ドラッグで回転、ホイールで寄ったり引いたり。名札や下の一覧をクリックすると、その部分の説明が出ます。</p>
        )}
      </div>

      <div className="nav-heading">各部の名前</div>
      <div className="nav-list gallery-parts">
        {SHIP_PARTS.map((p) => (
          <button key={p.id} className={`nav-item${part === p.id ? ' active' : ''}`} onClick={() => selectPart(part === p.id ? null : p.id)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="muted small">この船の形や設定は、このアプリのオリジナルの空想です。</div>

      <button className="engage" onClick={closeGallery}>
        操縦席へもどる <kbd>V</kbd>
      </button>
    </aside>
  )
}
