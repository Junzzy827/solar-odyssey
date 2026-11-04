import { ja } from './ja'
import { en } from './en'
import { chaptersJa, missionsJa } from './missions.ja'
import { chaptersEn, missionsEn } from './missions.en'
import { getLang, type Lang } from './lang'
import { fill, untranslated } from './translation'

// 画面の文言の辞書（日本語・英語）。ui() と missionText() は、呼ぶたびに今の言語を見る
// （読み込み時に文字列を決めてしまわないこと）。言語は設定（settings.lang）にあり、lang.ts の getLang() で読む。
// 英語の辞書に書いていない文言は日本語で出る（translation.ts）

export type { Lang }

const DICTS = {
  ja: { ui: ja, missions: missionsJa, chapters: chaptersJa },
  en: { ui: fill(ja, en), missions: fill(missionsJa, missionsEn), chapters: fill(chaptersJa, chaptersEn) },
}

// #debug のときは、英語の辞書にまだない文言（日本語で出るもの）をコンソールに出す
if (location.hash.includes('debug')) {
  const missing = [
    ...untranslated(ja, en),
    ...untranslated(missionsJa, missionsEn, 'missions'),
    ...untranslated(chaptersJa, chaptersEn, 'chapters'),
  ]
  if (missing.length) console.log(`[i18n] en: not translated (shown in Japanese): ${missing.length}`, missing)
}

/** 今の言語 */
export const currentLang = (): Lang => getLang()

/** 画面の短い文言 */
export const ui = () => DICTS[currentLang()].ui

/** ミッションの文章（data/missions.ts と同じ id） */
export const missionText = (id: string) => DICTS[currentLang()].missions[id]

/** 章の文章（data/missions.ts の CHAPTERS と同じ id） */
export const chapterText = (id: string) => DICTS[currentLang()].chapters[id]
