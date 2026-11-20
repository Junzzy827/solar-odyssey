// 開拓（state/pioneer.ts・ui/pioneer/PioneerPanel.tsx・components/sf/pioneer）の文言（日本語）

import type { Amounts, Resource, StageId } from '../data/pioneer'

const RES: Record<Resource, string> = { metal: '金属', ice: '氷', gas: 'ガス' }
const list = (a: Amounts) =>
  (Object.keys(RES) as Resource[])
    .filter((r) => a[r] > 0)
    .map((r) => `${RES[r]} ${a[r]}`)
    .join('、')

export const pioneerJa = {
  navButton: '開拓',
  saveLabel: '開拓（倉庫と建設の段階）',
  title: '開拓',
  terminal: '開拓の端末',
  resource: RES,
  hold: '積み荷',
  store: '天の湊の倉庫',
  open: '端末',
  close: '閉じる',
  quit: '開拓をやめる',
  intro: [
    '小惑星帯の岩をチャージビームで砕くと、金属と氷のかけらが船に集まります。',
    '木星の雲のすぐ上をかすめて飛ぶと、ガスがたまります。',
    '天の湊に戻ると倉庫に納まり、L5 の建設中のコロニーを 1 段ずつ建てられます。',
  ],
  goField: '小惑星帯の採掘場へ',
  goJupiter: '木星へ（ガス）',
  goDock: '天の湊へ（納める）',
  goSite: '建設中のコロニーを見に行く',
  nextStage: (name: string) => `次の段階：${name}`,
  needLine: (list: string) => `必要なもの：${list}`,
  short: (a: string) => `あと ${a}`,
  ready: '建てられます',
  build: '建設する',
  stageName: {
    frame: '骨組み',
    hull: '外板',
    mirror: '窓と鏡',
    spin: '回転を始める',
    air: '空気と水',
  } satisfies Record<StageId, string>,
  stageScience: {
    frame: '現実の科学では：大きな構造物は宇宙で組み立てます。国際宇宙ステーションも、部品を何十回も運んでつなぎました。',
    hull: '現実の科学では：外板は空気を閉じこめ、宇宙の放射線をさえぎります。',
    mirror: '現実の科学では：オニールの案では、外の鏡で太陽の光を窓から入れ、鏡の角度で昼と夜を作ります。',
    spin: '現実の科学では：回ると外向きの力が重力の代わりになります。半径 3 km なら、約 2 分で 1 周すると地上と同じ 1g です。',
    air: '現実の科学では：氷を溶かして水にし、電気で分けると、吸う酸素ができます。',
  } satisfies Record<StageId, string>,
  stages: (done: number, all: number) => `段階 ${done}/${all}`,
  complete: '完成！',
  completeText: 'コロニーが完成しました。名前を付けてください。',
  namePlaceholder: '開拓地 1号',
  nameOk: '決める',
  defaultName: '開拓地 1号',
  fieldName: '小惑星帯の採掘場',
  resourceScience: {
    metal: '現実の科学では：金属の多い小惑星（プシケなど）があり、探査機が向かっています。',
    ice: '現実の科学では：炭素質の小惑星は、水を含む鉱物を多く持っています。',
    gas: '現実の科学では：木星はほとんどが水素とヘリウムです。',
  } satisfies Record<Resource, string>,
  reset: '最初からやり直す',
  resetConfirm: '倉庫と建設の段階を消して、最初からやり直しますか？',
  started: '開拓を始めました。端末から行き先を選べます',
  stopped: '開拓をやめました。続きは、また「遊ぶ」の「開拓」から',
  holdFull: '積み荷がいっぱいです。天の湊へ戻って納めましょう',
  delivered: (a: Amounts, ready: boolean) => `倉庫に納めました：${list(a)}${ready ? '。次の段階を建てられます（端末から）' : ''}`,
  built: (id: StageId) => `建設が進みました：${pioneerJa.stageName[id]}`,
  named: (name: string) => `コロニーの名前は「${name}」。港に銘板が付きました`,
  gasSkimming: '雲の上をかすめています。ガスがたまっています',
  gasTooDeep: '深すぎて熱く、ガスを集められません。少し上がりましょう',
  sfOnly: 'SF モードで遊べます',
  doneBadge: '完成',
}
