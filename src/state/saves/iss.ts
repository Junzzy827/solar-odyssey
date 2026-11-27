import { registerSave, saveSlot } from '../save'
import { ui } from '../../i18n'

// 宇宙ステーションの一日（state/iss.ts）の記録。あとで「宇宙飛行士の手帳」が読めるように、
// 行ったモジュール（visited）と、やったこと（done：'us_lab:water' のように「モジュール:こと」）を名前の一覧で持つ
export type IssRecord = { v: 1; visited: string[]; done: string[] }

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export const issSlot = saveSlot<IssRecord>('iss', { v: 1, visited: [], done: [] }, (v) => {
  if (!v || typeof v !== 'object') return null
  const r = v as Partial<IssRecord>
  return { v: 1, visited: strings(r.visited), done: strings(r.done) }
})

registerSave({ name: 'iss', label: () => ui().iss.saveLabel })
