import { getLang } from '../i18n/lang'
import { FACTS_EN } from '../i18n/facts.en'
import { FACTS } from '../i18n/facts.ja'

export type Quiz = {
  question: string
  choices: string[]
  answer: number
  explanation: string
}

export type Facts = {
  /** 天体以外（架空の船など）は表の項目を自由に決める */
  rows?: [string, string][]
  diameter?: string
  temperature?: string
  gravity?: string
  day?: string
  year?: string
  moons?: string
  notes: string[]
  /** 架空のもの（SF モード）。見出しに「フィクション」の札を出す */
  fiction?: boolean
  /** 架空のものの「現実の科学では」：もとになった本物の研究や構想 */
  real?: string[]
  quiz: Quiz
}

/** 今の言語の解説とクイズ（日本語は i18n/facts.ja.ts、英語は i18n/facts.en.ts） */
export const factsFor = (id: string): Facts | undefined => (getLang() === 'en' ? FACTS_EN[id] : undefined) ?? FACTS[id]
