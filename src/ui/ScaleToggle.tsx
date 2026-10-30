import { PLANETS } from '../data/bodies'
import { computeLayout } from '../data/layout'
import { bodyRadius } from '../data/scale'
import { t, useLang } from '../i18n/lang'
import { useStore } from '../state/store'
import { useRace } from '../state/race'
import { isTouchDevice } from '../state/input'

// 距離と大きさの3段の切りかえ。表示の設定のスライダー（0〜1）の、左はし・まんなか・右はしにあたる。
// スライダーで途中に合わせたときは、どの段も光らせない

/** 段の値：見やすく（0）・ほどほど（0.5）・本物（1） */
export const SCALE_STEPS = [0, 0.5, 1] as const

type Kind = 'distance' | 'size'

/** 段の名前（スライダーの横にも同じ名前を出す） */
export function stepName(kind: Kind, step: number) {
  if (step === 0) return t('見やすく', 'Easy')
  if (step === 1) return kind === 'distance' ? t('本物寄り', 'Near real') : t('本物', 'Real')
  return t('ほどほど', 'Mid')
}

/** 今の値がどの段か（途中なら null） */
export const stepOf = (value: number) => SCALE_STEPS.find((s) => Math.abs(s - value) < 0.01) ?? null

const EARTH = PLANETS.find((p) => p.id === 'earth')!
const count = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString())

/** 月までの距離（地球の直径いくつ分。本物は約30）と、太陽の直径（地球のいくつ分。本物は約109） */
export function scaleFacts(distance: number, size: number) {
  const layout = computeLayout(distance, size)
  const earth = bodyRadius(EARTH.radiusKm)
  return { moonGap: count(layout.moon.get('moon')!.radius / (2 * earth)), sunSize: count(layout.sun / earth) }
}

function hint(kind: Kind, step: number) {
  if (kind === 'distance') {
    if (step === 0) return t('惑星も衛星も、ぎゅっと近くに並べる', 'Planets and moons packed close together')
    if (step === 1) return t('衛星は本物の距離。惑星どうしは本物の約20〜50分の1', 'Moons at their real distance; planets at about 1/20–1/50 of real')
    return t('見やすさと本物のあいだ', 'Halfway between easy and real')
  }
  if (step === 0) return t('小さな天体も大きめにして、見つけやすく', 'Small bodies enlarged so they are easy to find')
  if (step === 1) return t('本物の比率（太陽は地球の約109倍）', 'Real proportions (the Sun is about 109 times Earth)')
  return t('見やすさと本物のあいだ', 'Halfway between easy and real')
}

/** 距離・大きさの、3段の切りかえ2列 */
export function ScaleSteps({ racing }: { racing: boolean }) {
  useLang()
  const distance = useStore((s) => s.settings.distance)
  const size = useStore((s) => s.settings.size)
  const update = useStore((s) => s.updateSettings)
  const row = (kind: Kind, label: string, value: number) => {
    const now = stepOf(value)
    return (
      <div className="scale-row" role="group" aria-label={label}>
        <span className="scale-label">{label}</span>
        {SCALE_STEPS.map((step) => (
          <button key={step} className={now === step ? 'on' : ''} onClick={() => update({ [kind]: step })} disabled={racing} title={hint(kind, step)} aria-pressed={now === step}>
            {stepName(kind, step)}
          </button>
        ))}
      </div>
    )
  }
  return (
    <>
      {row('distance', t('距離', 'Distance'), distance)}
      {row('size', t('大きさ', 'Size'), size)}
    </>
  )
}

const useRacing = () => useRace((r) => r.phase === 'countdown' || r.phase === 'running')

/** パソコンでは、画面の上のまんなか（現実｜SF の下）にいつも出す */
export function ScaleBadge() {
  const gallery = useStore((s) => s.mode === 'gallery')
  const scope = useStore((s) => s.scope)
  const racing = useRacing()
  if (gallery || scope || isTouchDevice()) return null
  return (
    <div className="scale-badge">
      <ScaleSteps racing={racing} />
    </div>
  )
}

/** スマホ・タブレットで、上のアイコン「縮尺」から開くメニュー */
export function ScaleSheet() {
  useLang()
  const distance = useStore((s) => s.settings.distance)
  const size = useStore((s) => s.settings.size)
  const racing = useRacing()
  const { moonGap, sunSize } = scaleFacts(distance, size)
  return (
    <section className="scale-sheet" aria-label={t('縮尺', 'Scale')}>
      <ScaleSteps racing={racing} />
      <p className="muted small">
        {t(`月まで：地球の直径の約${moonGap}個分（本物は約30個分）`, `To the Moon: about ${moonGap} Earth diameters (really about 30)`)}
        <br />
        {t(`太陽：地球の約${sunSize}倍（本物は約109倍）`, `The Sun: about ${sunSize} times Earth (really about 109)`)}
        {racing && (
          <>
            <br />
            {t('レース中は見やすい距離と大きさで走ります。', 'During the race, the easy-to-see distance and size are used.')}
          </>
        )}
      </p>
    </section>
  )
}
