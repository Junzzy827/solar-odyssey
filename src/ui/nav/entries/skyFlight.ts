import { registerNav, useNavContext } from '../registry'
import { ui } from '../../../i18n'
import { canGoFly, goFly, useSkyFlight } from '../../../state/skyFlight'
import { useLanding } from '../../../state/landing'

// 遊ぶ：着陸船で月の空を飛ぶ（月に着陸して飛び立つ。もう月にいれば、そのまま飛び立つ）
registerNav({
  id: 'sky-flight',
  tab: 'play',
  order: 46,
  className: 'sky-flight-open',
  label: () => ui().skyFlight.navButton,
  use: () => {
    const { busy, onMission } = useNavContext()
    return { on: useSkyFlight((s) => s.phase) !== 'off', disabled: busy || onMission || !useLanding(canGoFly) }
  },
  run: goFly,
})
