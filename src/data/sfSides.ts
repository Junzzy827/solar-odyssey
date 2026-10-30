import { t } from '../i18n/lang'
import type { Facts, Quiz } from './facts'
import type { LagrangePoint } from '../components/sf/lagrange'

// SF モード：地球と月の5つのラグランジュ点に置いた、番号つきのコロニー群（オリジナルのデザインと名前）。
// 第1コロニー群は L5 の、中へ入れるコロニーのある群（ColonyCluster）。ここには第2〜第7コロニー群を置く。
// L4 と L5 には2つずつ、L1・L2・L3 には1つずつ。第7コロニー群は建設中。
// 第2〜第7の円筒は、第1コロニー群のものより小さい長さ約16km・直径約4km（表示も同じ縮尺で半分の長さ）。

export type ColonyGroup = {
  n: number
  id: string
  point: LagrangePoint
  /** 点からのずらし（表示単位）。radial：地球から外向き、along：月の進む向き、up：月の軌道の面の上 */
  offset: { radial?: number; along?: number; up?: number }
  /** 円筒の数（建設中の骨組みはべつ） */
  count: number
  building?: boolean
}

export const COLONY_GROUPS: ColonyGroup[] = [
  { n: 2, id: 'colony-group-2', point: 'L4', offset: { along: 1.0, up: 0.15 }, count: 3 },
  { n: 3, id: 'colony-group-3', point: 'L2', offset: { radial: 1.1, up: 0.2 }, count: 3 },
  { n: 4, id: 'colony-group-4', point: 'L5', offset: { radial: 2.2, up: -0.2 }, count: 4 },
  { n: 5, id: 'colony-group-5', point: 'L1', offset: { up: 0.15 }, count: 3 },
  { n: 6, id: 'colony-group-6', point: 'L4', offset: { along: -1.0, up: -0.2 }, count: 4 },
  { n: 7, id: 'colony-group-7', point: 'L3', offset: { along: 1.0 }, count: 2, building: true },
]

export const colonyGroupName = (n: number, point: LagrangePoint) => t(`第${n}コロニー群（${point}）`, `Colony Group ${n} (${point})`)

const POINT_JA: Record<LagrangePoint, string> = {
  L1: '地球と月のL1点（地球と月のあいだ）',
  L2: '地球と月のL2点（地球から見て月の向こう側）',
  L3: '地球と月のL3点（地球をはさんで月の反対側）',
  L4: '地球と月のL4点（月の軌道の上で、月より60度前）',
  L5: '地球と月のL5点（月の軌道の上で、月より60度うしろ）',
}
const POINT_EN: Record<LagrangePoint, string> = {
  L1: 'Earth–Moon L1 (between Earth and the Moon)',
  L2: 'Earth–Moon L2 (beyond the Moon, seen from Earth)',
  L3: 'Earth–Moon L3 (on the far side of Earth from the Moon)',
  L4: 'Earth–Moon L4 (on the Moon’s orbit, 60° ahead of the Moon)',
  L5: 'Earth–Moon L5 (on the Moon’s orbit, 60° behind the Moon)',
}

export const colonyGroupFound = (g: ColonyGroup) =>
  g.building
    ? t(
        `第${g.n}コロニー群が見えてきた。2基が完成していて、3基めは骨組みを組み立てているところです。\n（I で航海日誌）`,
        `Colony Group ${g.n} comes into view. Two colonies are finished, and the frame of a third is being put together.\n(I for the ship’s log)`,
      )
    : t(
        `第${g.n}コロニー群が見えてきた。${g.point}点に、円筒のコロニーが${g.count}基ならんでいます。\n（I で航海日誌）`,
        `Colony Group ${g.n} comes into view. ${g.count} cylinder colonies float together at ${g.point}.\n(I for the ship’s log)`,
      )

// ---- 航海日誌 ----

const stableQuiz: Quiz = {
  question: '地球と月の5つのラグランジュ点のうち、物が置かれたまま安定していられるのは？',
  choices: ['L1とL2', 'L4とL5', '5つ全部'],
  answer: 1,
  explanation: 'L4とL5は、少しずれても元の場所のまわりを回るように戻ってきます。L1・L2・L3は少しずれると離れていくので、エンジンで位置を直しつづけます。',
}
const stableQuizEn: Quiz = {
  question: 'Of the five Earth–Moon Lagrange points, which ones can hold an object in place stably?',
  choices: ['L1 and L2', 'L4 and L5', 'All five'],
  answer: 1,
  explanation: 'At L4 and L5, something that drifts a little keeps circling back around the point. At L1, L2 and L3 it drifts away, so spacecraft there keep correcting their position with thrusters.',
}
const unstableQuiz: Quiz = {
  question: 'L1・L2・L3点にいる本物の探査機が、ときどきエンジンをふかすのはなぜ？',
  choices: ['少しずれると点から離れていくので、位置を直すため', '空気の抵抗で遅くなるため', '太陽から遠ざかって寒くなるため'],
  answer: 0,
  explanation: 'L1・L2・L3は、丘のてっぺんに置いたボールのような場所です。少しずれると転がり落ちるように離れるので、小さな噴射で位置を保ちます（ステーションキーピング）。',
}
const unstableQuizEn: Quiz = {
  question: 'Why do real spacecraft at L1, L2 and L3 fire their thrusters now and then?',
  choices: ['A small drift grows, so they correct their position', 'Air drag slows them down', 'They get cold far from the Sun'],
  answer: 0,
  explanation: 'L1, L2 and L3 are like a ball balanced on top of a hill: a small drift grows. Small burns keep the spacecraft in place (station-keeping).',
}
const relayQuiz: Quiz = {
  question: '2019年、月の裏側に初めて着陸した「嫦娥4号」と地球のあいだで、通信を中継した衛星はどこにいた？',
  choices: ['地球と月のL2点のまわり', '地球の静止軌道', '火星のまわり'],
  answer: 0,
  explanation: '月の裏側は地球から見えないので、月の向こう側のL2点のまわりを回る中継衛星「鵲橋（じゃっきょう）」が電波を中継しました。',
}
const relayQuizEn: Quiz = {
  question: 'In 2019, Chang’e 4 made the first landing on the far side of the Moon. Where was the satellite that relayed its signals to Earth?',
  choices: ['Around Earth–Moon L2', 'In geostationary orbit', 'Around Mars'],
  answer: 0,
  explanation: 'The far side can’t see Earth, so the relay satellite Queqiao, circling near L2 beyond the Moon, passed the signals along.',
}

