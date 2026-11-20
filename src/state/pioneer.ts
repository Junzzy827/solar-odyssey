import { create } from 'zustand'
import { saveSlot } from './save'
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
}

const slot = saveSlot<PioneerSave>('pioneer', NEW_SAVE, (v) => (checkSave(v) ? v : null))

export const usePioneer = create<PioneerState>(() => ({ ...slot.load(), active: false, panel: false, builtAt: 0, naming: false }))

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
  usePioneer.setState({ active: true, panel: true })
  if (!usePioneer.getState().introSeen) {
    usePioneer.setState({ introSeen: true })
    persist()
  }
  st.showToast(t().started)
}

/** 開拓をやめる（進み具合は残る。建設中のコロニーは元の見た目に戻る） */
export function stopPioneer() {
  usePioneer.setState({ active: false, panel: false, naming: false })
  useStore.getState().showToast(t().stopped)
}

export const togglePanel = (open = !usePioneer.getState().panel) => usePioneer.setState({ panel: open })

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
  }
  if (total(hold) >= cap && !fullWarned) {
    fullWarned = true
    useStore.getState().showToast(t().holdFull)
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
  useStore.getState().showToast(t().delivered(s.hold, !!ready))
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
  usePioneer.setState({ ...NEW_SAVE, introSeen: true, builtAt: 0, naming: false })
  fullWarned = false
  persist()
}

/** 自動テスト・録画用：資源を足す */
export function debugGive(a: Partial<Amounts>) {
  const s = usePioneer.getState()
  usePioneer.setState({ store: plus(s.store, { ...NONE, ...a }) })
  persist()
}
