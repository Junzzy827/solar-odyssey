import { audio, output, volume } from './sfx'
import type { Resource } from '../data/pioneer'

// 開拓の効果音（Web Audio で作る。録音した音は使わない）。音の大きさは設定に従う
// - 拾う：資源ごとの高さの短い「ポン」。続けて拾うと少しずつ高くなる
// - いっぱい：低い 2 音
// - ガス：雲をかすめているあいだの、やわらかい風の音
// - 納品：上がっていく 4 音のチャイム
// - いまやることが変わった：小さな 2 音

let master: GainNode | null = null
function out(c: AudioContext) {
  if (!master) {
    master = c.createGain()
    master.connect(output(c))
  }
  master.gain.value = volume()
  return master
}

function tone(c: AudioContext, freq: number, at: number, seconds: number, peak: number, type: OscillatorType = 'sine') {
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
  osc.connect(g).connect(out(c))
  osc.start(at)
  osc.stop(at + seconds + 0.02)
}

const BASE: Record<Resource, number> = { metal: 523.25, ice: 698.46, gas: 440 }
let streak = 0
let lastPickup = 0

/** 資源を拾った */
export function playPickup(resource: Resource) {
  const c = audio()
  if (!c || volume() === 0) return
  const now = c.currentTime
  if (now - lastPickup < 0.06) return // 同じ瞬間にいくつも拾っても 1 回
  streak = now - lastPickup < 1.2 ? Math.min(streak + 1, 7) : 0
  lastPickup = now
  const f = BASE[resource] * 2 ** (([0, 2, 4, 5, 7, 9, 11, 12][streak] ?? 12) / 12)
  tone(c, f, now, 0.16, 0.09, 'triangle')
  tone(c, f * 2, now, 0.08, 0.03)
}

/** 積み荷がいっぱい */
export function playFull() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  tone(c, 330, now, 0.18, 0.1, 'square')
  tone(c, 247, now + 0.2, 0.26, 0.1, 'square')
}

/** 納品のチャイム */
export function playDeliver() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone(c, f, now + i * 0.11, 0.6, 0.08, 'triangle')
    tone(c, f * 3, now + i * 0.11, 0.25, 0.015)
  })
}

/** いまやることが変わった */
export function playGoal() {
  const c = audio()
  if (!c) return
  const now = c.currentTime
  tone(c, 880, now, 0.14, 0.05)
  tone(c, 1318.5, now + 0.09, 0.2, 0.05)
}

/** ガスの風の音（集めているあいだ）。stop で止める */
export function startGasWind() {
  const c = audio()
  if (!c) return null
  const now = c.currentTime
  const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 700
  band.Q.value = 0.8
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.05, now + 0.5)
  src.connect(band).connect(g).connect(out(c))
  src.start(now)
  return {
    stop() {
      const t = c.currentTime
      g.gain.cancelScheduledValues(t)
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
      src.stop(t + 0.45)
    },
  }
}
