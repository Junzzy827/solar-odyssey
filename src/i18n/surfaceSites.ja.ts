// data/surfaces.ts の文言（日本語）

const texts = {
  coprates: {
    name: 'マリネリス峡谷',
    note: 'マリネリス峡谷のコプラテス谷の底。峡谷は長さ約4000 km、深さは最大約7 km。南にそびえる壁は、ここから8 km も上まで続いています。',
  },
  taurus: {
    name: 'タウルス・リットロウ谷',
    note: 'アポロ17号（1972年）が降りた谷。両側に高さ2 kmをこえる山（北マシフ・南マシフ）がそびえます。人が月を歩いた最後の場所で、宇宙飛行士は月面車でこの谷を走りました。光の柱をめざしてローバーで走ると、2人が残した物や観測点（アポロ17号の史跡）を訪ねられます。',
  },
} satisfies Record<string, { name: string; note: string }>

// 英語の surfaceSites.en.ts はこの型（id つき）で調べる：id のつづりちがいは型エラー
export type SurfaceSitesJa = typeof texts
export const surfaceSitesJa: Record<string, { name: string; note: string }> = texts
