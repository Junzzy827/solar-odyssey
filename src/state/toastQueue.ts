// お知らせ（showToast）の順番待ち。いくつも同時に来ても重ねず、1 つずつ順に出す。
// 同じ文はまとめて 1 回だけ。「着いた」のカードのように大事な絵が出ているあいだは holdToasts で待たせる。
// store.ts の showToast がここに入れ、ここが store の toast を出し入れする（bindToasts）

export type ToastItem = { id: number; text: string }

/** 待たせておく数の上限（あふれたら古いものから捨てる） */
const MAX_WAITING = 5
/** 1 つ消えてから次を出すまで（ミリ秒）。続けて出ても、別のお知らせだと分かるように */
const GAP_MS = 350

let show: (t: ToastItem | null) => void = () => {}
let touch = false
const waiting: string[] = []
let current: ToastItem | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let nextId = 1
const holds = new Set<string>()

/** store の toast を出し入れする関数をつなぐ（store.ts が 1 回だけ呼ぶ）。touchDevice：スマホ・タブレット（短い 1 行だけ出す） */
export function bindToasts(fn: (t: ToastItem | null) => void, touchDevice: boolean) {
  show = fn
  touch = touchDevice
}

/** 出しておく時間（ミリ秒）。長い文は読み終わるまで長め。後ろに待っているものがあれば少し短く */
export function toastMs(text: string, more: number, touchDevice = touch) {
  // スマホは上に 1 行だけ出して、全文は「お知らせ」に残る
  if (touchDevice) return 3800
  const read = Math.min(12000, Math.max(4500, text.length * 90))
  return more > 0 ? Math.max(3500, Math.round(read * 0.6)) : read
}

/** お知らせを順番待ちに入れる */
export function queueToast(text: string) {
  if (current?.text === text || waiting.includes(text)) return
  waiting.push(text)
  if (waiting.length > MAX_WAITING) waiting.shift()
  pump()
}

function pump() {
  if (current || holds.size > 0 || waiting.length === 0) return
  const text = waiting.shift()!
  current = { id: nextId++, text }
  show(current)
  timer = setTimeout(finish, toastMs(text, waiting.length))
}

function finish() {
  clearTimeout(timer)
  if (!current) return
  current = null
  show(null)
  setTimeout(pump, GAP_MS)
}

/** いま出ているお知らせを消して次へ（押したとき） */
export const dismissToast = () => finish()

/**
 * key のあいだ、お知らせを待たせる（到着のカードが出ているときなど）。出ていたものは消して、列の先頭に戻す。
 * on=false で解く。ほかの key がまだあれば待ったまま
 */
export function holdToasts(key: string, on: boolean) {
  if (on) {
    if (holds.has(key)) return
    holds.add(key)
    if (current) {
      clearTimeout(timer)
      waiting.unshift(current.text)
      current = null
      show(null)
    }
  } else if (holds.delete(key)) setTimeout(pump, GAP_MS)
}

/** テスト用：中身を空にする */
export function resetToasts() {
  clearTimeout(timer)
  waiting.length = 0
  current = null
  holds.clear()
}

/** テスト用：待っている文 */
export const waitingToasts = (): readonly string[] => waiting
