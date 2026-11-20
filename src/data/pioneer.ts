// SF の「開拓」：資源を集めて、L5 の建設中のコロニーを完成させる遊び（数と決まりだけ。動きは state/pioneer.ts）。
// 資源は 3 つ：金属（小惑星帯の石質・金属の岩）、氷（水を含む炭素質の岩）、ガス（木星の雲のすぐ上をかすめて集める）。
// 1 回の往復は約 3 分。積める量 60 の船で約 8 往復、25 分ほどで 1 基目が完成する（設計メモ 2026-11-20）。

import type { RockType } from '../state/registry'

/** 小惑星帯の採掘場の目印（ワープの行き先として天体に登録する） */
export const FIELD_ID = 'pioneer-field'

export type Resource = 'metal' | 'ice' | 'gas'
export const RESOURCES: readonly Resource[] = ['metal', 'ice', 'gas']

export type Amounts = Record<Resource, number>
export const NONE: Amounts = { metal: 0, ice: 0, gas: 0 }

/** 建設の段階（順に進む）。cost を倉庫から払うと 1 段進む */
export type StageId = 'frame' | 'hull' | 'mirror' | 'spin' | 'air'
export const STAGES: readonly { id: StageId; cost: Amounts }[] = [
  { id: 'frame', cost: { metal: 60, ice: 0, gas: 0 } },
  { id: 'hull', cost: { metal: 90, ice: 0, gas: 0 } },
  { id: 'mirror', cost: { metal: 50, ice: 0, gas: 30 } },
  { id: 'spin', cost: { metal: 0, ice: 0, gas: 60 } },
  { id: 'air', cost: { metal: 40, ice: 120, gas: 0 } },
]
export const STAGE_COUNT = STAGES.length

/** 船ごとの積める量（全部の資源の合計）。輸送船ハコブネと母艦アルカディアは多く積める */
const HOLD_BY_SHIP: Record<string, number> = { hakobune: 150, arcadia: 150 }
export const DEFAULT_HOLD = 60
export const holdCapacity = (shipId: string) => HOLD_BY_SHIP[shipId] ?? DEFAULT_HOLD

/**
 * 砕いた岩 1 個から出る資源。size は岩の大きさ（表示単位、0.04〜0.44）。
 * 炭素質は水を含む鉱物が多いので氷、石質は少しの金属、金属の岩はたくさんの金属
 */
export function rockYield(type: RockType, size: number): { resource: Resource; amount: number } {
  const big = 1 + Math.min(Math.max(size, 0), 0.5) * 4
  if (type === 0) return { resource: 'ice', amount: Math.round(3 * big) }
  if (type === 1) return { resource: 'metal', amount: Math.round(3 * big) }
  return { resource: 'metal', amount: Math.round(8 * big) }
}

/** ガス集め：雲の上（1気圧）からの高さが、半径に対してこの範囲のあいだだけたまる */
export const GAS_BAND = { low: -0.05, high: 0.03 }
/** これより深いと熱くて集められない（案内を出す） */
export const GAS_TOO_DEEP = -0.05
/** 1 秒にたまる量（最高速度の GAS_MIN_SPEED 倍以上で飛んでいるとき） */
export const GAS_RATE = 5
export const GAS_MIN_SPEED = 0.05

export const total = (a: Amounts) => a.metal + a.ice + a.gas

/** 積み荷に足す（積める量を超える分は入らない）。入った量を返す */
export function addToHold(hold: Amounts, resource: Resource, amount: number, capacity: number): { hold: Amounts; added: number } {
  const room = Math.max(0, capacity - total(hold))
  const added = Math.max(0, Math.min(room, amount))
  return { hold: { ...hold, [resource]: hold[resource] + added }, added }
}

export const canPay = (store: Amounts, cost: Amounts) => RESOURCES.every((r) => store[r] >= cost[r])

/** 次の段階に足りない量（足りていれば全部 0） */
export const shortfall = (store: Amounts, cost: Amounts): Amounts => ({
  metal: Math.max(0, cost.metal - store.metal),
  ice: Math.max(0, cost.ice - store.ice),
  gas: Math.max(0, cost.gas - store.gas),
})

export const pay = (store: Amounts, cost: Amounts): Amounts => ({ metal: store.metal - cost.metal, ice: store.ice - cost.ice, gas: store.gas - cost.gas })
export const plus = (a: Amounts, b: Amounts): Amounts => ({ metal: a.metal + b.metal, ice: a.ice + b.ice, gas: a.gas + b.gas })

/** 保存する形 */
export type PioneerSave = {
  v: 1
  /** いま積んでいるもの */
  hold: Amounts
  /** 天の湊の倉庫 */
  store: Amounts
  /** 終えた段階の数（0〜STAGE_COUNT） */
  stage: number
  /** 完成したコロニーの名前（空なら未定） */
  colonyName: string
  /** 初めての説明を見たか */
  introSeen: boolean
}

export const NEW_SAVE: PioneerSave = { v: 1, hold: { ...NONE }, store: { ...NONE }, stage: 0, colonyName: '', introSeen: false }

const isAmounts = (a: unknown): a is Amounts =>
  !!a && typeof a === 'object' && RESOURCES.every((r) => Number.isFinite((a as Amounts)[r]) && (a as Amounts)[r] >= 0)

/** 読んだセーブが正しい形か */
export function checkSave(v: unknown): v is PioneerSave {
  const s = v as PioneerSave
  return (
    !!s &&
    s.v === 1 &&
    isAmounts(s.hold) &&
    isAmounts(s.store) &&
    Number.isInteger(s.stage) &&
    s.stage >= 0 &&
    s.stage <= STAGE_COUNT &&
    typeof s.colonyName === 'string' &&
    typeof s.introSeen === 'boolean'
  )
}

/** コロニーの名前の長さの上限（銘板に入る長さ） */
export const NAME_MAX = 24

/** いまやること（画面の「いまやること」カードに出す 1 つ） */
export type Goal =
  | { kind: 'name' }
  | { kind: 'done' }
  | { kind: 'build' }
  | { kind: 'deliver'; full: boolean }
  | { kind: 'mine'; resource: 'metal' | 'ice' }
  | { kind: 'gas' }

/**
 * 進み具合から、次にやることを 1 つ決める。
 * 建てられる → 建てる。積み荷がいっぱい、または積み荷で足りる → 納める。
 * まだ足りない → いちばん多く足りない資源を集めに行く（ガスは木星、金属と氷は採掘場）
 */
export function goal(s: Pick<PioneerSave, 'hold' | 'store' | 'stage' | 'colonyName'>, capacity: number): Goal {
  const next = STAGES[s.stage]
  if (!next) return s.colonyName ? { kind: 'done' } : { kind: 'name' }
  if (canPay(s.store, next.cost)) return { kind: 'build' }
  if (total(s.hold) >= capacity) return { kind: 'deliver', full: true }
  const need = shortfall(plus(s.store, s.hold), next.cost)
  if (total(need) === 0) return { kind: 'deliver', full: false }
  let pick: Resource = 'metal'
  for (const r of RESOURCES) if (need[r] > need[pick]) pick = r
  return pick === 'gas' ? { kind: 'gas' } : { kind: 'mine', resource: pick }
}

/** 資源ごとの、岩の種類（0 炭素質 1 石質 2 金属）から出るもの。画面の輪の色分けに使う */
export const rockResource = (type: RockType): Resource => (type === 0 ? 'ice' : 'metal')

/** 砕ける岩に重ねる輪の数（画面の .pio-ring の数） */
export const RING_COUNT = 8
