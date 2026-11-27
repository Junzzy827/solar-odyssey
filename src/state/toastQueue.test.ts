import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindToasts, dismissToast, holdToasts, queueToast, resetToasts, toastMs, waitingToasts, type ToastItem } from './toastQueue'

describe('toast queue', () => {
  let shown: (ToastItem | null)[]
  beforeEach(() => {
    vi.useFakeTimers()
    resetToasts()
    shown = []
    bindToasts((t) => shown.push(t), false)
  })
  afterEach(() => vi.useRealTimers())

  const texts = () => shown.filter((t): t is ToastItem => t !== null).map((t) => t.text)

  it('shows one at a time, in order', () => {
    queueToast('a')
    queueToast('b')
    expect(texts()).toEqual(['a'])
    vi.advanceTimersByTime(toastMs('a', 0) + 400)
    expect(texts()).toEqual(['a', 'b'])
    expect(shown[shown.length - 2]).toBeNull()
  })

  it('drops a text that is already shown or waiting', () => {
    queueToast('a')
    queueToast('a')
    queueToast('b')
    queueToast('b')
    expect(waitingToasts()).toEqual(['b'])
  })

  it('waits while held and puts the shown one back first', () => {
    queueToast('a')
    queueToast('b')
    holdToasts('arrival', true)
    expect(shown[shown.length - 1]).toBeNull()
    expect(waitingToasts()).toEqual(['a', 'b'])
    vi.advanceTimersByTime(20000)
    expect(texts()).toEqual(['a'])
    holdToasts('arrival', false)
    vi.advanceTimersByTime(400)
    expect(texts()).toEqual(['a', 'a'])
  })

  it('moves on when dismissed', () => {
    queueToast('a')
    queueToast('b')
    dismissToast()
    vi.advanceTimersByTime(400)
    expect(texts()).toEqual(['a', 'b'])
  })

  it('keeps long texts up longer, shorter when more are waiting', () => {
    expect(toastMs('x'.repeat(100), 0, false)).toBeGreaterThan(toastMs('x', 0, false))
    expect(toastMs('x'.repeat(100), 2, false)).toBeLessThan(toastMs('x'.repeat(100), 0, false))
    expect(toastMs('x'.repeat(100), 0, true)).toBe(3800)
  })
})
