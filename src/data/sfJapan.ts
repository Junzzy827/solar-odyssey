import { t } from '../i18n/lang'
import type { Facts } from './facts'

// SF モードの、日本のお話から生まれたもの。どちらも作品の権利が切れた昔の物語なので、名前も使える。
// 銀河鉄道：宮沢賢治『銀河鉄道の夜』（1927年ごろ）。光のレールを走る汽車。
// 月の都：『竹取物語』（平安時代）。かぐや姫が帰っていった、月の都。

/** 銀河鉄道（光のレールで太陽系をめぐる） */
export const RAILWAY_ID = 'galactic-railway'
export const railwayName = () => t('銀河鉄道', 'Galactic Railway')
/** 月の都（月の裏側のクレーターの底） */
export const MOON_CITY_ID = 'moon-city'
export const moonCityName = () => t('月の都', 'Moon Capital')

export const JAPAN_TEXT = {
  railwayFound: () =>
    t(
      '光のレールの上を、銀河鉄道が走ってきます。窓には明かりがともり、煙突から星くずの煙がたなびいています。\n（I で航海日誌）',
      'The Galactic Railway comes running along its rails of light. Its windows are lit, and stardust smoke trails from the smokestack.\n(I for the ship’s log)',
    ),
  moonCityFound: () =>
    t(
      '月の裏側のクレーターの底に、光る都が見えます。地球からは決して見えない場所です。\n（I で航海日誌）',
      'A city of light glows on a crater floor on the far side of the Moon, a place that can never be seen from Earth.\n(I for the ship’s log)',
    ),
}

export const JAPAN_FACTS: Record<string, Facts> = {
  [RAILWAY_ID]: {
    rows: [
      ['もとの物語', '宮沢賢治『銀河鉄道の夜』（1927年ごろに書かれ、亡くなったあと1934年に発表）'],
      ['道すじ', '地球の近くから、土星の外まで回って戻る光のレール'],
      ['編成', '機関車1両と客車3両'],
    ],
    fiction: true,
    notes: [
      '物語では、少年ジョバンニと親友カムパネルラが、天の川に沿って走る汽車で星から星へ旅をします。',
      'この汽車は、太陽系の中をゆっくり一周しています。目標にしてワープすると、汽車と並んで飛べます。',
    ],
    real: [
      '天の川は、わたしたちの銀河を内側から横に見た姿です。円盤の形に、1000億〜4000億個の星が集まっています。',
      '物語に出てくる「北十字」は、はくちょう座の星の並びです。くちばしの星アルビレオは、本当に金色と青の2つの星が並んだ「二重星」で、望遠鏡で見ると色の違いがよくわかります。',
      '宮沢賢治は天文が大好きで、星座を歌った「星めぐりの歌」も作りました。',
    ],
    quiz: {
      question: '天の川が、夜空に帯のように見えるのはなぜ？',
      choices: ['わたしたちの銀河の円盤を、内側から横に見ているから', '大きな雲が光っているから', '月の光が反射しているから'],
      answer: 0,
      explanation: '太陽系は銀河の円盤の中にあります。円盤の向きを見ると星が重なって、光の帯に見えます。',
    },
  },
  [MOON_CITY_ID]: {
    rows: [
      ['もとの物語', '『竹取物語』（平安時代。日本でいちばん古い物語といわれる）'],
      ['場所', '月の裏側のクレーターの底（地球からは見えない）'],
      ['ようす', '白い壁と金の屋根の宮殿、門、池、空に浮かぶ灯'],
    ],
    fiction: true,
    notes: [
      '物語では、竹から生まれたかぐや姫が、満月の夜に月の都からの迎えに連れられて帰っていきます。',
      '月の裏側の上を飛ぶと、都の灯が見えます。',
    ],
    real: [
      '月はいつも同じ面を地球に向けています。地球のまわりを1周する間に、ちょうど1回自転するからです（潮汐固定）。そのため裏側は地球から見えません。',
      '2019年、中国の「嫦娥4号」が初めて月の裏側に着陸しました。2024年には「嫦娥6号」が裏側の砂を地球へ持ち帰りました。',
      '日本の月周回衛星「かぐや」（2007年）は、かぐや姫から名前をもらいました。2024年には日本の「SLIM」が、ねらった場所から約100m以内に降りる「ピンポイント着陸」に成功しました。',
      '裏側は「暗い側」ではありません。新月のとき、裏側には太陽の光がたっぷり当たっています。',
    ],
    quiz: {
      question: '月の裏側が、地球から見えないのはなぜ？',
      choices: ['月が地球を1周するあいだに、ちょうど1回自転するから', '裏側がいつも夜だから', '月が自転していないから'],
      answer: 0,
      explanation: '公転と自転の時間が同じ（約27日）なので、いつも同じ面が地球を向きます。これを潮汐固定といいます。',
    },
  },
}

