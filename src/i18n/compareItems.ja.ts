import type { CompareItemText } from '../data/shipParts'

// data/shipParts.ts の文言（日本語）

export const compareItemsJa: Record<string, CompareItemText> = {
  skytree: { name: '東京スカイツリー', note: '高さ634m。寝かせて並べています' },
  iss: { name: '国際宇宙ステーション', note: '人が住んでいる、いちばん大きな宇宙の建物' },
  jet: { name: 'ジャンボジェット', note: 'ボーイング747' },
  hubble: { name: 'ハッブル宇宙望遠鏡', note: '大型バスくらい' },
}
