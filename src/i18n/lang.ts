import { useStore } from '../state/store'

// 日本語と英語の切り替え。文は使う場所で t('日本語', 'English') のように両方書き、表示するときに選ぶ。
// 言語は設定（settings.lang）に保存する。選ぶ前は日本語

export type Lang = 'ja' | 'en'

export const getLang = (): Lang => useStore.getState().settings.lang ?? 'ja'

/** 言語が変わったら描き直す（コンポーネントの最初で呼ぶ） */
export const useLang = (): Lang => useStore((s) => s.settings.lang ?? 'ja')

/** 今の言語の文を選ぶ */
export const t = (ja: string, en: string) => (getLang() === 'en' ? en : ja)

/** 天体などの名前（name と nameEn を持つもの） */
export const named = (b: { name: string; nameEn: string }) => t(b.name, b.nameEn)

export function setLang(lang: Lang) {
  useStore.getState().updateSettings({ lang })
}

// リンクで言語を決めて開ける（?lang=en や #lang=en）。そのときは最初の言語の画面を出さない
const fromUrl = /[?&#]lang=(ja|en)\b/.exec(location.search + location.hash)?.[1] as Lang | undefined
if (fromUrl) setLang(fromUrl)

// ページの言語（読み上げ・翻訳の機能や検索エンジン向け）
const applyDocumentLang = (lang: Lang) => {
  document.documentElement.lang = lang
}
applyDocumentLang(getLang())
useStore.subscribe((s, prev) => {
  if (s.settings.lang !== prev.settings.lang) applyDocumentLang(s.settings.lang ?? 'ja')
})
