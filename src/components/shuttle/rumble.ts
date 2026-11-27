import { useStore } from '../../state/store'

// 打ち上げの音（作った音。本物の録音ではない）：
//   低いごう音（茶色のざわめきを低くこもらせる）＋ 固体ロケットのバリバリ（はじける雑音）＋ 夜の発射台の風。
// 強さは場面が毎フレーム setLaunchAudio で渡す。ブラウザは操作のあとでないと鳴らせないので、最初のクリック・タッチで始める。

let ctx: AudioContext | null = null
let out: GainNode | null = null
let roar: GainNode | null = null
let crackle: GainNode | null = null
let wind: GainNode | null = null
let lp: BiquadFilterNode | null = null

function noiseBuffer(c: AudioContext, brown: boolean) {
  const len = c.sampleRate * 4
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else {
      // はじける音：ほとんど静かで、ときどき大きな粒
      d[i] = Math.random() < 0.012 ? w : w * 0.08
    }
  }
  return buf
}

export function startLaunchAudio() {
  const { muted, volume } = useStore.getState().settings
  if (muted || volume <= 0) return
  try {
    if (!ctx) {
      ctx = new AudioContext()
      out = ctx.createGain()
      out.gain.value = 0.9 * volume
      out.connect(ctx.destination)
      lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 700
      lp.connect(out)
      const mk = (brown: boolean, freq: number, type: BiquadFilterType) => {
        const src = ctx!.createBufferSource()
        src.buffer = noiseBuffer(ctx!, brown)
        src.loop = true
        const f = ctx!.createBiquadFilter()
        f.type = type
        f.frequency.value = freq
        const g = ctx!.createGain()
        g.gain.value = 0
        src.connect(f).connect(g).connect(lp!)
        src.start()
        return g
      }
      roar = mk(true, 260, 'lowpass')
      crackle = mk(false, 900, 'bandpass')
      wind = mk(true, 520, 'lowpass')
    }
    void ctx.resume()
  } catch {
    // 音が出せない環境では鳴らさない
  }
}

/** roar・crack 0〜1、inside：席の中（こもる）、wind：夜の風 */
export function setLaunchAudio(o: { roar: number; crack: number; inside: boolean; wind: number }) {
  if (!ctx || !roar || !crackle || !wind || !lp) return
  const t = ctx.currentTime
  roar.gain.setTargetAtTime(o.roar * 1.4, t, 0.08)
  crackle.gain.setTargetAtTime(o.crack * (o.inside ? 0.25 : 0.9), t, 0.08)
  wind.gain.setTargetAtTime(o.wind * 0.12, t, 0.5)
  lp.frequency.setTargetAtTime(o.inside ? 380 : 1400, t, 0.1)
}

export function stopLaunchAudio() {
  if (!ctx || !out) return
  const c = ctx
  out.gain.setTargetAtTime(0, c.currentTime, 0.3)
  setTimeout(() => {
    void c.close()
  }, 1200)
  ctx = null
  out = roar = crackle = wind = null
  lp = null
}
