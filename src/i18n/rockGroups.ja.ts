// data/rockCollection.ts の文言（日本語）：自分の名前があるページ（ほかのページは先頭の天体の名前）

const texts = {
  europa: '氷の衛星・冥王星',
  phobos: 'そのほかの岩の天体',
} satisfies Record<string, string>

// 英語の rockGroups.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type RockGroupsJa = typeof texts
export const rockGroupsJa: Record<string, string> = texts