export const JAPAN_FACTS_EN: Record<string, Facts> = {
  [RAILWAY_ID]: {
    rows: [
      ['Story', 'Kenji Miyazawa’s “Night on the Galactic Railroad” (written around 1927, published after his death in 1934)'],
      ['Route', 'Rails of light from near Earth out past Saturn and back'],
      ['Train', 'One locomotive and three coaches'],
    ],
    fiction: true,
    notes: [
      'In the story, a boy named Giovanni and his best friend Campanella ride a train along the Milky Way from star to star.',
      'This train runs a slow loop through the solar system. Warp to it as a target and you can fly alongside.',
    ],
    real: [
      'The Milky Way is our own galaxy seen edge-on from inside. Its disk holds about 100 to 400 billion stars.',
      'The “Northern Cross” in the story is the star pattern of Cygnus, the swan. Albireo, the star at its beak, really is a double star of gold and blue, easy to see in a small telescope.',
      'Kenji Miyazawa loved astronomy and even wrote a song about the constellations, “Song of the Circling Stars”.',
    ],
    quiz: {
      question: 'Why does the Milky Way look like a band across the night sky?',
      choices: ['We see the disk of our galaxy edge-on from inside', 'A huge cloud is glowing', 'Moonlight is reflecting off it'],
      answer: 0,
      explanation: 'The solar system sits inside the disk of the galaxy. Looking along the disk, the stars pile up into a band of light.',
    },
  },
  [MOON_CITY_ID]: {
    rows: [
      ['Story', '“The Tale of the Bamboo Cutter” (Heian period, said to be Japan’s oldest story)'],
      ['Where', 'A crater floor on the far side of the Moon (never visible from Earth)'],
      ['Sight', 'Palaces with white walls and gold roofs, gates, a pond and floating lanterns'],
    ],
    fiction: true,
    notes: [
      'In the story, Princess Kaguya, found inside a bamboo stalk, is taken home by envoys from the Moon on a night of the full moon.',
      'Fly over the far side of the Moon and you will see the lights of the capital.',
    ],
    real: [
      'The Moon always shows the same face to Earth, because it turns exactly once for every trip around Earth (tidal locking). So its far side is never seen from Earth.',
      'In 2019 China’s Chang’e 4 made the first landing on the far side. In 2024 Chang’e 6 brought far-side soil back to Earth.',
      'Japan’s lunar orbiter Kaguya (2007) was named after the princess. In 2024 Japan’s SLIM made a “pinpoint landing” within about 100 m of its target.',
      'The far side is not the “dark side”. At new moon, the far side is in full sunlight.',
    ],
    quiz: {
      question: 'Why can’t we see the far side of the Moon from Earth?',
      choices: ['It turns exactly once for each trip around Earth', 'The far side is always at night', 'The Moon does not spin'],
      answer: 0,
      explanation: 'Its orbit and its spin take the same time (about 27 days), so the same face always points at Earth. This is called tidal locking.',
    },
  },
}
