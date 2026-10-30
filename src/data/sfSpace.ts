import { t } from '../i18n/lang'
import type { Facts } from './facts'

// SF モードの、遠くを旅する大きな船や人工の天体（オリジナルのデザイン。作品の名前・形は使わない）。
// 電波望遠鏡の人工の月、くさび形の鉱石輸送船、円盤形の貨物船。どれも武器は持たない。

/** 電波望遠鏡の人工の月（火星の公転の道すじの上、火星より60度うしろ＝火星のトロヤ点 L5） */
export const RADIO_MOON_ID = 'radio-moon'
export const radioMoonName = () => t('電波望遠鏡の人工月', 'Radio Telescope Moon')
/** くさび形の鉱石輸送船（小惑星帯をゆっくり一周する） */
export const CARRIER_ID = 'ore-carrier'
export const carrierName = () => t('くさび形の鉱石輸送船', 'Wedge Ore Carrier')
/** 円盤形の貨物船（月と L5 のコロニーのあいだを行き来する） */
export const FREIGHTER_ID = 'disc-freighter'
export const freighterName = () => t('円盤形の貨物船', 'Disc Freighter')

export const SPACE_TEXT = {
  radioMoonFound: () =>
    t(
      '月のように大きな、人工の球体です。北極の大きなくぼみは、宇宙からの電波を集める電波望遠鏡のお皿です。\n（I で航海日誌）',
      'A man-made sphere as big as a moon. The huge bowl at its north pole is the dish of a radio telescope that gathers radio waves from space.\n(I for the ship’s log)',
    ),
  carrierFound: () =>
    t(
      '小惑星から掘った鉱石を運ぶ、くさび形の大きな輸送船です。両側に積んだコンテナと、船の下の開いた荷室が見えます。\n（I で航海日誌）',
      'A huge wedge-shaped carrier hauling ore mined from asteroids. You can see containers stacked along its sides and the open cargo bay underneath.\n(I for the ship’s log)',
    ),
  freighterFound: () =>
    t(
      '円盤形の小さな貨物船です。月で作った資材を、L5のコロニーへ運んでいます。\n（I で航海日誌）',
      'A small disc-shaped freighter carrying materials made on the Moon to the L5 colonies.\n(I for the ship’s log)',
    ),
}

export const SPACE_FACTS: Record<string, Facts> = {
  [RADIO_MOON_ID]: {
    rows: [
      ['大きさ', '直径 約150km（自機の約230倍）'],
      ['お皿', '北極の直径 約50kmのくぼみ。3本の塔から受信機をつり下げています'],
      ['場所', '火星の公転の道すじの上、火星より60度うしろ（火星のトロヤ点）'],
    ],
    fiction: true,
    notes: [
      '中をくりぬいた岩の球に外板を張った、人工の月です。緯度にそって何本も帯が巻かれ、ところどころに小さな電波のお皿と、船の出入り口があります。',
      '北極の大きなお皿で、遠い銀河やブラックホールから届く弱い電波を集めます。武器ではありません。',
      '近づくと自機を縮めて、人工の月との大きさを本物の比率で見せます。',
    ],
    real: [
      '本物でいちばん大きな電波望遠鏡のお皿は、中国の「FAST」（直径500m、2016年完成）。山のくぼ地を利用して作られました。',
      'プエルトリコのアレシボ電波望遠鏡（直径305m）は、3本の塔から受信機をつり下げていましたが、2020年にケーブルが切れて壊れました。',
      '月の裏側は地球からの電波のじゃまが届かない、とても静かな場所です。NASAではクレーターの中に電波望遠鏡を作る案（LCRT）が研究されています。',
      '人が宇宙に作ったいちばん大きな物は国際宇宙ステーション（ISS）で、はばは約109mです。',
    ],
    quiz: {
      question: '月の裏側が、電波望遠鏡を置く場所として注目されているのはなぜ？',
      choices: ['地球からの電波のじゃまが届かないから', '月の裏側は暖かいから', '太陽にいちばん近いから'],
      answer: 0,
      explanation: '月の裏側からは地球が見えないので、テレビやスマホなど地球の電波が月そのものにさえぎられます。宇宙からのとても弱い電波も聞き取れます。',
    },
  },
  [CARRIER_ID]: {
    rows: [
      ['大きさ', '長さ 約1.6km（自機の約2.5倍）'],
      ['積み荷', '小惑星から掘った鉄・ニッケル・水の氷'],
      ['航路', '小惑星帯をゆっくり一周（一周に数時間）'],
    ],
    fiction: true,
    notes: [
      '両側の斜めの面にコンテナを積み、船の下の大きな荷室には、掘った鉱石のかたまりを抱えています。',
      '船の背には、熱を逃がす放熱板と、低い操縦室があります。エンジンは後ろに6つ横に並んでいます。',
    ],
    real: [
      '今、宇宙で荷物を運んでいるのは、国際宇宙ステーションへ物資を届ける補給船です。スペースXの「ドラゴン」、日本の「HTV-X」、ノースロップ・グラマンの「シグナス」などがあります。',
      '小惑星には鉄やニッケル、白金のような金属や、水の氷をたくさん含むものがあります。宇宙で使う材料や燃料（水から作る水素と酸素）を、地球から打ち上げずにすむかもしれません。',
      'NASAの探査機「サイキ」は、金属でできていると考えられる小惑星プシケを調べに、2023年に出発しました。',
    ],
    quiz: {
      question: '小惑星の水の氷が役に立つと考えられているのはなぜ？',
      choices: ['ロケットの燃料（水素と酸素）を作れるから', '宇宙で泳ぐため', '太陽を冷やすため'],
      answer: 0,
      explanation: '水を電気で分けると、水素と酸素になります。どちらもロケットの燃料になり、飲み水や空気にもなります。',
    },
  },
  [FREIGHTER_ID]: {
    rows: [
      ['大きさ', '直径 約250m'],
      ['航路', '月 ↔ L5のコロニー群'],
    ],
    fiction: true,
    notes: ['月で作った鉄やガラスを、L5のコロニーへ運ぶ小さな貨物船です。真ん中の丸い屋根が操縦室、下には荷物の箱を抱えています。'],
    real: [
      '月の砂（レゴリス）には酸素やケイ素、鉄、アルミニウムが含まれていて、ガラスや金属の材料になります。',
      '月は重力が弱く空気もないので、レールの上で物を加速して打ち出す「マスドライバー」で資材を送る案もあります（オニールのコロニーの構想の一部）。',
    ],
    quiz: {
      question: '月で作った資材を宇宙へ送るのが、地球からより楽なのはなぜ？',
      choices: ['月の重力が地球の約6分の1だから', '月は太陽に近いから', '月には海があるから'],
      answer: 0,
      explanation: '重力が弱いほど、打ち上げに必要な速さとエネルギーが小さくてすみます。空気がないので、空気の抵抗もありません。',
    },
  },
}

