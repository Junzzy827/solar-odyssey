// 探査機の旅。日付と、通った天体は本物。あいだの道すじは、天体どうしを太陽のまわりの弧でつないだ、おおよその形。
// 最後の天体のあとは、その日から本物の向きと速さでまっすぐ進む（太陽の重力をふり切ったあとは、ほぼまっすぐ飛ぶ）。

export type ProbeStop = {
  date: string
  /** そこにいた天体（惑星の id か 'ryugu'） */
  body: string
  /** この日まで、その天体と一緒に動く（土星を回ったカッシーニ、リュウグウにいたはやぶさ2） */
  until?: string
}

export type Probe = {
  id: string
  name: string
  nameEn: string
  /** 一覧に出す一言 */
  summary: string
  summaryEn: string
  color: string
  stops: ProbeStop[]
  /** 最後の天体のあと、まっすぐ進む向き（黄経・黄緯、度）と速さ（天文単位／年） */
  escape?: { lon: number; lat: number; auPerYear: number }
  /** 旅の再生をここで終える（ないものは今日まで） */
  end?: string
  /** 再生の速さ（1秒に何年）。最後の天体を過ぎたら fast にする */
  pace: { slow: number; fast: number }
  /** 今の、太陽からの本物の距離を求める基準（天文単位） */
  distance?: { date: string; au: number; auPerYear: number }
  events: { date: string; text: string; textEn: string }[]
  /** 旅の終わりに出す一言（今も飛んでいるものは、今の距離を足す） */
  last: string
  lastEn: string
}

export const RYUGU_ID = 'ryugu'

