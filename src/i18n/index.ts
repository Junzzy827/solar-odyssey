import { ja } from './ja'
import { en } from './en'
import { missionsJa } from './missions.ja'
import { missionsEn } from './missions.en'
import { getLang, type Lang } from './lang'

// 画面の文言の辞書（日本語・英語）。ui() と missionText() は、呼ぶたびに今の言語を見る
// （読み込み時に文字列を決めてしまわないこと）。言語は設定（settings.lang）にあり、lang.ts の getLang() で読む

export type { Lang }

const DICTS = {
  ja: { ui: ja, missions: missionsJa },
  en: { ui: en, missions: missionsEn },
}

/** 今の言語 */
export const currentLang = (): Lang => getLang()

/** 画面の短い文言 */
export const ui = () => DICTS[currentLang()].ui

/** ミッションの文章（data/missions.ts と同じ id） */
export const missionText = (id: string) => DICTS[currentLang()].missions[id]
