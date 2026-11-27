// スペースシャトルの打ち上げ（STS-61、1993 年 12 月 2 日の夜、39B 発射台）の時刻表と、上昇の道のり。
// 時刻は発射（T−0）からの秒。事実の出典は tools/shuttle/FACTS.md の 2 章（NASA KSC「Countdown!」2003 ほか）。
// 上昇の高さは、本物の数字（発射の 2 分ほどで 高さ 約 51 km、固体ロケットが燃えつきる）に合うように作った見積もり（EST）。

/** 打ち上げの瞬間（世界時）：1993-12-02 4:27:00 a.m. EST */
export const STS61_LIFTOFF = Date.UTC(1993, 11, 2, 9, 27, 0)

/** 席に着いてから見せる秒読みの始まり（地上の自動の秒読みが機上のコンピューターへ渡るのが T−31 秒） */
export const COUNT_FROM = -31
/** 酸素の排気の帽子（ビーニー帽）の腕は、T−2 分 30 秒に帽子を上げ、T−1 分 45 秒に退く（見せる秒読みの前に終わっている） */
/** 音をやわらげる水をまき始める：T−6.6 秒（メインエンジンの点火と同じとき。20 秒ほど流れ、T+9 秒でいちばん多い） */
export const WATER_ON = -6.6
/** 水素を燃やす火花（尾部の配管塔にある 6 つの点火器）：メインエンジン点火の直前（T−10 秒は UNVERIFIED） */
export const SPARKLERS = -10
/** メインエンジン 3 基の点火：T−6.6 秒から 0.12 秒ずつ（3 番・2 番・1 番の順） */
export const SSME_START = -6.6
export const SSME_STAGGER = 0.12
/** 押すまで待つ（押さなければ、少しして自動で点火） */
export const HOLD_AT = -7
export const AUTO_IGNITE_AFTER = 12
/** 固体ロケット点火 = 発射 */
export const LIFTOFF = 0
/** 回転（ロール）：塔を離れてから、背中を下にする向きへ。T+20 秒ごろまでに終わる */
export const ROLL_START = 8
export const ROLL_END = 20
/** 空気の力がいちばん強い所を前に、エンジンを少し絞る（T+26 秒）、また上げる（T+60 秒） */
export const THROTTLE_DOWN = 26
export const THROTTLE_UP = 60
/** 固体ロケットの切り離し：発射から 約 2 分（2 分 6 秒は UNVERIFIED）、高さ 約 50 km */
export const SRB_SEP = 126

/** 上昇の高さ（m、甲板から）の目安：[秒, 高さ] */
const ALT: [number, number][] = [
  [0, 0],
  [4, 36],
  [7, 120],
  [10, 260],
  [20, 1150],
  [30, 2800],
  [40, 5000],
  [60, 10_600],
  [80, 17_500],
  [100, 29_000],
  [126, 50_000],
  [140, 59_000],
]
/** 東へ進んだ距離（m） */
const DOWN: [number, number][] = [
  [0, 0],
  [10, 0],
  [20, 120],
  [30, 450],
  [40, 1100],
  [60, 3400],
  [80, 7800],
  [100, 14_500],
  [126, 27_000],
  [140, 35_000],
]

/** 折れ線の表をなめらかに（エルミート）たどる */
function curve(tab: [number, number][], t: number) {
  if (t <= tab[0][0]) return tab[0][1]
  const n = tab.length
  if (t >= tab[n - 1][0]) {
    const [t0, v0] = tab[n - 2]
    const [t1, v1] = tab[n - 1]
    return v1 + ((v1 - v0) / (t1 - t0)) * (t - t1)
  }
  let i = 0
  while (tab[i + 1][0] < t) i++
  const [t0, v0] = tab[i]
  const [t1, v1] = tab[i + 1]
  const slope = (k: number) => {
    const a = tab[Math.max(0, k - 1)]
    const b = tab[Math.min(n - 1, k + 1)]
    return (b[1] - a[1]) / (b[0] - a[0])
  }
  const h = t1 - t0
  const u = (t - t0) / h
  const m0 = i === 0 ? 0 : slope(i) * h
  const m1 = slope(i + 1) * h
  const u2 = u * u
  const u3 = u2 * u
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1
}

