import { t } from '../i18n/lang'
import type { Facts } from './facts'

// SF モードの推進小惑星（オリジナルのデザイン）。採掘のために、小惑星帯から地球の近くへ
// エンジンでゆっくり運ばれてくる大きな岩。採掘基地・居住リング・エンジン群を取りつけている。

export const ENGINE_ROCK_ID = 'engine-rock'
export const engineRockName = () => t('推進小惑星', 'Engine Asteroid')

export const ENGINE_ROCK_TEXT = {
  found: () =>
    t(
      '推進小惑星が見えてきた。採掘のために、小惑星帯から地球の近くへエンジンで運ばれている途中です。\n（I で航海日誌）',
      'The Engine Asteroid comes into view. It is being pushed by its engines from the asteroid belt toward Earth, to be mined.\n(I for the ship’s log)',
    ),
}

export const ENGINE_FACTS: Record<string, Facts> = {
  [ENGINE_ROCK_ID]: {
    rows: [
      ['大きさ', '長さ約9km の岩のかたまり'],
      ['場所', '火星と地球の軌道のあいだ。何年もかけて地球へ近づく'],
      ['設備', '採掘基地、回る居住リング、6基のプラズマエンジン'],
    ],
    fiction: true,
    notes: [
      '小惑星をまるごと運んできて、金属や水を採ろうという未来の計画を描いたものです。',
      'エンジンは青白いプラズマを吹き出し、とても小さな力で長い時間押しつづけます。',
      '居住リングは回転して、働く人のために重力の代わりの力をつくっています。',
    ],
    real: [
      'NASA は2010年代に、小惑星の岩を捕まえて月のまわりまで運ぶ「小惑星捕獲計画（ARM）」を考えましたが、2017年に中止になりました。',
      '日本の「はやぶさ2」はリュウグウ（2020年）、NASA の「オシリス・レックス」はベンヌ（2023年）の砂を地球へ持ち帰りました。量は約5グラムと約120グラムです。',
      'NASA の探査機「サイキ」は、金属でできているかもしれない小惑星プシケへ向かっていて、2029年に着く予定です。',
      '何kmもある小惑星を動かすのはとても大変です。今のイオンエンジンの押す力は紙1枚の重さほど（数十ミリニュートン）なので、軌道を少し変えるだけでも何年も押しつづける必要があります。',
    ],
    quiz: {
      question: '「はやぶさ2」が砂を持ち帰った小惑星はどれ？',
      choices: ['リュウグウ', 'ベンヌ', 'プシケ'],
      answer: 0,
      explanation: 'はやぶさ2は2020年にリュウグウの砂を地球へ届けました。ベンヌはオシリス・レックス、プシケはサイキが向かう小惑星です。',
    },
  },
}

export const ENGINE_FACTS_EN: Record<string, Facts> = {
  [ENGINE_ROCK_ID]: {
    rows: [
      ['Size', 'A lump of rock about 9 km long'],
      ['Where', 'Between the orbits of Mars and Earth, creeping toward Earth over many years'],
      ['Equipment', 'A mining base, a spinning habitat ring and six plasma engines'],
    ],
    fiction: true,
    notes: [
      'It shows a future plan to bring a whole asteroid home and mine it for metal and water.',
      'The engines blow out bluish-white plasma, pushing very gently for a very long time.',
      'The habitat ring spins to make a push that works like gravity for the people working there.',
    ],
    real: [
      'In the 2010s NASA studied the Asteroid Redirect Mission (ARM), which would have grabbed a boulder from an asteroid and moved it into orbit around the Moon. It was cancelled in 2017.',
      'Japan’s Hayabusa2 brought back sand from Ryugu (2020), and NASA’s OSIRIS-REx brought back sand from Bennu (2023): about 5 grams and about 120 grams.',
      'NASA’s Psyche probe is on its way to the asteroid Psyche, which may be made of metal. It should arrive in 2029.',
      'Moving an asteroid kilometres across is extremely hard. Today’s ion engines push about as hard as the weight of a sheet of paper (tens of millinewtons), so changing an orbit even a little takes years of pushing.',
    ],
    quiz: {
      question: 'Which asteroid did Hayabusa2 bring sand back from?',
      choices: ['Ryugu', 'Bennu', 'Psyche'],
      answer: 0,
      explanation: 'Hayabusa2 delivered sand from Ryugu to Earth in 2020. Bennu was OSIRIS-REx’s target, and Psyche is where the Psyche probe is heading.',
    },
  },
}
