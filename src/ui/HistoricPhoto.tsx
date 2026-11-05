import { useState } from 'react'
import type { Historic } from '../data/apollo17'
import { ui } from '../i18n'

// 史跡の当時の写真（あれば）：画像と説明と出典。読めなかったら画像だけ出さず、出典のページへのリンクは残す

export function HistoricPhoto({ it }: { it: Historic }) {
  const [broken, setBroken] = useState(false)
  if (!it.photo) return null
  const text = ui().apollo17[it.id]
  return (
    <figure className="historic-photo">
      {!broken && (
        <a href={it.photo.page} target="_blank" rel="noreferrer">
          <img src={it.photo.src} alt={text.photoCaption ?? text.name} loading="lazy" onError={() => setBroken(true)} />
        </a>
      )}
      <figcaption>
        {text.photoCaption && <span>{text.photoCaption}</span>}
        <small>
          {text.photoCredit}{' '}
          <a href={it.photo.page} target="_blank" rel="noreferrer">
            {ui().historicPanel.photoSource}
          </a>
        </small>
      </figcaption>
    </figure>
  )
}
