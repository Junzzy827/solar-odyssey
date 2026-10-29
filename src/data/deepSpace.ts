import { HUBBLE_ID, WEBB_ID, type ScopeId } from './telescopes'
import { getLang, t } from '../i18n/lang'

// 宇宙望遠鏡でのぞける写真。画像は ESA/Hubble・ESA/Webb の公開画像（CC BY 4.0）を
// 長辺2400pxに縮めて public/deep-space/ に置いている。クレジットは必ず表示する。
// 距離などの数値は NASA・ESA の解説の概数。

type DeepSpaceText = { name: string; kind: string; distance: string; lookback: string; notes: string[] }

export type DeepSpaceImage = {
  id: string
  scope: ScopeId
  /** 英語の説明（下の日本語と同じ項目） */
  en: DeepSpaceText
  name: string
  /** どんな天体か */
  kind: string
  file: string
  distance: string
  /** この光が出発したのはいつか */
  lookback: string
  notes: string[]
  /** 同じ場所をもう一方の望遠鏡で撮った写真 */
  pair?: string
  credit: string
  source: string
}

/** 今の言語の説明 */
export const deepSpaceText = (image: DeepSpaceImage): DeepSpaceText => (getLang() === 'en' ? image.en : image)

/** 望遠鏡ごとの、見ている光 */
export const scopeLight = (id: ScopeId) =>
  id === HUBBLE_ID ? t('可視光（人の目に見える光）', 'visible light (the light our eyes can see)') : t('赤外線（人の目には見えない、熱の光）', 'infrared (heat light our eyes cannot see)')

const hubble = (id: string) => `https://esahubble.org/images/${id}/`
const webb = (id: string) => `https://esawebb.org/images/${id}/`