export const PROBES: Probe[] = [
  {
    id: 'voyager2',
    name: 'ボイジャー2号',
    nameEn: 'Voyager 2',
    summary: '木星・土星・天王星・海王星をめぐった、ただ一つの探査機',
    summaryEn: 'The only probe to visit Jupiter, Saturn, Uranus and Neptune',
    color: '#b59cff',
    stops: [
      { date: '1977-08-20', body: 'earth' },
      { date: '1979-07-09', body: 'jupiter' },
      { date: '1981-08-25', body: 'saturn' },
      { date: '1986-01-24', body: 'uranus' },
      { date: '1989-08-25', body: 'neptune' },
    ],
    escape: { lon: 290.7, lat: -35.8, auPerYear: 3.25 },
    pace: { slow: 0.55, fast: 3.5 },
    distance: { date: '2018-11-05', au: 119, auPerYear: 3.25 },
    events: [
      { date: '1977-08-20', text: '打ち上げ。外側の惑星が同じ側にそろう、約176年に一度の並びを使って、4つの惑星を次々にめぐる旅へ。', textEn: 'Launch. Using a lineup that happens about once every 176 years, when the outer planets gather on one side, it sets off to visit four planets in a row.' },
      { date: '1979-07-09', text: '木星に最接近。木星の重力で加速して（スイングバイ）、土星へ向かいます。', textEn: 'Closest approach to Jupiter. Jupiter’s gravity speeds it up (a swing-by) and sends it on to Saturn.' },
      { date: '1981-08-25', text: '土星に最接近。輪のこまかなすじや、衛星を調べました。', textEn: 'Closest approach to Saturn. It studied the fine strands in the rings and the moons.' },
      { date: '1986-01-24', text: '天王星に最接近。天王星を近くで見た探査機は、今もボイジャー2号だけです。', textEn: 'Closest approach to Uranus. Voyager 2 is still the only probe to have seen Uranus up close.' },
      { date: '1989-08-25', text: '海王星に最接近。衛星トリトンで、氷の下から噴き出すガスを見つけました。ここから太陽系の面の南へ進みます。', textEn: 'Closest approach to Neptune. On its moon Triton it found gas jetting out from under the ice. From here it heads south of the plane of the solar system.' },
      { date: '2018-11-05', text: '太陽の風が届く範囲（太陽圏）を出て、星と星のあいだの空間へ。', textEn: 'It leaves the region the solar wind reaches (the heliosphere) and enters the space between the stars.' },
    ],
    last: '今も星と星のあいだを飛びながら、地球へデータを送っています。',
    lastEn: 'It is still flying between the stars and sending data back to Earth.',
  },
  {
    id: 'voyager1',
    name: 'ボイジャー1号',
    nameEn: 'Voyager 1',
    summary: 'いちばん遠くまで行った、人の作った物',
    summaryEn: 'The farthest thing people have ever made',
    color: '#6fd0ff',
    stops: [
      { date: '1977-09-05', body: 'earth' },
      { date: '1979-03-05', body: 'jupiter' },
      { date: '1980-11-12', body: 'saturn' },
    ],
    escape: { lon: 255.6, lat: 34.8, auPerYear: 3.57 },
    pace: { slow: 0.32, fast: 4 },
    distance: { date: '2012-08-25', au: 121.6, auPerYear: 3.57 },
    events: [
      { date: '1977-09-05', text: '打ち上げ。2号より16日あとに出発しましたが、近道を通って先に木星へ着きます。', textEn: 'Launch. It left 16 days after Voyager 2, but takes a shortcut and reaches Jupiter first.' },
      { date: '1979-03-05', text: '木星に最接近。衛星イオで、噴火している火山を初めて見つけました。', textEn: 'Closest approach to Jupiter. It found the first erupting volcanoes beyond Earth, on the moon Io.' },
      { date: '1980-11-12', text: '土星に最接近。濃い大気の衛星タイタンを近くで調べるために進路を曲げ、太陽系の面から北へ飛び出しました。', textEn: 'Closest approach to Saturn. It bent its course to study Titan, the moon with a thick atmosphere, and flew up out of the plane of the solar system to the north.' },
      { date: '1990-02-14', text: '約60億km先から地球をふり返って撮影。地球は、光の筋の中の小さな青い点でした（「ペイル・ブルー・ドット」）。', textEn: 'From about 6 billion km away it turned around and photographed Earth: a tiny blue dot in a streak of light (the “Pale Blue Dot”).' },
      { date: '2012-08-25', text: '人の作った物で初めて、太陽圏を出て星と星のあいだの空間へ。', textEn: 'The first human-made object to leave the heliosphere and enter the space between the stars.' },
    ],
    last: '人の作った物の中で、いちばん遠くを飛んでいます。',
    lastEn: 'It is the most distant thing people have ever made.',
  },
  {
    id: 'cassini',
    name: 'カッシーニ',
    nameEn: 'Cassini',
    summary: '4回のスイングバイで土星へ。13年間、土星を回った',
    summaryEn: 'Reached Saturn after four swing-bys, then orbited it for 13 years',
    color: '#ffd27a',
    stops: [
      { date: '1997-10-15', body: 'earth' },
      { date: '1998-04-26', body: 'venus' },
      { date: '1999-06-24', body: 'venus' },
      { date: '1999-08-18', body: 'earth' },
      { date: '2000-12-30', body: 'jupiter' },
      { date: '2004-07-01', body: 'saturn', until: '2017-09-15' },
    ],
    end: '2017-09-15',
    pace: { slow: 0.37, fast: 2 },
    events: [
      { date: '1997-10-15', text: '打ち上げ。重すぎて直接は土星へ行けないので、金星・金星・地球・木星の重力を借りて加速していきます。', textEn: 'Launch. It is too heavy to fly straight to Saturn, so it borrows gravity from Venus, Venus again, Earth and Jupiter to speed up.' },
      { date: '1998-04-26', text: '金星でスイングバイ（1回目）。', textEn: 'Swing-by at Venus (first time).' },
      { date: '1999-06-24', text: '金星でスイングバイ（2回目）。', textEn: 'Swing-by at Venus (second time).' },
      { date: '1999-08-18', text: '地球でスイングバイ。地球のすぐそばを通って、さらに加速。', textEn: 'Swing-by at Earth. It passes very close to Earth and speeds up even more.' },
      { date: '2000-12-30', text: '木星でスイングバイ。通りがけに木星も観測しました。', textEn: 'Swing-by at Jupiter. It observed Jupiter on the way past.' },
      { date: '2004-07-01', text: '土星を回る軌道に入りました。', textEn: 'It entered orbit around Saturn.' },
      { date: '2005-01-14', text: '運んできた小さな探査機ホイヘンスが、衛星タイタンに着陸。', textEn: 'Huygens, the small probe it carried, landed on the moon Titan.' },
      { date: '2005-07-14', text: '衛星エンケラドゥスの南極から、水が噴き出しているのを見つけました。', textEn: 'It found water spraying out of the south pole of the moon Enceladus.' },
    ],
    last: '燃料がなくなり、2017年9月15日に土星の大気へ飛び込んで任務を終えました。生命がいるかもしれない衛星に、落ちて汚さないためです。',
    lastEn: 'Running out of fuel, it ended its mission by diving into Saturn’s atmosphere on September 15, 2017, so it would never crash onto a moon that might have life.',
  },
  {
    id: 'newhorizons',
    name: 'ニュー・ホライズンズ',
    nameEn: 'New Horizons',
    summary: '初めて冥王星を近くで見た探査機',
    summaryEn: 'The first probe to see Pluto up close',
    color: '#7ee08a',
    stops: [
      { date: '2006-01-19', body: 'earth' },
      { date: '2007-02-28', body: 'jupiter' },
      { date: '2015-07-14', body: 'pluto' },
    ],
    escape: { lon: 286, lat: 2, auPerYear: 2.9 },
    pace: { slow: 0.6, fast: 2 },
    distance: { date: '2019-01-01', au: 43.4, auPerYear: 2.9 },
    events: [
      { date: '2006-01-19', text: '打ち上げ。とても速く地球を出発し、わずか9時間で月の軌道を越えました。', textEn: 'Launch. It left Earth so fast that it passed the Moon’s orbit in just 9 hours.' },
      { date: '2007-02-28', text: '木星でスイングバイして、さらに加速。', textEn: 'A swing-by at Jupiter speeds it up even more.' },
      { date: '2015-07-14', text: '冥王星に最接近。ハートの形をした、氷の平原が見えました。', textEn: 'Closest approach to Pluto. It saw a heart-shaped plain of ice.' },
      { date: '2019-01-01', text: '太陽系の外側の小さな天体アロコスを通過。雪だるまのような形でした。', textEn: 'It flew past Arrokoth, a small object in the outer solar system shaped like a snowman.' },
    ],
    last: '太陽系の外側（カイパーベルト）を飛びながら、観測を続けています。',
    lastEn: 'It is still observing as it flies through the outer solar system (the Kuiper Belt).',
  },
  {
    id: 'hayabusa2',
    name: 'はやぶさ2',
    nameEn: 'Hayabusa2',
    summary: '小惑星リュウグウの砂を持ち帰った日本の探査機',
    summaryEn: 'The Japanese probe that brought back sand from the asteroid Ryugu',
    color: '#ff9a7a',
    stops: [
      { date: '2014-12-03', body: 'earth' },
      { date: '2015-12-03', body: 'earth' },
      { date: '2018-06-27', body: RYUGU_ID, until: '2019-11-13' },
      { date: '2020-12-06', body: 'earth' },
    ],
    end: '2020-12-06',
    pace: { slow: 0.25, fast: 0.25 },
    events: [
      { date: '2014-12-03', text: '打ち上げ。目的地は、地球と火星のあいだを回る小惑星リュウグウ。', textEn: 'Launch. Its goal is Ryugu, an asteroid that circles the Sun between Earth and Mars.' },
      { date: '2015-12-03', text: '地球でスイングバイして、リュウグウへ向かう道すじに乗りました。イオンエンジンで少しずつ加速します。', textEn: 'A swing-by at Earth puts it on course for Ryugu. Its ion engines speed it up little by little.' },
      { date: '2018-06-27', text: 'リュウグウに到着。そろばん玉のような形の小惑星でした。', textEn: 'Arrival at Ryugu, an asteroid shaped like a spinning top.' },
      { date: '2019-02-22', text: '1回目のタッチダウン。表面の砂を集めました。', textEn: 'First touchdown. It collected sand from the surface.' },
      { date: '2019-07-11', text: '2回目のタッチダウン。自分で作ったクレーターのそばに降りて、地下の砂も集めました。', textEn: 'Second touchdown. It landed beside a crater it had made itself and collected sand from underground too.' },
      { date: '2019-11-13', text: 'リュウグウを出発して、地球へ。', textEn: 'It leaves Ryugu and heads for Earth.' },
    ],
    last: '2020年12月6日、カプセルがオーストラリアに着地し、リュウグウの砂を届けました。探査機は、次の小惑星をめざして旅を続けています。',
    lastEn: 'On December 6, 2020, its capsule landed in Australia and delivered the sand from Ryugu. The probe is continuing on toward its next asteroid.',
  },
]

/** リュウグウの軌道要素（2011年12月12日の値） */
export const RYUGU = { epoch: '2011-12-12', a: 1.1896, e: 0.1902, i: 5.8837, node: 251.62, peri: 211.43, M: 3.9832, periodDays: 474 }

export const dateMs = (iso: string) => Date.parse(`${iso}T12:00:00Z`)
