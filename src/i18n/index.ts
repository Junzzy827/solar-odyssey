import { ja } from './ja'
import { en } from './en'
import { missionsJa } from './missions.ja'
import { missionsEn } from './missions.en'

// 画面の文言の辞書（日本語・英語）。ui() と missionText() は、呼ぶたびに今の言語を見る
// （読み込み時に文字列を決めてしまわないこと）。言語の切り替えは currentLang() を設定から読むようにする

export type Lang = 'ja' | 'en'

const DICTS = {
  ja: { ui: ja, missions: missionsJa },
  en: { ui: en, missions: missionsEn },
}

/** 今の言語（いまは日本語だけ。設定の言語ができたら、ここで読む） */
export const currentLang = (): Lang => 'ja'

/** 画面の短い文言 */
export const ui = () => DICTS[currentLang()].ui

/** ミッションの文章（data/missions.ts と同じ id） */
export const missionText = (id: string) => DICTS[currentLang()].missions[id]
