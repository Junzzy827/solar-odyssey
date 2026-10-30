import { useEffect } from 'react'
import { useSF } from '../data/sf'
import { t, useLang } from '../i18n/lang'

/**
 * SF モードの目印。画面の右上にいつも「SF」の札を出し、画面全体の差し色を紫にする
 * （スクリーンショットを見ても、本物の太陽系のモードと取りちがえないように）
 */
export function SFBadge() {
  const sf = useSF()
  useLang()
  useEffect(() => {
    document.body.classList.toggle('sf', sf)
  }, [sf])
  if (!sf) return null
  return (
    <div className="sf-badge" title={t('架空の船や構造物も出しています', 'Imaginary ships and structures are shown')}>
      SF <span>{t('フィクション', 'FICTION')}</span>
    </div>
  )
}
