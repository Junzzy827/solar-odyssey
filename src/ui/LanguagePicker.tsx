import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { setLang, type Lang } from '../i18n/lang'

/** ブラウザの言語が日本語でなければ、English を先に選んでおく */
const suggested: Lang = /^ja\b/i.test(navigator.language) ? 'ja' : 'en'

/** 初めて開いたときに、言語を選んでもらう（あとからは航法コンピュータのボタンで切り替える） */
export function LanguagePicker() {
  const lang = useStore((s) => s.settings.lang)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [lang])
  if (lang !== null) return null

  const choice = (value: Lang, label: string) => (
    <button ref={value === suggested ? first : undefined} className="engage" lang={value} onClick={() => setLang(value)}>
      {label}
    </button>
  )
  return (
    <div className="lang-picker" role="dialog" aria-modal="true" aria-label="言語を選ぶ / Choose a language">
      <div className="lang-card">
        <h1>SOLAR ODYSSEY</h1>
        <p>
          <span lang="ja">ことばを選んでください</span>
          <br />
          <span lang="en">Choose your language</span>
        </p>
        <div className="lang-buttons">
          {choice('ja', '日本語')}
          {choice('en', 'English')}
        </div>
        <p className="muted small">
          <span lang="ja">あとから航法コンピュータのボタンで切り替えられます。</span>
          <br />
          <span lang="en">You can switch later with the button on the navigation computer.</span>
        </p>
      </div>
    </div>
  )
}