export const SPACE_FACTS_EN: Record<string, Facts> = {
  [RADIO_MOON_ID]: {
    rows: [
      ['Size', 'About 150 km across (about 230 times your ship)'],
      ['Dish', 'A bowl about 50 km wide at the north pole, with a receiver hung from three towers'],
      ['Where', 'On Mars’s orbit, 60° behind Mars (a Mars trojan point)'],
    ],
    fiction: true,
    notes: [
      'A man-made moon: a hollowed rocky ball covered in hull plates. Bands wrap it along lines of latitude, with small radio dishes and ship entrances here and there.',
      'The big dish at the north pole gathers faint radio waves from distant galaxies and black holes. It is not a weapon.',
      'As you come close, your ship shrinks so the moon is shown at its real size compared with the ship.',
    ],
    real: [
      'The largest real radio dish is China’s FAST, 500 m across, finished in 2016 in a natural hollow among the hills.',
      'The Arecibo radio telescope in Puerto Rico (305 m) hung its receiver from three towers. Its cables broke and it collapsed in 2020.',
      'The far side of the Moon is shielded from Earth’s radio noise, so it is a very quiet place. NASA has studied building a radio telescope inside a crater there (LCRT).',
      'The biggest thing people have built in space is the International Space Station, about 109 m wide.',
    ],
    quiz: {
      question: 'Why is the far side of the Moon interesting for radio telescopes?',
      choices: ['Earth’s radio noise cannot reach it', 'It is warm there', 'It is closest to the Sun'],
      answer: 0,
      explanation: 'Earth is never in the sky on the far side, so the Moon itself blocks TV, phone and other radio noise from Earth. Even very faint radio waves from space can be heard.',
    },
  },
  [CARRIER_ID]: {
    rows: [
      ['Size', 'About 1.6 km long (about 2.5 times your ship)'],
      ['Cargo', 'Iron, nickel and water ice mined from asteroids'],
      ['Route', 'A slow loop around the asteroid belt (a few hours per lap)'],
    ],
    fiction: true,
    notes: [
      'Containers are stacked on its sloping sides, and the big bay underneath holds chunks of mined ore.',
      'Along its back are radiator panels to shed heat and a low bridge. Six engines sit side by side at the stern.',
    ],
    real: [
      'Today, cargo in space is carried by supply ships to the International Space Station, such as SpaceX’s Dragon, Japan’s HTV-X and Northrop Grumman’s Cygnus.',
      'Some asteroids hold lots of metals such as iron, nickel and platinum, or water ice. Materials and fuel (hydrogen and oxygen from water) for use in space might not need to be launched from Earth.',
      'NASA’s Psyche spacecraft left in 2023 to study Psyche, an asteroid thought to be made largely of metal.',
    ],
    quiz: {
      question: 'Why could water ice on asteroids be useful?',
      choices: ['It can be made into rocket fuel (hydrogen and oxygen)', 'For swimming in space', 'To cool the Sun'],
      answer: 0,
      explanation: 'Splitting water with electricity gives hydrogen and oxygen. Both are rocket fuel, and they also give drinking water and air.',
    },
  },
  [FREIGHTER_ID]: {
    rows: [
      ['Size', 'About 250 m across'],
      ['Route', 'The Moon ↔ the L5 colonies'],
    ],
    fiction: true,
    notes: ['A small freighter carrying iron and glass made on the Moon to the L5 colonies. The round dome in the middle is the cockpit, and it holds cargo boxes underneath.'],
    real: [
      'Moon dust (regolith) contains oxygen, silicon, iron and aluminium, which can be made into glass and metal.',
      'The Moon has weak gravity and no air, so one idea is a “mass driver” that speeds cargo along a rail and flings it into space (part of O’Neill’s colony plans).',
    ],
    quiz: {
      question: 'Why is it easier to send materials into space from the Moon than from Earth?',
      choices: ['The Moon’s gravity is about one sixth of Earth’s', 'The Moon is closer to the Sun', 'The Moon has oceans'],
      answer: 0,
      explanation: 'The weaker the gravity, the less speed and energy a launch needs. And with no air, there is no air resistance either.',
    },
  },
}
