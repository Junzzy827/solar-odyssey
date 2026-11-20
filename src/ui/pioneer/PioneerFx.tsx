import { useEffect, useRef, useState } from 'react'
import { ui } from '../../i18n'
import { gasFx, onPioneerFx, shipOnScreen } from '../../state/pioneerFx'
import { togglePanel } from '../../state/pioneer'
import { playDeliver, playFull, playPickup, startGasWind } from '../../audio/pioneerSfx'
import { RESOURCES, type Amounts, type Resource } from '../../data/pioneer'

// 開拓の手応え：拾った量の数字（船のそばから浮かぶ）、積み荷のゲージのはね、
// いっぱいのゆれ、納品のカード（数字が増えていく）、ガスの風の音

type Pop = { id: number; resource: Resource; amount: number; x: number; y: number; born: number }

/** 同じ資源をこの時間内に続けて拾ったら、1 つの数字にまとめる（ミリ秒） */
const MERGE_MS = 400
const POP_MS = 1100
const DELIVER_MS = 3600

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function bumpHold(kind: 'pickup' | 'full') {
  const el = document.querySelector<HTMLElement>('.pioneer-hud .pio-hold')
  if (!el?.animate || reduced()) return
  if (kind === 'pickup') el.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.6)' }, { transform: 'scaleY(1)' }], { duration: 260, easing: 'ease-out' })
  else el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 360 })
}

/** 0 から to まで、ms ミリ秒で増えていく数 */
function CountUp({ to, ms = 900 }: { to: number; ms?: number }) {
  const [v, setV] = useState(reduced() ? to : 0)
  useEffect(() => {
    if (reduced()) return
    const t0 = performance.now()
    let raf = 0
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms)
      setV(Math.round(to * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return <>{v}</>
}

export function PioneerFx() {
  const [pops, setPops] = useState<Pop[]>([])
  const [delivery, setDelivery] = useState<{ id: number; amounts: Amounts; ready: boolean } | null>(null)
  const ids = useRef(0)

  useEffect(
    () =>
      onPioneerFx((e) => {
        if (e.kind === 'pickup') {
          playPickup(e.resource)
          bumpHold('pickup')
          const now = performance.now()
          setPops((list) => {
            const live = list.filter((p) => now - p.born < POP_MS)
            const same = live.find((p) => p.resource === e.resource && now - p.born < MERGE_MS)
            if (same) return live.map((p) => (p === same ? { ...p, amount: p.amount + e.amount } : p))
            const x = shipOnScreen.visible ? shipOnScreen.x : window.innerWidth / 2
            const y = shipOnScreen.visible ? shipOnScreen.y : window.innerHeight / 2
            return [...live.slice(-5), { id: ++ids.current, resource: e.resource, amount: e.amount, x: x + (Math.random() - 0.5) * 50, y: y - 30 - 22 * live.length, born: now }]
          })
        } else if (e.kind === 'full') {
          playFull()
          bumpHold('full')
        } else {
          playDeliver()
          setDelivery({ id: ++ids.current, amounts: e.amounts, ready: e.ready })
        }
      }),
    [],
  )

  // 数字は少したったら消す
  useEffect(() => {
    if (!pops.length) return
    const timer = window.setTimeout(() => setPops((l) => l.filter((p) => performance.now() - p.born < POP_MS)), POP_MS)
    return () => window.clearTimeout(timer)
  }, [pops])

  useEffect(() => {
    if (!delivery) return
    const timer = window.setTimeout(() => setDelivery(null), DELIVER_MS)
    return () => window.clearTimeout(timer)
  }, [delivery])

  // ガスの風の音：集めているあいだだけ
  useEffect(() => {
    let wind: ReturnType<typeof startGasWind> = null
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (gasFx.collecting && !wind) wind = startGasWind()
      else if (!gasFx.collecting && wind) {
        wind.stop()
        wind = null
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      wind?.stop()
    }
  }, [])

  const t = ui().pioneer
  return (
    <>
      <div className="pio-pops" aria-hidden>
        {pops.map((p) => (
          <span key={p.id} className={`pio-pop pio-pop-${p.resource}`} style={{ left: p.x, top: p.y }}>
            +{p.amount} {t.resource[p.resource]}
          </span>
        ))}
      </div>
      {delivery && (
        <div key={delivery.id} className="pio-delivery" role="status" aria-label={t.delivered(delivery.amounts, delivery.ready)}>
          <h3>{t.deliveredTitle}</h3>
          <div className="pio-delivery-rows">
            {RESOURCES.filter((r) => delivery.amounts[r] > 0).map((r) => (
              <span key={r} className="pio-delivery-row">
                <i className={`pio-dot pio-${r}`} />
                {t.resource[r]}
                <b>
                  +<CountUp to={delivery.amounts[r]} />
                </b>
              </span>
            ))}
          </div>
          {delivery.ready && (
            <button
              type="button"
              className="pio-build"
              onClick={() => {
                setDelivery(null)
                togglePanel(true)
              }}
            >
              {t.readyToBuild}
            </button>
          )}
        </div>
      )}
    </>
  )
}
