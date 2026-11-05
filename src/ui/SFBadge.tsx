import { useEffect } from 'react'
import { setWorld, useSF } from '../data/sf'
import { useLang } from '../i18n/lang'
import { useStore } from '../state/store'
import { useRace } from '../state/race'
import { isTouchDevice } from '../state/input'
import { ui } from '../i18n'

/**
 * 画面の上のまんなかに、いつも「現実｜SF」の切りかえを出す。SF のときは画面全体の差し色を紫にする
 * （スクリーンショットを見ても、本物の太陽系のモードと取りちがえないように）
 */
export function SFBadge() {
  const sf = useSF()
  useLang()
  const gallery = useStore((s) => s.mode === 'gallery')
  const racePhase = useRace((r) => r.phase)
  const racing = racePhase === 'countdown' || racePhase === 'running'
  useEffect(() => {
    document.body.classList.toggle('sf', sf)
  }, [sf])
  // スマホ・タブレットでは、上のアイコン列（TouchBar）に切りかえがある
  if (gallery || isTouchDevice()) return null
  return (
    <div className={`sf-badge${sf ? ' on' : ''}`} role="group" aria-label={ui().sfBadge.world}>
      <button className={sf ? '' : 'on'} onClick={() => setWorld('real')} disabled={racing} title={ui().sfBadge.realWorldTip}>
        {ui().sfBadge.real}
      </button>
      <button className={sf ? 'on' : ''} onClick={() => setWorld('sf')} disabled={racing} title={ui().sfBadge.sfWorldTip}>
        SF <span>{ui().sfBadge.fiction}</span>
      </button>
    </div>
  )
}