export const DEEP_SPACE: DeepSpaceImage[] = [
  {
    id: 'hubble-andromeda',
    en: {
      name: 'Andromeda Galaxy',
      kind: 'Galaxy (our Milky Way’s neighbor)',
      distance: 'About 2.5 million light-years',
      lookback: 'About 2.5 million years ago, around when our human ancestors began using stone tools.',
      notes: [
        'A big spiral galaxy right next to our Milky Way. Under a dark sky you can even see it faintly with your own eyes.',
        'This picture of part of the galaxy was stitched together from hundreds of shots. More than 100 million individual stars are in it.',
        'The bright area on the left is the center of the galaxy. Farther right is the outer part, with lanes of dust and clusters of young blue stars.',
      ],
    },
    scope: HUBBLE_ID,
    name: 'アンドロメダ銀河',
    kind: '銀河（天の川銀河のおとなり）',
    file: 'heic1502a.jpg',
    distance: '約250万光年',
    lookback: '約250万年前。人類の祖先が石の道具を使いはじめたころです。',
    notes: [
      '天の川銀河のおとなりにある、渦を巻いた大きな銀河です。暗い夜空なら、肉眼でもぼんやり見えます。',
      '銀河の一部を何百回にも分けて撮り、つなぎ合わせた写真です。1億個以上の星が一つずつ写っています。',
      '左の明るいところが銀河の中心。右へ行くほど外側で、ちりの帯と、青く光る若い星の集まりが見えます。',
    ],
    credit:
      'NASA, ESA, J. Dalcanton (University of Washington, USA), B. F. Williams (University of Washington, USA), L. C. Johnson (University of Washington, USA), the PHAT team, and R. Gendler.',
    source: hubble('heic1502a'),
  },
  {
    id: 'hubble-pillars',
    en: {
      name: 'Pillars of Creation (Eagle Nebula)',
      kind: 'A cloud where stars are born',
      distance: 'About 6,500 light-years',
      lookback: 'About 6,500 years ago, when people were first starting to make tools from metal.',
      notes: [
        'These pillars are made of gas and dust. The tallest is about 4 light-years long (even light takes 4 years to cross it).',
        'Inside the pillars, gravity is pulling gas together and new stars are being born.',
        'In visible light, the dust blocks the light, so you can hardly see inside the pillars.',
      ],
    },
    scope: HUBBLE_ID,
    name: '創造の柱（わし星雲）',
    kind: '星が生まれる雲',
    file: 'heic1501a.jpg',
    distance: '約6500光年',
    lookback: '約6500年前。日本では縄文時代のころです。',
    notes: [
      'ガスとちりでできた柱です。いちばん高い柱は約4光年（光でも4年かかる長さ）あります。',
      '柱の中では、ガスが重力で集まって、新しい星が生まれています。',
      '目に見える光では、ちりが光をさえぎるので、柱の中はほとんど見えません。',
    ],
    pair: 'webb-pillars',
    credit: 'NASA, ESA/Hubble and the Hubble Heritage Team',
    source: hubble('heic1501a'),
  },
  {
    id: 'hubble-crab',
    en: {
      name: 'Crab Nebula',
      kind: 'What is left after a star exploded (a supernova)',
      distance: 'About 6,500 light-years',
      lookback: 'About 6,500 years ago. The light of this explosion reached Earth in the year 1054.',
      notes: [
        'This is the gas thrown out when a heavy star exploded at the end of its life (a supernova).',
        'Chinese records tell of a star that appeared in 1054, bright enough to see in daytime. Japanese records mention it too, copied into the poet Fujiwara no Teika’s diary.',
        'At its center is a tiny, very heavy star (a neutron star) that spins about 30 times a second.',
      ],
    },
    scope: HUBBLE_ID,
    name: 'かに星雲',
    kind: '星の大爆発（超新星）のあと',
    file: 'heic0515a.jpg',
    distance: '約6500光年',
    lookback: '約6500年前。この爆発の光が地球に届いたのは、西暦1054年でした。',
    notes: [
      '重い星が一生の最後に起こした大爆発（超新星）で、飛び散ったガスです。',
      '1054年、昼間でも見えるほど明るい星が現れたことが、中国の記録に残っています。藤原定家の日記『明月記』にも書き写されています。',
      '中心には、1秒に約30回も回る、とても小さく重い星（中性子星）があります。',
    ],
    credit: 'NASA, ESA and Allison Loll/Jeff Hester (Arizona State University). Acknowledgement: Davide De Martin (ESA/Hubble)',
    source: hubble('heic0515a'),
  },
  {
    id: 'hubble-sombrero',
    en: {
      name: 'Sombrero Galaxy',
      kind: 'Galaxy',
      distance: 'About 28 million light-years',
      lookback: 'About 28 million years ago, roughly 40 million years after the dinosaurs died out.',
      notes: [
        'It is named after the sombrero, a wide-brimmed Mexican hat, because it looks like one.',
        'The dark band is a ring of dust around the galaxy’s edge. We are seeing it almost exactly edge-on.',
        'At its center there is thought to be a black hole about a billion times as heavy as the Sun.',
      ],
    },
    scope: HUBBLE_ID,
    name: 'ソンブレロ銀河',
    kind: '銀河',
    file: 'opo0328a.jpg',
    distance: '約2800万光年',
    lookback: '約2800万年前。恐竜がいなくなってから、およそ4000万年たったころです。',
    notes: [
      'つばの広いメキシコの帽子「ソンブレロ」に似ていることから、この名前がつきました。',
      '黒い帯は、銀河のふちを取り巻くちりの輪です。ほとんど真横から見ています。',
      '中心には、太陽の約10億倍の重さのブラックホールがあると考えられています。',
    ],
    credit: 'NASA/ESA and The Hubble Heritage Team (STScI/AURA)',
    source: hubble('opo0328a'),
  },
  {
    id: 'hubble-udf',
    en: {
      name: 'Hubble Ultra Deep Field',
      kind: 'Deep space',
      distance: 'The farthest galaxies: about 13 billion light-years',
      lookback: 'The light from the farthest galaxies left about 13 billion years ago, when the universe was only about 800 million years old.',
      notes: [
        'Hubble stared at a tiny patch of sky that looks empty (about a tenth the width of the full Moon) for a total of about 11 days.',
        'The dots and swirls of light are not stars: almost all of them are galaxies. About 10,000 galaxies are in this picture.',
        'The farther away a galaxy is, the further back in time we are seeing it, as it was when its light set out.',
      ],
    },
    scope: HUBBLE_ID,
    name: 'ハッブル・ウルトラ・ディープ・フィールド',
    kind: '宇宙の奥',
    file: 'heic0611b.jpg',
    distance: 'いちばん遠い銀河は、光で約130億年',
    lookback: 'いちばん遠い銀河の光は約130億年前。宇宙が生まれて8億年ほどのころです。',
    notes: [
      '夜空の、何もないように見える小さな一点（満月の幅の10分の1ほど）を、合計約11日分も撮り続けた写真です。',
      '写っている光の点や渦は、星ではなく、ほとんどが銀河。約1万個の銀河が写っています。',
      '遠くの銀河ほど、光が出発した昔の姿が見えています。',
    ],
    credit: 'NASA, ESA, and S. Beckwith (STScI) and the HUDF Team',
    source: hubble('heic0611b'),
  },
  {
    id: 'webb-deepfield',
    en: {
      name: 'Webb’s First Deep Field',
      kind: 'Deep space (galaxy cluster SMACS 0723)',
      distance: 'The cluster in front: about 4.6 billion light-years',
      lookback: 'The light from the cluster in front left about 4.6 billion years ago, just when Earth was forming. Galaxies more than 13 billion years old are behind it.',
      notes: [
        'This patch of sky is about the size of a grain of sand held at arm’s length. Webb took the picture in about 12 and a half hours.',
        'The gravity of the cluster in front bends light like a lens, stretching faraway galaxies behind it into arcs (gravitational lensing).',
        'It was the first picture Webb released, in July 2022.',
      ],
    },
    scope: WEBB_ID,
    name: 'ウェッブの最初のディープフィールド',
    kind: '宇宙の奥（銀河団 SMACS 0723）',
    file: 'weic2209a.jpg',
    distance: '手前の銀河団まで、光で約46億年',
    lookback: '手前の銀河団の光は約46億年前、ちょうど地球が生まれたころに出発しました。奥には130億年以上前の銀河も写っています。',
    notes: [
      '腕をいっぱいにのばして持った砂つぶ1つぶんほどの、小さな空です。ウェッブは約12時間半でこの写真を撮りました。',
      '手前の銀河の集まりの重力がレンズのように光を曲げ、奥にある遠い銀河を弓のように引きのばして見せています（重力レンズ）。',
      '2022年7月、ウェッブが最初に公開した写真です。',
    ],
    credit: 'NASA, ESA, CSA, and STScI',
    source: webb('weic2209a'),
  },
  {
    id: 'webb-pillars',
    en: {
      name: 'Pillars of Creation (Eagle Nebula)',
      kind: 'A cloud where stars are born',
      distance: 'About 6,500 light-years',
      lookback: 'About 6,500 years ago, when people were first starting to make tools from metal.',
      notes: [
        'Webb photographed the same pillars Hubble did, this time in infrared.',
        'Infrared passes through dust more easily, so many more stars beyond the pillars show up.',
        'The red dots and wavy lines along the edges are gas blown out by stars that are still being born.',
      ],
    },
    scope: WEBB_ID,
    name: '創造の柱（わし星雲）',
    kind: '星が生まれる雲',
    file: 'weic2216a.jpg',
    distance: '約6500光年',
    lookback: '約6500年前。日本では縄文時代のころです。',
    notes: [
      'ハッブルが撮った柱を、ウェッブが赤外線で撮り直しました。',
      '赤外線はちりを通りぬけやすいので、柱の向こうの星がたくさん見えます。',
      '柱のふちの赤い点や波打つ線は、まだ生まれつつある星が吹き出したガスです。',
    ],
    pair: 'hubble-pillars',
    credit: 'NASA, ESA, CSA, STScI; J. DePasquale, A. Koekemoer, A. Pagan (STScI).',
    source: webb('weic2216a'),
  },
  {
    id: 'webb-cliffs',
    en: {
      name: 'Carina Nebula “Cosmic Cliffs”',
      kind: 'A cloud where stars are born',
      distance: 'About 7,600 light-years',
      lookback: 'About 7,600 years ago, when farming was spreading around the world.',
      notes: [
        'It looks like mountains at sunset, but it is the edge of a cloud of gas and dust. The tallest “peak” is about 7 light-years high.',
        'In the part that looks like blue sky above, strong light and winds from hot young stars outside the cloud are wearing it away.',
        'In infrared, hundreds of newborn stars that were hidden inside the cloud appear.',
      ],
    },
    scope: WEBB_ID,
    name: 'カリーナ星雲「宇宙の崖」',
    kind: '星が生まれる雲',
    file: 'weic2205a.jpg',
    distance: '約7600光年',
    lookback: '約7600年前。日本では縄文時代のころです。',
    notes: [
      '夕焼けの山並みのように見えますが、ガスとちりの雲のふちです。いちばん高い「山」は約7光年あります。',
      '上の青い空のように見えるところでは、雲の外の若く熱い星の強い光と風が、雲をけずっています。',
      '赤外線で見ると、雲の中に隠れていた何百もの生まれたばかりの星が見えてきます。',
    ],
    credit: 'NASA, ESA, CSA, and STScI',
    source: webb('weic2205a'),
  },
  {
    id: 'webb-stephan',
    en: {
      name: 'Stephan’s Quintet',
      kind: 'A group of galaxies',
      distance: 'About 290 million light-years',
      lookback: 'About 290 million years ago, before the first dinosaurs appeared.',
      notes: [
        'Five galaxies seem to be together, but the one on the left is actually much closer (about 40 million light-years) and just happens to line up.',
        'The other four are pulling on each other with gravity and colliding.',
        'It is one of Webb’s biggest pictures, stitched together from about 1,000 images.',
      ],
    },
    scope: WEBB_ID,
    name: 'ステファンの五つ子',
    kind: '銀河の集まり',
    file: 'weic2208a.jpg',
    distance: '約2億9000万光年',
    lookback: '約2億9000万年前。恐竜が現れるよりも前です。',
    notes: [
      '5つの銀河が集まって見えますが、左の1つは実はずっと手前（約4000万光年）にあり、たまたま重なって見えています。',
      '残りの4つは、おたがいの重力で引っぱり合い、ぶつかり合っています。',
      'ウェッブの写真の中でも特に大きな1枚で、約1000枚の画像をつなぎ合わせています。',
    ],
    credit: 'NASA, ESA, CSA, and STScI',
    source: webb('weic2208a'),
  },
]

/** 見くらべのボタンに出す短い名前 */
export const scopeLightShort = (id: ScopeId) => (id === HUBBLE_ID ? t('可視光', 'visible') : t('赤外線', 'infrared'))

const base = `${import.meta.env.BASE_URL}deep-space/`
export const deepSpaceUrl = (image: DeepSpaceImage) => base + image.file
/** 一覧に出す小さな見本（正方形に切り抜いたもの） */
export const deepSpaceThumb = (image: DeepSpaceImage) => `${base}thumbs/${image.file}`
