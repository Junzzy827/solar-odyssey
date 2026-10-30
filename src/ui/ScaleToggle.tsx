import { PLANETS } from '../data/bodies'
import { computeLayout } from '../data/layout'
import { bodyRadius } from '../data/scale'
import { t, useLang } from '../i18n/lang'
import { useStore } from '../state/store'
import { useRace } from '../state/race'
import { isTouchDevice } from '../state/input'

// スケールの3段の切りかえ。距離と大きさをいっしょに動かす（別々だと、遠いのに大きい・近いのに小さいなど、見た目がちぐはぐになる）。
// 表示の設定のスライダー（0〜1）の、左はし・まんなか・右はしにあたる。スライダーで途中に合わせたときは、どの段も光らせない

/** 段の値：見やすく（0）・ほどほど（0.5）・本物寄り（1） */
export const SCALE_STEPS = [0, 0.5, 1] as const

/** 段の名前（スライダーの横にも同じ名前を出す） */
export function stepName(step: number) {
  if (step === 0) return t('見やすく', 'Easy')
  if (step === 1) return t('本物寄り', 'Near real')
  return t('ほどほど', 'Mid')
}

/** 今の値がどの段か（途中なら null） */
export const stepOf = (value: number) => SCALE_STEPS.find((s) => Math.abs(s - value) < 0.01) ?? null

/** 距離と大きさを、同じスケールにそろえる */
export const scalePatch = (scale: number) => ({ distance: scale, size: scale })

const EARTH = PLANETS.find((p) => p.id === 'earth')!
const count = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString())

/** 月までの距離（地球の直径いくつ分。本物は約30）と、太陽の直径（地球のいくつ分。本物は約109） */
export function scaleFacts(distance: number, size: number) {
  const layout = computeLayout(distance, size)
  const earth = bodyRadius(EARTH.radiusKm)
  return { moonGap: count(layout.moon.get('moon')!.radius / (2 * earth)), sunSize: count(layout.sun / earth) }
}

function hint(step: number) {
  if (step === 0) return t('惑星も衛星もぎゅっと近くに、小さな天体は大きめにして見やすく', 'Everything packed close, small bodies enlarged so they are easy to find')
  if (step === 1) return t('大きさは本物の比率、衛星は本物の距離。惑星どうしは本物の約20〜50分の1', 'Real proportions and real moon distances; planets at about 1/20–1/50 of real spacing')
  return t('見やすさと本物のあいだ', 'Halfway between easy and real')
}

/** スケールの3段の切りかえ */
export function ScaleSteps({ racing }: { racing: boolean }) {
  useLang()
  const scale = useStore((s) => (s.settings.distance === s.settings.size ? s.settings.distance : -1))
  const update = useStore((s) => s.updateSettings)
  const now = stepOf(scale)
  const label = t('スケール', 'Scale')
  return (
    <div className="scale-row" role="group" aria-label={label}>
      <span className="scale-label">{label}</span>
      {SCALE_STEPS.map((step) => (
        <button key={step} className={now === step ? 'on' : ''} onClick={() => update(scalePatch(step))} disabled={racing} title={hint(step)} aria-pressed={now === step}>
          {stepName(step)}
        </button>
      ))}
    </div>
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

/** スマホ・タブレットで、上のアイコン「スケール」から開くメニュー */
export function ScaleSheet() {
  useLang()
  const distance = useStore((s) => s.settings.distance)
  const size = useStore((s) => s.settings.size)
  const racing = useRacing()
  const { moonGap, sunSize } = scaleFacts(distance, size)
  return (
    <section className="scale-sheet" aria-label={t('スケール', 'Scale')}>
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
