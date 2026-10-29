// 効果音はすべて Web Audio で合成する（作品の音源は使わない）

import { useStore } from '../state/store'

let ctx: AudioContext | null = null
let master: GainNode | null = null

function audio() {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** 設定の音の大きさ（0〜1。消音なら 0） */
const volume = () => {
  const { volume, muted } = useStore.getState().settings
  return muted ? 0 : volume
}

/** すべての効果音の出口。設定の音の大きさをここで掛ける */
function out(c: AudioContext) {
  if (!master) {
    master = c.createGain()
    master.connect(c.destination)
  }
  master.gain.value = volume()
  return master
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** ワープ：低いうなりが高まり、風切り音が抜けていく。seconds はワープ中の長さ */
export function playWarp(chargeSeconds: number, seconds: number) {
  const c = audio()
  const now = c.currentTime
  const jump = now + chargeSeconds
  const end = jump + seconds + 1

  const hum = c.createOscillator()
  hum.type = 'sawtooth'
  hum.frequency.setValueAtTime(40, now)
  hum.frequency.exponentialRampToValueAtTime(160, jump)
  hum.frequency.exponentialRampToValueAtTime(60, end)
  const humFilter = c.createBiquadFilter()
  humFilter.type = 'lowpass'
  humFilter.frequency.value = 400
  const humGain = c.createGain()
  humGain.gain.setValueAtTime(0, now)
  humGain.gain.linearRampToValueAtTime(0.12, jump)
  humGain.gain.linearRampToValueAtTime(0, end)
  hum.connect(humFilter).connect(humGain).connect(out(c))
  hum.start(now)
  hum.stop(end)

  const rush = c.createBufferSource()
  rush.buffer = noiseBuffer(c, end - now)
  const rushFilter = c.createBiquadFilter()
  rushFilter.type = 'bandpass'
  rushFilter.Q.value = 0.8
  rushFilter.frequency.setValueAtTime(300, jump)
  rushFilter.frequency.exponentialRampToValueAtTime(2500, jump + 0.4)
  rushFilter.frequency.exponentialRampToValueAtTime(400, end)
  const rushGain = c.createGain()
  rushGain.gain.setValueAtTime(0, now)
  rushGain.gain.linearRampToValueAtTime(0.25, jump + 0.3)
  rushGain.gain.linearRampToValueAtTime(0.08, jump + seconds)
  rushGain.gain.linearRampToValueAtTime(0, end)
  rush.connect(rushFilter).connect(rushGain).connect(out(c))
  rush.start(now)
}

// 艦長の声：落ち着いた、低めのイギリス英語の男性の声。端末に入っている声から選ぶ
// （Chrome の Google UK English Male、Mac・iPhone の Daniel、Windows の George など）
const CAPTAIN_VOICES = ['Google UK English Male', 'Microsoft Ryan', 'Microsoft Thomas', 'Microsoft George', 'Daniel', 'Arthur', 'Oliver', 'Malcolm']
const FEMALE = /female|woman|serena|kate|stephanie|martha|libby|sonia|hazel|susan|mia|maisie|fiona|moira|karen|tessa|samantha|victoria|zira|aria|jenny/i

let captain: SpeechSynthesisVoice | null | undefined

function captainVoice() {
  if (captain !== undefined) return captain
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null // まだ読み込み中。次の呼び出しで選ぶ
  const byName = CAPTAIN_VOICES.map((name) => voices.find((v) => v.name.includes(name) && v.lang.startsWith('en'))).find(Boolean)
  const british = voices.filter((v) => v.lang.replace('_', '-').startsWith('en-GB'))
  const english = voices.filter((v) => v.lang.startsWith('en'))
  captain = byName ?? british.find((v) => !FEMALE.test(v.name)) ?? english.find((v) => /male/i.test(v.name) && !FEMALE.test(v.name)) ?? british[0] ?? english[0] ?? null
  return captain
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    captain = undefined
  })
}

/** ブラウザの音声合成で、艦長の声（英語）で読み上げる */
export function speak(text: string, opts: { rate?: number; pitch?: number } = {}) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  const voice = captainVoice()
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'en-GB'
  u.rate = opts.rate ?? 0.88
  u.pitch = opts.pitch ?? 0.6
  u.volume = volume()
  if (u.volume === 0) return
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

/** ビーム：高めの音がすっと下がる */
export function playBeam() {
  const c = audio()
  const now = c.currentTime
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(1400, now)
  osc.frequency.exponentialRampToValueAtTime(500, now + 0.35)
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1200
  filter.Q.value = 2
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.12, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
  osc.connect(filter).connect(gain).connect(out(c))
  osc.start(now)
  osc.stop(now + 0.4)
}

/** 爆発：低いノイズが広がって消える */
export function playBlast() {
  const c = audio()
  const now = c.currentTime
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, 1.2)
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1800, now)
  filter.frequency.exponentialRampToValueAtTime(120, now + 1.1)
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.35, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2)
  src.connect(filter).connect(gain).connect(out(c))
  src.start(now)
}


/** 短い電子音（カウントダウンや輪の通過） */
export function playBeep(freq: number, seconds = 0.18) {
  const c = audio()
  const now = c.currentTime
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
  osc.connect(gain).connect(out(c))
  osc.start(now)
  osc.stop(now + seconds + 0.02)
}
