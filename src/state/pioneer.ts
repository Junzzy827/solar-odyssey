import { create } from 'zustand'
import { saveSlot } from './save'
import { emitPioneerFx } from './pioneerFx'
import { useStore } from './store'
import { ui } from '../i18n'
import {
  addToHold,
  canPay,
  checkSave,
  holdCapacity,
  NAME_MAX,
  NEW_SAVE,
  NONE,
  pay,
  plus,
  STAGE_COUNT,
  STAGES,
  total,
  type Amounts,
  type PioneerSave,
  type Resource,
} from '../data/pioneer'

// SF の「開拓」の進み具合（data/pioneer.ts の決まりで動く）。共通のセーブの 'pioneer' に入る。
// active：いま開拓で遊んでいるか（保存しない。毎回ナビの「遊ぶ」から入る。自由探検が基本）
// panel：開拓の端末（倉庫・建設）を開いているか

type PioneerState = PioneerSave & {
  active: boolean
  panel: boolean
  /** 建設の演出中（この段階に進んだ時刻、ミリ秒。演出が終わったら 0） */
  builtAt: number
  /** 完成して名前を付けるところ */
  naming: boolean
  /** 遊び方の案内（初めて始めたとき・？ボタン）を出しているか */
  guide: boolean
  /** いまいる場所（採掘場・木星・天の湊のそば）。「いまやること」の言い方を変える */
  near: Near
}

export type Near = 'field' | 'jupiter' | 'dock' | null

const slot = saveSlot<PioneerSave>('pioneer', NEW_SAVE, (v) => (checkSave(v) ? v : null))

/** 完成したのに名前がまだ（名前を付ける前に閉じた・読み込み直した）なら、また名前を聞く */
const needsName = (s: PioneerSave) => s.stage >= STAGE_COUNT && !s.colonyName

export const usePioneer = create<PioneerState>(() => {
  const saved = slot.load()
  return { ...saved, active: false, panel: false, builtAt: 0, naming: needsName(saved), guide: false, near: null }
})

function persist() {
  const { v, hold, store, stage, colonyName, introSeen } = usePioneer.getState()
  slot.save({ v, hold, store, stage, colonyName, introSeen })
}

const t = () => ui().pioneer

export const capacity = () => holdCapacity(useStore.getState().settings.ship)
export const pioneerActive = () => usePioneer.getState().active
export const nextStage = () => STAGES[usePioneer.getState().stage] ?? null
export const finished = () => usePioneer.getState().stage >= STAGE_COUNT

/** 開拓を始める（SF モードのときだけ）。初めてなら説明を出す */
export function startPioneer() {
  const st = useStore.getState()
  if (st.settings.world !== 'sf') return
  // 初めてなら遊び方の案内。2 回目からは「いまやること」のカードだけ（端末はカードのボタンから）
  usePioneer.setState((p) => ({ active: true, panel: false, naming: needsName(p), guide: !p.introSeen }))
  st.showToast(t().started)
}

/** 開拓をやめる（進み具合は残る。建設中のコロニーは元の見た目に戻る） */
export function stopPioneer() {
  usePioneer.setState({ active: false, panel: false, naming: false, guide: false, near: null })
  useStore.getState().showToast(t().stopped)
}

export function togglePanel(open = !usePioneer.getState().panel) {
  // 案内を開いたまま端末へ行っても、案内は見たことにする（次に始めたとき、また出ないように）
  if (usePioneer.getState().guide) showGuide(false)
  usePioneer.setState({ panel: open })
}

/** 遊び方の案内を開く・閉じる（閉じたら、もう自動では出さない） */
export function showGuide(open: boolean) {
  usePioneer.setState({ guide: open, panel: false })
  if (!open && !usePioneer.getState().introSeen) {
    usePioneer.setState({ introSeen: true })
    persist()
  }
}

export function setNear(near: Near) {
  if (usePioneer.getState().near !== near) usePioneer.setState({ near })
}

/** 積み荷に足す。入らなかったら一度だけ「いっぱい」と知らせる */
let fullWarned = false
export function collect(resource: Resource, amount: number) {
  const s = usePioneer.getState()
  if (!s.active) return 0
  const cap = capacity()
  const { hold, added } = addToHold(s.hold, resource, amount, cap)
  if (added > 0) {
    usePioneer.setState({ hold })
    persist()
    emitPioneerFx({ kind: 'pickup', resource, amount: added })
  }
  if (total(hold) >= cap && !fullWarned) {
    fullWarned = true
    useStore.getState().showToast(t().holdFull)
    emitPioneerFx({ kind: 'full' })
  }
  return added
}

/** 天の湊に着いたとき：積み荷を全部倉庫へ */
export function deliver() {
  const s = usePioneer.getState()
  if (!s.active || total(s.hold) === 0) return false
  const store = plus(s.store, s.hold)
  usePioneer.setState({ store, hold: { ...NONE } })
  fullWarned = false
  persist()
  const next = nextStage()
  const ready = next && canPay(store, next.cost)
  // 納品は画面の演出（数字が増えていくカード）で見せる。読み上げ用に文も渡す
  emitPioneerFx({ kind: 'deliver', amounts: s.hold, ready: !!ready })
  return true
}

/** 倉庫の資源で、次の段階を建てる */
export function build() {
  const s = usePioneer.getState()
  const next = STAGES[s.stage]
  if (!s.active || !next || !canPay(s.store, next.cost)) return false
  const stage = s.stage + 1
  usePioneer.setState({ store: pay(s.store, next.cost), stage, builtAt: Date.now(), naming: stage >= STAGE_COUNT })
  persist()
  useStore.getState().showToast(t().built(next.id))
  return true
}

/** 完成したコロニーの名前を決める（空なら「開拓地 1号」） */
export function nameColony(name: string) {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  usePioneer.setState({ colonyName: clean || t().defaultName, naming: false })
  persist()
  useStore.getState().showToast(t().named(usePioneer.getState().colonyName))
}

/** 最初からやり直す（倉庫・積み荷・段階を消す） */
export function resetPioneer() {
  usePioneer.setState({ ...NEW_SAVE, introSeen: true, builtAt: 0, naming: false, guide: false })
  fullWarned = false
  persist()
}

/** 自動テスト・録画用：資源を足す */
export function debugGive(a: Partial<Amounts>) {
  const s = usePioneer.getState()
  usePioneer.setState({ store: plus(s.store, { ...NONE, ...a }) })
  persist()
}
