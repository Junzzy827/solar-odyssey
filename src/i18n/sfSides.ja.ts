import type { LagrangePoint } from '../components/sf/lagrange'

// data/sfSides.ts の文言（日本語）

export const sfSidesJa = {
  colonyGroup: (n: number, point: LagrangePoint) => `第${n}コロニー群（${point}）`,
  buildingGroupFound: (n: number) => `第${n}コロニー群が見えてきた。2基が完成していて、3基めは骨組みを組み立てているところです。\n（I で航海日誌）`,
  colonyGroupFound: (n: number, point: LagrangePoint, count: number) => `第${n}コロニー群が見えてきた。${point}点に、円筒のコロニーが${count}基ならんでいます。\n（I で航海日誌）`,
}
