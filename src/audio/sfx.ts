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
export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  u.rate = 1.05
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}