/** T 秒の高さ（m） */
export const altitudeAt = (t: number) => Math.max(0, curve(ALT, t))
/** T 秒に東へ進んだ距離（m） */
export const downrangeAt = (t: number) => Math.max(0, curve(DOWN, t))

/** 機体の傾き（rad、0 = まっすぐ上、東へ倒れる）：進む向きから */
export function pitchAt(t: number) {
  if (t <= 9) return 0
  const dt = 0.5
  const dx = downrangeAt(t + dt) - downrangeAt(t - dt)
  const dy = altitudeAt(t + dt) - altitudeAt(t - dt)
  return Math.atan2(dx, Math.max(1e-3, dy))
}

/** 回転（ロール）の進み 0〜1 */
export function rollAt(t: number) {
  const k = Math.min(1, Math.max(0, (t - ROLL_START) / (ROLL_END - ROLL_START)))
  return k * k * (3 - 2 * k)
}

/** メインエンジン i（0〜2）の推力 0〜1（点火から 3 秒で 90% 以上、空気の強い所で少し絞る） */
export function ssmeThrust(i: number, t: number, ignitedAt = SSME_START) {
  const start = ignitedAt + (2 - i) * SSME_STAGGER
  if (t < start) return 0
  const up = Math.min(1, (t - start) / 3)
  let k = up * up * (3 - 2 * up)
  if (t > THROTTLE_DOWN && t < THROTTLE_UP) k *= 0.72 + 0.28 * Math.min(1, Math.max(0, (t - THROTTLE_UP + 6) / 6))
  return k
}

/** 固体ロケットの推力 0〜1（T−0 に一気に、終わりは燃え尽きて弱まる） */
export function srbThrust(t: number) {
  if (t < 0 || t > SRB_SEP) return 0
  const on = Math.min(1, t / 0.4)
  const tail = t > SRB_SEP - 12 ? (SRB_SEP - t) / 12 : 1
  return on * (0.35 + 0.65 * tail)
}

/** 映画のカット：秒（T）から次のカットまで。shot は ShuttleLaunchWorld のカメラの名前 */
export type LaunchShot = 'seat' | 'night' | 'engines' | 'wide' | 'tower' | 'below' | 'chase' | 'seatShake' | 'sep' | 'far'
export const LAUNCH_CUTS: { at: number; shot: LaunchShot }[] = [
  { at: COUNT_FROM, shot: 'seat' },
  // 席で待つあいだに一度、外の夜の発射台（8 秒より長く同じ絵にしない）
  { at: -24, shot: 'night' },
  { at: -15, shot: 'seat' },
  { at: SSME_START + 0.1, shot: 'engines' },
  { at: -3.2, shot: 'seat' },
  { at: -0.4, shot: 'wide' },
  { at: 5.5, shot: 'tower' },
  { at: 11, shot: 'below' },
  { at: 19, shot: 'seatShake' },
  { at: 25, shot: 'chase' },
  { at: 42, shot: 'far' },
  // ここで時間を早送りして、固体ロケットの切り離しへ
  { at: SRB_SEP - 5, shot: 'sep' },
]
/** 早送りの区間：[ここから, ここまで]（画面に「2 分後」のカードを出す） */
export const SKIP_FROM = 49
export const SKIP_TO = SRB_SEP - 5
/** 映画の終わり（このあと幕を閉じて、軌道の乗員室へ） */
export const FILM_END = SRB_SEP + 9

export function shotAt(t: number): { shot: LaunchShot; at: number; index: number } {
  let i = 0
  while (i + 1 < LAUNCH_CUTS.length && LAUNCH_CUTS[i + 1].at <= t) i++
  return { ...LAUNCH_CUTS[i], index: i }
}
