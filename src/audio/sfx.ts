// 効果音はすべて Web Audio で合成する（作品の音源は使わない）

let ctx: AudioContext | null = null

function audio() {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
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
  hum.connect(humFilter).connect(humGain).connect(c.destination)
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
  rush.connect(rushFilter).connect(rushGain).connect(c.destination)
  rush.start(now)
}

/** ブラウザの音声合成で読み上げる */
export function speak(text: string, opts: { rate?: number; pitch?: number } = {}) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  u.rate = opts.rate ?? 1.05
  u.pitch = opts.pitch ?? 1
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
  osc.connect(filter).connect(gain).connect(c.destination)
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
  src.connect(filter).connect(gain).connect(c.destination)
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
  osc.connect(gain).connect(c.destination)
  osc.start(now)
  osc.stop(now + seconds + 0.02)
}
