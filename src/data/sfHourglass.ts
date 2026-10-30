import { t } from '../i18n/lang'
import type { Facts } from './facts'

// SF モードの、砂時計型コロニー群（オリジナルのデザイン）。
// 2つの大きなお椀を、細いくびれ（宇宙港）で背中合わせにつないだ形のコロニーが、太陽と地球の L5 点に輪になって浮かぶ。

export const HOURGLASS_ID = 'hourglass'
export const hourglassName = () => t('砂時計型コロニー群', 'Hourglass Colonies')

export const HOURGLASS_TEXT = {
  found: () =>
    t(
      '砂時計型コロニー群が見えてきた。くびれの宇宙港から、お椀の内側に広がる畑と海と街へ降りていきます。\n（I で航海日誌）',
      'The Hourglass Colonies come into view. From the spaceport at each narrow waist, people travel down into the fields, seas and towns that line the inside of the bowls.\n(I for the ship’s log)',
    ),
}

export const HOURGLASS_FACTS: Record<string, Facts> = {
  [HOURGLASS_ID]: {
    rows: [
      ['大きさ', '1基の長さ 約40km、いちばん広いところの直径 約16km'],
      ['数', '10基が輪になって並ぶ'],
      ['回転', '約3分で1回転（いちばん外側の地面で、地球と同じ重さを感じる）'],
      ['場所', '太陽と地球のL5点（地球と同じ軌道の上で、地球より60度うしろ）'],
    ],
    fiction: true,
    notes: [
      '2つのお椀を、細いくびれで背中合わせにつないだ形です。くびれは回転の軸に近く、重さをほとんど感じないので、宇宙船が出入りする宇宙港になっています。',
      'お椀の内側には、畑・海・街の帯と、日の光を入れる透明な窓の帯が交互に並んでいます。外へ行くほど回る速さが大きく、重さも強く感じます。',
      '真ん中を通る細い柱は、2つのお椀を結ぶエレベーターと、窓の帯に光を配る鏡の支えです。',
    ],
    real: [
      '宇宙に住むための大きな回る家は、1929年のバナール球（球の形）、1975年のNASAのスタンフォード・トーラス（ドーナツ形）、1976年のオニールの「島3号」（長い円筒形）などが考えられてきました。',
      '回転でつくる重さ（遠心力）は「回る速さの2乗 × 半径」で決まります。半径8kmなら約3分で1回転すれば、地球と同じ重さ（9.8m/s²）になります。',
      '太陽と地球のL4・L5点は、太陽と地球の引力のつり合いで、置いたものが自然にとどまりやすい場所です。地球の「トロヤ群小惑星」として、2010 TK7（2011年発見）と2020 XL5（2021年発見）が見つかっています。',
      'NASAの太陽観測衛星STEREOの2機は、2009年ごろに地球のL4・L5のあたりを通りながら、太陽を横から観測しました。',
    ],
    quiz: {
      question: '回るコロニーの中で、地面に立つときの重さを生むのは何？',
      choices: ['回転による遠心力', 'コロニーの中の空気の重さ', '地球の引力'],
      answer: 0,
      explanation: 'コロニーが回ると、中のものは外へ押しつけられます。この遠心力が、外側の地面で重さの代わりになります。半径が大きいほど、ゆっくり回っても同じ重さになります。',
    },
  },
}

export const HOURGLASS_FACTS_EN: Record<string, Facts> = {
  [HOURGLASS_ID]: {
    rows: [
      ['Size', 'Each about 40 km long and about 16 km across at the widest'],
      ['Number', '10, arranged in a ring'],
      ['Spin', 'About one turn every 3 minutes (Earth-like weight on the outermost ground)'],
      ['Where', 'Sun–Earth L5 point (on Earth’s orbit, 60° behind Earth)'],
    ],
    fiction: true,
    notes: [
      'Two bowls joined back to back at a narrow waist. The waist is close to the spin axis, where you feel almost no weight, so it is the spaceport where ships come and go.',
      'Inside the bowls, bands of fields, seas and towns alternate with clear window bands that let in sunlight. The farther out you go, the faster the ground moves and the heavier you feel.',
      'The thin column through the middle carries an elevator between the two bowls and holds the mirrors that send light into the window bands.',
    ],
    real: [
      'People have long sketched big spinning homes in space: the Bernal sphere (1929), NASA’s Stanford torus (1975, a ring) and Gerard O’Neill’s “Island Three” (1976, long cylinders).',
      'Spin gravity equals (spin rate)² × radius. With a radius of 8 km, turning once about every 3 minutes gives Earth’s gravity (9.8 m/s²).',
      'At the Sun–Earth L4 and L5 points, the pulls of the Sun and Earth balance so that objects tend to stay there. Two Earth “Trojan asteroids” have been found: 2010 TK7 (found 2011) and 2020 XL5 (found 2021).',
      'NASA’s twin STEREO spacecraft passed near Earth’s L4 and L5 regions around 2009, watching the Sun from the side.',
    ],
    quiz: {
      question: 'Inside a spinning colony, what gives you weight when you stand on the ground?',
      choices: ['The outward push from the spin', 'The weight of the air inside', 'Earth’s gravity'],
      answer: 0,
      explanation: 'As the colony spins, everything inside is pressed outward. That push works like gravity on the outer ground. The bigger the radius, the slower it can spin for the same weight.',
    },
  },
}
