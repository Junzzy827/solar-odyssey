import { useEffect } from 'react'
import { useStore } from '../state/store'
import { bodyInfo } from '../state/flight'

const PAD = 3
const EVERY_MS = 150

/**
 * 天体の名札が重なったら、だいじなものだけ残して、残りは隠す（近づいて広がれば、また出てくる）。
 * 順番：目標にしているもの → 地球 → ほかの惑星 → SF の構造物や望遠鏡 → 衛星。
 * 隠した数は、重なっていた名札のうしろに「+3」のように出す
 */
export function LabelDeclutter() {
  useEffect(() => {
    let last = 0
    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < EVERY_MS) return
      last = now
      const id = useStore.getState().targetId
      const target = id ? (bodyInfo(id)?.name ?? null) : null
      // 目標の印（紫の丸と名前）が画面に出ているなら、その天体のふつうの名札は出さない（同じ名前が2つ並ぶので）
      const marker = document.getElementById('target-marker')
      const markerShown = !!marker && marker.style.display === 'block' && marker.dataset.offscreen !== 'true'
      const items: { el: HTMLElement; rect: DOMRect; rank: number; more: number }[] = []
      document.querySelectorAll<HTMLElement>('.label').forEach((el) => {
        const span = el.querySelector('span')
        const rect = span?.getBoundingClientRect()
        if (!span || !rect || rect.width === 0) {
          el.classList.remove('label-hidden')
          el.removeAttribute('data-more')
          return
        }
        const name = span.textContent ?? ''
        if (markerShown && name === target) {
          el.classList.add('label-hidden')
          el.removeAttribute('data-more')
          return
        }
        const rank = name === target ? 0 : el.classList.contains('home-label') ? 0.5 : el.classList.contains('planet-label') ? 1 : el.classList.contains('moon-label') ? 3 : 2
        items.push({ el, rect, rank, more: 0 })
      })
      items.sort((a, b) => a.rank - b.rank)
      const kept: typeof items = []
      for (const it of items) {
        const r = it.rect
        const hits = kept.filter((k) => r.left < k.rect.right + PAD && r.right > k.rect.left - PAD && r.top < k.rect.bottom + PAD && r.bottom > k.rect.top - PAD)
        if (hits.length) {
          // 数は、いちばん近くに残った名札に足す
          const cx = (r.left + r.right) / 2
          const cy = (r.top + r.bottom) / 2
          const near = (k: (typeof kept)[number]) => Math.hypot((k.rect.left + k.rect.right) / 2 - cx, (k.rect.top + k.rect.bottom) / 2 - cy)
          hits.reduce((a, b) => (near(b) < near(a) ? b : a)).more++
          it.el.classList.add('label-hidden')
          it.el.removeAttribute('data-more')
        } else {
          kept.push(it)
          it.el.classList.remove('label-hidden')
        }
      }
      for (const k of kept) {
        if (k.more) k.el.setAttribute('data-more', `+${k.more}`)
        else k.el.removeAttribute('data-more')
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return null
}
