// 宇宙ステーションの中の音：空気を回すファンの「サー」という音と、機械の低いうなり。Web Audio で合成（録音は使わない）。
// 本物の ISS の中は、ファンとポンプの音がずっと鳴っていて、静かではない（でも、ここでは小さく）
import { audio, output, volume } from '../../audio/sfx'
import { useStore } from '../../state/store'

const LEVEL = 0.07

let nodes: { gain: GainNode; stop: () => void } | null = null
let unsubscribe: (() => void) | null = null

function noise(c: AudioContext) {
  // ピンクに近いノイズ（4 秒をくり返す）
  const buf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0
  let b1 = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99 * b0 + w * 0.05
    b1 = 0.9 * b1 + w * 0.12
    d[i] = (b0 + b1) * 1.6
  }
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true
  return src
}

export function setIssAmbience(on: boolean) {
  if (on === !!nodes) return
  const c = audio()
  if (!c) return
  if (!on && nodes) {
    nodes.gain.gain.setTargetAtTime(0, c.currentTime, 0.3)
    const n = nodes
    setTimeout(() => n.stop(), 1500)
    nodes = null
    unsubscribe?.()
    unsubscribe = null
    return
  }
  const gain = c.createGain()
  gain.gain.value = 0
  gain.connect(output(c))
  // ファン：ノイズを帯域で絞った「サー」
  const air = noise(c)
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 700
  band.Q.value = 0.6
  const airGain = c.createGain()
  airGain.gain.value = 0.5
  air.connect(band).connect(airGain).connect(gain)
  // ポンプ・ファンのモーター：低い音を 2 つ、わずかにずらしてうねらせる
  const hums = [120, 120.7, 240.2].map((f, i) => {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const g = c.createGain()
    g.gain.value = i === 2 ? 0.04 : 0.1
    o.connect(g).connect(gain)
    o.start()
    return o
  })
  air.start()
  const level = () => LEVEL * volume()
  gain.gain.setTargetAtTime(level(), c.currentTime, 1.0)
  nodes = {
    gain,
    stop: () => {
      air.stop()
      hums.forEach((o) => o.stop())
      gain.disconnect()
    },
  }
  unsubscribe = useStore.subscribe((s, prev) => {
    if (s.settings !== prev.settings && nodes) nodes.gain.gain.setTargetAtTime(level(), c.currentTime, 0.2)
  })
}
