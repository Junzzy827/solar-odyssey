import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { t, useLang } from '../i18n/lang'

// 写真モードに切り替えたときの短い解説。閉じられて、「次回から表示しない」も選べる

const HIDE_KEY = 'solar-voyager:photo-note-hidden'

const hidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function PhotoNote() {
  useLang()
  const [open, setOpen] = useState(false)
  const [never, setNever] = useState(false)

  // 図鑑モードから写真モードへ切り替えた瞬間に出す（開いたときから写真モードのときは出さない）
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.settings.look === 'photo' && prev.settings.look !== 'photo' && !hidden()) setOpen(true)
        if (s.settings.look !== 'photo') setOpen(false)
      }),
    [],
  )
  if (!open) return null

  const close = () => {
    if (never) {
      try {
        localStorage.setItem(HIDE_KEY, '1')
      } catch {
        // 保存できなくても閉じる
      }
    }
    setOpen(false)
  }

  const notes = [
    t(
      '宇宙の写真に星がほとんど写らないのは、日の当たった惑星と星との明るさの差が大きすぎるから。カメラが惑星に明るさを合わせると、暗い星は写りません。この写真モードでも、明るい天体が画面に大きく映ると星が消えていきます。',
      'Space photos show almost no stars because a sunlit planet is far brighter than the stars. When the camera is set for the planet, the faint stars do not show up. In this mode, stars fade out when a bright world fills the screen.',
    ),
    t(
      '木星などのガス惑星の縁が暗いのは、球の縁では大気を斜めに見ることになり、上の層のもやにさえぎられて、深くの明るい雲が見えにくくなるから（周縁減光）。太陽の縁が暗いのも同じ理由です。',
      'The edge of a gas giant like Jupiter looks darker because at the edge we look through the air at a slant, so the upper haze hides the bright, deeper clouds (limb darkening). The Sun’s edge is darker for the same reason.',
    ),
    t(
      '月や水星のように大気のない天体は、光が散らされないので昼と夜の境目がくっきりし、満月は縁まで明るく見えます。境目の近くでは影が長くのび、クレーターが立体的に見えます。',
      'Worlds with no air, like the Moon and Mercury, have a sharp line between day and night, and a full Moon is bright right to its edge. Near that line, long shadows make craters stand out.',
    ),
    t(
      '探査機の公開写真の多くは、模様を見やすくするために色を強めた「強調画像」です。図鑑モードは、それに近い見せ方をしています。',
      'Many published spacecraft pictures are “enhanced-color” images, with colors boosted so the details are easier to see. Illustrated mode is close to that style.',
    ),
  ]

  return (
    <div className="photo-note" role="dialog" aria-label={t('写真モードについて', 'About Photographic mode')}>
      <h3>{t('写真モード：カメラで撮ったときの見え方', 'Photographic mode: what a camera would see')}</h3>
      <ul>
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <div className="photo-note-foot">
        <label>
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
          {t('次回から表示しない', 'Don’t show this again')}
        </label>
        <button onClick={close}>{t('閉じる', 'Close')}</button>
      </div>
    </div>
  )
}
