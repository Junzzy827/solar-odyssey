import { create } from 'zustand'
import { saveSlot } from './save'
import { useStore } from './store'
import { emitPioneerFx } from './pioneerFx'
import { receive, setTab, togglePanel } from './pioneer'
import { ui } from '../i18n'
import { today } from '../data/pioneer'
import { addRecord, board, checkDelivery, NEW_DELIVERY, rewardFor, ruleOf, starsFor, type ActiveJob, type DeliverySave, type JobDef } from '../data/delivery'

// 配達の仕事の進み具合（決まりは data/delivery.ts）。共通のセーブの 'delivery' に入る。
// 行き先に着いて止まったか・ワープやビームを使ったかは、components/sf/pioneer/DeliveryRunner が見て、ここを呼ぶ

type DeliveryState = DeliverySave & {
  /** 掲示板の日付（日付が変わると仕事が入れ替わる） */
  day: string
  /** 行き先のそばで止まって待っている割合（0〜1。保存しない） */
  handoff: number
  /** 行き先のそばにいるが、速すぎて受け渡しができない（保存しない） */
  tooFast: boolean
}

const slot = saveSlot<DeliverySave>('delivery', NEW_DELIVERY, (v) => (checkDelivery(v) ? v : null))

export const useDelivery = create<DeliveryState>(() => ({ ...slot.load(), day: today(), handoff: 0, tooFast: false }))

function persist() {
  const { v, active, done, history, skipped } = useDelivery.getState()
  slot.save({ v, active, done, history, skipped })
}

const t = () => ui().delivery

/** 積んでからの時間のうち、まだ画面へ渡していない分と、保存してからの分 */
let pending = 0
let sinceSave = 0

/** 掲示板に出ている仕事（日付が変わっていたら、今日の掲示板にする） */
export function jobBoard(): JobDef[] {
  const s = useDelivery.getState()
  const day = today()
  if (s.day !== day) useDelivery.setState({ day })
  return board(day, s)
}

export const activeJob = () => useDelivery.getState().active
/** 次に向かう行き先（仕事がなければ null） */
export const nextStop = (job = activeJob()) => (job ? job.def.stops[job.stop] : null)

/** 仕事を引き受ける（1 件ずつ）。最初の行き先を目標にする */
export function acceptJob(def: JobDef) {
  if (activeJob()) return false
  const job: ActiveJob = { def, stop: 0, elapsed: 0, warped: false, beamed: false }
  useDelivery.setState({ active: job, handoff: 0 })
  persist()
  useStore.getState().setTarget(def.stops[0])
  useStore.getState().showToast(t().accepted(t().kind[def.kind].title))
  return true
}

/** 仕事をやめる（罰はない。掲示板の仕事が入れ替わる） */
export function cancelJob() {
  if (!activeJob()) return
  pending = 0
  useDelivery.setState((s) => ({ active: null, skipped: s.skipped + 1, handoff: 0, tooFast: false }))
  persist()
  useStore.getState().showToast(t().cancelled)
}

/** 掲示板の仕事を入れ替える */
export function refreshBoard() {
  useDelivery.setState((s) => ({ skipped: s.skipped + 1 }))
  persist()
}

/** 積んでからの時間を進める（遊んでいるあいだだけ）。画面へは 0.25 秒おき、保存は 5 秒おき */
export function tickJob(dt: number) {
  const job = activeJob()
  if (!job || job.stop === 0) return
  pending += dt
  if (pending < 0.25) return
  useDelivery.setState({ active: { ...job, elapsed: job.elapsed + pending } })
  sinceSave += pending
  pending = 0
  if (sinceSave > 5) {
    sinceSave = 0
    persist()
  }
}

/** 積んだあとにワープ・ビームを使った（約束を破ったかどうかの記録） */
export function markUsed(what: 'warped' | 'beamed') {
  const job = activeJob()
  if (!job || job.stop === 0 || job[what]) return
  useDelivery.setState({ active: { ...job, [what]: true } })
  persist()
  // 約束を破ったときだけ知らせる（ワープ中は声とかぶるので、短く）
  const rule = what === 'warped' ? 'noWarp' : 'noBeam'
  if (ruleOf(job.def.kind) === rule) useStore.getState().showToast(t().broke[rule])
}

export function setHandoff(handoff: number, tooFast: boolean) {
  const s = useDelivery.getState()
  if (Math.abs(s.handoff - handoff) > 0.02 || (handoff === 0) !== (s.handoff === 0) || s.tooFast !== tooFast) useDelivery.setState({ handoff, tooFast })
}

/** 今の行き先での受け渡しが済んだ：積む・降ろす・届け終える */
export function handoffDone() {
  const live = activeJob()
  if (!live) return
  // まだ画面へ渡していない時間も足してから
  const job = live.stop > 0 ? { ...live, elapsed: live.elapsed + pending } : live
  pending = 0
  const at = job.def.stops[job.stop]
  const last = job.stop === job.def.stops.length - 1
  if (!last) {
    const next = { ...job, stop: job.stop + 1 }
    useDelivery.setState({ active: next, handoff: 0 })
    persist()
    emitPioneerFx({ kind: job.stop === 0 ? 'jobLoad' : 'jobDrop', job: job.def.kind, at })
    useStore.getState().setTarget(next.def.stops[next.stop])
    return
  }
  const { kept, fast, stars } = starsFor(job)
  const reward = rewardFor(job.def, stars)
  receive(reward)
  useDelivery.setState((s) => ({ active: null, done: s.done + 1, history: addRecord(s.history, { at: Date.now(), kind: job.def.kind, stars }), handoff: 0, tooFast: false }))
  persist()
  emitPioneerFx({ kind: 'jobDone', job: job.def.kind, stars, kept, fast, reward, seconds: Math.round(job.elapsed) })
}

/** 端末の「仕事」タブを開く */
export function openJobs() {
  useDelivery.setState({ day: today() })
  setTab('jobs')
  togglePanel(true)
}
