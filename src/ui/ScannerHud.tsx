import { useEffect, useState } from 'react'
import { SCAN_RANGE, beginScan, closeFresh, nameDiscovery, openNote, stopScanner, useDiscovery } from '../state/discovery'
import { NAME_MAX } from '../data/discovery'
import { useStore } from '../state/store'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import './discovery.css'

/** 見つけたばかりの岩：種類と大きさ、仮符号、名前を付ける */
function FreshCard() {
  const fresh = useDiscovery((s) => s.fresh)
  const again = useDiscovery((s) => s.freshKnown)
  const [name, setName] = useState('')
  useEffect(() => setName(fresh?.name ?? ''), [fresh])
  if (!fresh) return null
  const t = ui().discovery
  return (
    <section className="scan-fresh" role="dialog" aria-label={again ? t.known : t.newFind}>
      <h2>{again ? t.known : t.newFind}</h2>
      <p className="scan-code">
        <span className="muted small">{t.code}</span> <b>{fresh.code}</b>
      </p>
      <p>
        <b>{t.kind[fresh.kind]}</b>
        {ui().gap}
        {t.size(fresh.sizeKm)}
      </p>
      <p className="small">{t.kindNote[fresh.kind]}</p>
      <label className="scan-name">
        <span>{t.namePrompt}</span>
        <input
          value={name}
          maxLength={NAME_MAX}
          placeholder={t.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') nameDiscovery(fresh.key, name)
          }}
        />
      </label>
      <div className="scan-actions">
        <button className="scan-primary" onClick={() => nameDiscovery(fresh.key, name)}>{t.save}</button>
        <button className="secondary" onClick={closeFresh}>
          {t.later}
        </button>
      </div>
      <p className="muted small">{t.codeNote}</p>
      <p className="muted small">{t.realNaming}</p>
    </section>
  )
}

/** スキャナーを入れているあいだの表示：近くの岩の印、スキャンのボタン（H）、発見ノート、切る */
export function ScannerHud() {
  const on = useDiscovery((s) => s.on)
  const candidate = useDiscovery((s) => s.candidate)
  const progress = useDiscovery((s) => s.progress)
  const away = useDiscovery((s) => s.beltAway)
  const count = useDiscovery((s) => s.found.length)
  const flight = useStore((s) => s.mode === 'flight')
  useLang()

  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyH' || e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return
      beginScan()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])

  if (!on || !flight) return <FreshCard />
  const t = ui().discovery
  const status = candidate ? t.rockInRange : away > SCAN_RANGE ? t.goBelt : t.noRock
  return (
    <>
      <div id="scan-marker" className="scan-marker" aria-hidden="true">
        <span>◇</span>
      </div>
      <section className="scanner-hud" aria-label={t.scanner}>
        <p className="scanner-status">{progress !== null ? t.scanning : status}</p>
        {progress !== null && (
          <div className="scan-bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        <div className="scan-actions">
          <button className="scan-primary scan-go" onClick={beginScan} disabled={!candidate || progress !== null}>
            📡 {t.scan} <kbd>H</kbd>
          </button>
          <button className="secondary" onClick={openNote}>
            {t.note} {count > 0 && <span className="muted">{t.noteCount(count)}</span>}
          </button>
          <button className="secondary scan-stop" onClick={stopScanner} aria-label={t.stop} title={t.stop}>
            ×
          </button>
        </div>
      </section>
      <FreshCard />
    </>
  )
}