function facts(g: ColonyGroup): Facts {
  const lastNote = g.building
    ? '3基めはまだ骨組みだけです。完成したら、ほかの2基と同じように外板と鏡を取りつけます。'
    : g.point === 'L4' || g.point === 'L5'
      ? 'L4とL5には、コロニー群が2つずつあります。'
      : 'この点はずれやすい場所なので、群ごと小さなエンジンで位置を直しつづけています。'
  return {
    rows: [
      ['場所', POINT_JA[g.point]],
      ['顔ぶれ', g.building ? '円筒型2基と、建設中の骨組み1基' : `円筒型${g.count}基`],
      ['大きさ', '1基の長さ約16km・直径約4km（第1コロニー群の円筒の半分）'],
      ['回転', '約1分半で1回転（内側の地面で1G）'],
    ],
    fiction: true,
    notes: [
      '地球と月の5つのラグランジュ点に、第1から第7までのコロニー群があります。L4とL5には2つずつ、L1・L2・L3には1つずつです。',
      '中へ入れるのは、L5の第1コロニー群の1号基だけです。',
      lastNote,
    ],
    real: [
      'ラグランジュ点は、2つの天体の引力と回る動きがつり合って、小さな物が同じ並びのまま一緒に回れる場所です。地球と月のあいだにも5つあります。',
      'L4とL5は安定していて、少しずれても戻ってきます。L1・L2・L3は不安定で、本物の探査機は小さな噴射で位置を直しつづけます。',
      '地球と月のL4・L5点には、ちりの雲（コルディレフスキー雲）があるという報告があります（1961年に報告、2018年にハンガリーの研究チームが観測で裏づけ）。まだ議論が続いています。',
      '2018年に中国の中継衛星「鵲橋」が地球と月のL2点のまわりへ行き、月の裏側に着陸した嫦娥4号の通信を中継しました。',
      '太陽と地球のL1点ではSOHO（1995年〜）が太陽を、DSCOVR（2015年〜）が地球の昼の面を見ています。L2点ではジェイムズ・ウェッブ宇宙望遠鏡（2021年打ち上げ）が観測しています。',
    ],
    quiz: g.point === 'L2' ? relayQuiz : g.point === 'L4' || g.point === 'L5' ? stableQuiz : unstableQuiz,
  }
}

function factsEn(g: ColonyGroup): Facts {
  const lastNote = g.building
    ? 'The third colony is still only a frame. When it is finished it will get hull plates and mirrors like the other two.'
    : g.point === 'L4' || g.point === 'L5'
      ? 'L4 and L5 each hold two colony groups.'
      : 'Things drift away from this point easily, so the whole group keeps correcting its position with small engines.'
  return {
    rows: [
      ['Where', POINT_EN[g.point]],
      ['Members', g.building ? 'Two cylinder colonies and the frame of a third' : `${g.count} cylinder colonies`],
      ['Size', 'Each about 16 km long and 4 km across (half the length of the Group 1 cylinders)'],
      ['Spin', 'Once every 1.5 minutes or so (1 g on the inner ground)'],
    ],
    fiction: true,
    notes: [
      'Colony Groups 1 to 7 are spread over the five Earth–Moon Lagrange points: two each at L4 and L5, one each at L1, L2 and L3.',
      'The only colony you can fly inside is Colony 1 of Group 1, at L5.',
      lastNote,
    ],
    real: [
      'Lagrange points are places where the pull of two bodies and the motion of orbiting balance out, so a small object can travel along with them in the same arrangement. The Earth–Moon pair has five.',
      'L4 and L5 are stable: something that drifts a little comes back. L1, L2 and L3 are unstable, so real spacecraft there keep correcting their position with small burns.',
      'Clouds of dust (the Kordylewski clouds) have been reported at Earth–Moon L4 and L5: first in 1961, with supporting observations by a Hungarian team in 2018. Scientists are still debating them.',
      'In 2018 China’s relay satellite Queqiao went to Earth–Moon L2 to pass along signals from Chang’e 4, which landed on the far side of the Moon.',
      'At Sun–Earth L1, SOHO (since 1995) watches the Sun and DSCOVR (since 2015) watches Earth’s day side. At Sun–Earth L2, the James Webb Space Telescope (launched 2021) observes the universe.',
    ],
    quiz: g.point === 'L2' ? relayQuizEn : g.point === 'L4' || g.point === 'L5' ? stableQuizEn : unstableQuizEn,
  }
}

export const SIDE_FACTS: Record<string, Facts> = Object.fromEntries(COLONY_GROUPS.map((g) => [g.id, facts(g)]))
export const SIDE_FACTS_EN: Record<string, Facts> = Object.fromEntries(COLONY_GROUPS.map((g) => [g.id, factsEn(g)]))
