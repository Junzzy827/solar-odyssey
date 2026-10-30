import { COMPARE, SHIP_LENGTH_M, SHIP_PARTS } from '../data/shipParts'
import { useBridge } from '../state/bridge'
import { closeGallery, selectPart, toggleAuto, toggleCompare, useGallery } from '../state/gallery'
import { useStore } from '../state/store'
import { isTouchDevice } from '../state/input'
import { named, t, useLang } from '../i18n/lang'

/** 鑑賞モードの画面：見方の切り替え、各部の一覧と説明、大きさくらべ */
/** 鑑賞モードから、艦橋の中（ブリッジ視点の艦長席）へ */
function enterBridge() {
  useBridge.getState().setViewpoint('captain')
  useStore.getState().setCameraMode('bridge')
  closeGallery()
}

export function GalleryPanel() {
  const mode = useStore((s) => s.mode)
  const { part, auto, compare, labels } = useGallery()
  useLang()
  if (mode !== 'gallery') return null
  const selected = SHIP_PARTS.find((p) => p.id === part)

  return (
    <aside className="nav-panel gallery-panel">
      <h2>{t('鑑賞モード', 'Viewing mode')}</h2>
      <div className="muted">{t(`SV-01 ソーラーボイジャー（全長 約${SHIP_LENGTH_M}m）`, `SV-01 Solar Voyager (about ${SHIP_LENGTH_M} m long)`)}</div>
      <div className="gallery-modes">
        <button className={`secondary${auto ? ' on' : ''}`} onClick={toggleAuto}>
          {t('おまかせ', 'Auto tour')}
        </button>
        <button className={`secondary${compare ? ' on' : ''}`} onClick={toggleCompare}>
          {t('大きさくらべ', 'Compare sizes')}
        </button>
        <button className={`secondary${labels ? ' on' : ''}`} onClick={() => useGallery.setState({ labels: !labels })}>
          {t('名札', 'Labels')}
        </button>
      </div>

      <div className="gallery-info">
        {compare ? (
          <>
            <div className="nav-target-name">{t('本物の大きさでくらべる', 'Compared at real size')}</div>
            <ul className="gallery-compare">
              <li>
                {t(`SV-01：${SHIP_LENGTH_M}m`, `SV-01: ${SHIP_LENGTH_M} m`)}
                <span className="muted">{t('（この船の設定）', ' (from this ship’s story)')}</span>
              </li>
              {COMPARE.map((c) => (
                <li key={c.id}>
                  {t(`${c.name}：${c.meters}m`, `${c.nameEn}: ${c.meters} m`)}
                  <span className="muted">{t(`（${c.note}）`, ` (${c.noteEn})`)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : selected ? (
          <>
            <div className="nav-target-name">{named(selected)}</div>
            <p>{t(selected.text, selected.textEn)}</p>
            {selected.id === 'bridge' && (
              <button className="nav-auto" onClick={enterBridge}>
                {t('艦橋の中に入る', 'Go inside the bridge')}
              </button>
            )}
          </>
        ) : auto ? (
          <p className="muted">{t('いくつかの角度から、ゆっくり順に見せます。ドラッグすると自分で動かせます。', 'Shows the ship slowly from several angles. Drag to take over.')}</p>
        ) : (
          <p className="muted">
            {isTouchDevice()
              ? t('指でなぞって回転、2本指で寄ったり引いたり。名札や下の一覧をタップすると、その部分の説明が出ます。', 'Drag to rotate and pinch to zoom. Tap a label or the list below to read about that part.')
              : t('ドラッグで回転、ホイールで寄ったり引いたり。名札や下の一覧をクリックすると、その部分の説明が出ます。', 'Drag to rotate and scroll to zoom. Click a label or the list below to read about that part.')}
          </p>
        )}
      </div>

      <div className="nav-heading">{t('各部の名前', 'Parts of the ship')}</div>
      <div className="nav-list gallery-parts">
        {SHIP_PARTS.map((p) => (
          <button key={p.id} className={`nav-item${part === p.id ? ' active' : ''}`} onClick={() => selectPart(part === p.id ? null : p.id)}>
            {named(p)}
          </button>
        ))}
      </div>
      <div className="muted small">{t('この船の形や設定は、このアプリのオリジナルの空想です。', 'This ship’s design and story are original to this app and imaginary.')}</div>

      <button className="engage" onClick={closeGallery}>
        {t('操縦席へもどる', 'Back to the cockpit')} <kbd>V</kbd>
      </button>
    </aside>
  )
}
