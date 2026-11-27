import { useStore } from '../../state/store'

// 乗員室の換気ファンの音（作った音）：低くこもったざわめきと、かすかなうなり。
// 本物の録音ではない。ブラウザは操作のあとでないと音を出せないので、最初のクリック・タッチで鳴らし始める。

let ctx: AudioContext | null = null
let out: GainNode | null = null

export function startCabinHum() {
  const { muted, volume } = useStore.getState().settings
  if (muted || volume <= 0) return
  try {
    if (!ctx) {
      ctx = new AudioContext()
      out = ctx.createGain()
      out.gain.value = 0
      out.connect(ctx.destination)
      // 茶色のざわめき（低い音が多い雑音）
      const len = ctx.sampleRate * 4
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = buf.getChannelData(0)
      let last = 0
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
        d[i] = last * 3.5
      }
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      noise.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 420
      noise.connect(lp).connect(out)
      noise.start()
      // ファンのうなり（120 Hz 前後、ゆっくり揺れる）
      const osc = ctx.createOscillator()
      osc.frequency.value = 118
      const og = ctx.createGain()
      og.gain.value = 0.05
      osc.connect(og).connect(out)
      osc.start()
    }
    void ctx.resume()
    out!.gain.setTargetAtTime(0.18 * volume, ctx.currentTime, 0.8)
  } catch {
    // 音が出せない環境では鳴らさない
  }
}

export function stopCabinHum() {
  if (!ctx || !out) return
  const c = ctx
  out.gain.setTargetAtTime(0, c.currentTime, 0.2)
  setTimeout(() => {
    void c.close()
  }, 800)
  ctx = null
  out = null
}
