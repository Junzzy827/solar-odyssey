// 航法コンピュータの「遊ぶ」タブの絵のカード（ui/nav/PlayCards.tsx と ui/nav/entries/*.ts）

export const playCardsJa = {
  shelves: {
    feats: '歴史の偉業',
    story: '物語',
    free: '自由に遊ぶ',
  },
  shelfNotes: {
    feats: '本当にあった宇宙の旅を、自分でやってみる',
    story: '続きのあるお話。少しずつ進める',
    free: 'すぐ遊べる。いつでもやめられる',
  },
  recommend: '★ 次のおすすめ',
  playing: '遊んでいる最中',
  tried: '✓ やった',
  chapterOf: (n: number, total: number) => `第${n}章 / ${total}`,
  saveTried: '「遊ぶ」で遊んだカード',
  cards: {
    moonMission: { title: 'アポロ17号', desc: '月へ有人飛行。打ち上げから月面まで' },
    voyager2: { title: 'ボイジャー2号', desc: '木星・土星・天王星・海王星をめぐる旅' },
    hayabusa2: { title: 'はやぶさ2', desc: '小惑星リュウグウにタッチダウン' },
    missions: { title: 'ストーリーモード', desc: '船ごとの任務で星を集める' },
    campaign: { title: '博士の探査隊', desc: '博士と月や火星の岩を探す' },
    pioneer: { title: '開拓', desc: '資源を集めてコロニーを建てる' },
    landMars: { title: '火星に降りる', desc: 'ローバーで赤い大地を走る' },
    skyFlight: { title: '月の空を飛ぶ', desc: '着陸船で月面すれすれ' },
    eva: { title: '船外活動', desc: 'ツムギで母船の外へ出る' },
    evaRepair: { title: '船外の修理', desc: 'ツムギで船の傷を直す' },
    walk: { title: 'コロニーの公園', desc: '池のほとりを散歩する' },
    colonyAxis: { title: 'コロニーの軸', desc: 'エレベーターで真ん中へ' },
  },
}
