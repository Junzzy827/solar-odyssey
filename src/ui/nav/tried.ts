import { create } from 'zustand'
import { saveSlot } from '../../state/save'

// 「遊ぶ」タブの絵のカードを押したことがあるか（「次のおすすめ」と ✓ に使う）。記録は state/saves/playCards.ts で登録

const slot = saveSlot<string[]>('play-tried', [], (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null))

export const useTried = create<{ ids: string[] }>(() => ({ ids: slot.load() }))

/** カードを押した */
export function markTried(id: string) {
  const { ids } = useTried.getState()
  if (ids.includes(id)) return
  const next = [...ids, id]
  slot.save(next)
  useTried.setState({ ids: next })
}

export const wasTried = (id: string) => useTried.getState().ids.includes(id)
