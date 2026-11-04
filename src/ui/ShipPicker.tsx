import { SHIPS, shipSpec, useShip, type ShipId } from '../data/ships'
import { useStore } from '../state/store'
import { raceActive } from '../state/race'
import { setGoal } from '../state/gallery'
import { t, useLang } from '../i18n/lang'
import { ui } from '../i18n'

const thumb = (id: ShipId) => `${import.meta.env.BASE_URL}ships/${id}.jpg`

export function chooseShip(id: ShipId) {
  const s = useStore.getState()
  if (s.settings.ship === id || s.warpPhase !== 'idle' || raceActive()) return
  s.updateSettings({ ship: id })
  // 鑑賞モードなら、新しい船の全体が見える位置へ
  if (s.mode === 'gallery') setGoal(shipSpec(id).defaultView)
  s.showToast(ui().shipPicker.switchedTo(shipSpec(id).registry, shipSpec(id).name, shipSpec(id).nameEn))
}

/** 乗る船をえらぶ。compact は鑑賞モードの画面に入れる小さな形（写真と名前だけ） */
export function ShipPicker({ compact = false }: { compact?: boolean }) {
  const current = useShip()
  const busy = useStore((s) => s.warpPhase !== 'idle')
  useLang()
  return (
    <div className={`ship-picker${compact ? ' compact' : ''}`} role="radiogroup" aria-label={ui().shipPicker.yourShip}>
      {SHIPS.map((s) => (
        <button
          key={s.id}
          role="radio"
          aria-checked={current.id === s.id}
          className={`ship-card${current.id === s.id ? ' on' : ''}`}
          onClick={() => chooseShip(s.id)}
          disabled={busy || raceActive()}
          title={t(s.blurb, s.blurbEn)}
        >
          <img src={thumb(s.id)} alt="" loading="lazy" />
          <span className="ship-card-name">
            <b>{s.registry}</b>
            {compact ? <br /> : ' '}
            {t(s.name, s.nameEn)}
          </span>
          {!compact && (
            <>
              <span className="ship-card-kind">
                {ui().shipPicker.kindAndLength(s.kind, s.lengthM, s.kindEn)}
              </span>
              <span className="ship-card-blurb">{t(s.blurb, s.blurbEn)}</span>
            </>
          )}
        </button>
      ))}
    </div>
  )
}

/** 航法コンピュータの「乗る船」の欄 */
export function ShipSection() {
  useLang()
  const current = useShip()
  return (
    <details className="nav-settings nav-ships">
      <summary>
        {ui().shipPicker.yourShip} <span className="muted">{ui().shipPicker.shipName(current.registry, current.name, current.nameEn)}</span>
      </summary>
      <ShipPicker />
      <div className="muted small">{ui().shipPicker.fictionNote}</div>
    </details>
  )
}
