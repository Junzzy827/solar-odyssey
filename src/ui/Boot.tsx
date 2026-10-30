import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { create } from 'zustand'
import { useStore } from '../state/store'

/** 太陽系が描けるようになったか（最初のテクスチャや模型が届いて、何コマか描いたら） */
const useBoot = create<{ ready: boolean }>(() => ({ ready: false }))

/** キャンバスの中に置く。読み込み待ちのあいだは描かれないので、コマが進んだら準備完了 */
export function BootFrames() {
  const frames = useRef(0)
  useFrame(() => {
    if (useBoot.getState().ready) return
    if (++frames.current >= 3) useBoot.setState({ ready: true })
  })
  return null
}

/** index.html の読み込み中の画面に、進み具合を出す。言語を選ぶ画面のあいだは下に細く、準備ができたら消す */
export function BootScreen() {
  const { progress, total, active } = useProgress()
  const ready = useBoot((b) => b.ready) && !active
  const choosing = useStore((s) => s.settings.lang === null)

  useEffect(() => {
    const el = document.getElementById('boot')
    if (!el) return
    el.classList.toggle('compact', choosing)
    const bar = el.querySelector<HTMLElement>('.boot-bar i')
    const text = el.querySelector<HTMLElement>('.boot-text')
    if (total > 0 && bar) {
      el.classList.add('measured')
      bar.style.width = `${Math.max(4, Math.round(progress))}%`
    }
    if (text) text.textContent = total > 0 ? `読み込み中… / Loading… ${Math.round(progress)}%` : '読み込み中… / Loading…'
    if (ready) {
      el.classList.add('done')
      const timer = setTimeout(() => el.remove(), 700)
      return () => clearTimeout(timer)
    }
  }, [progress, total, ready, choosing])
  return null
}
