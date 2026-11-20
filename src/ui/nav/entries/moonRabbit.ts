import { registerNav, useNavContext } from '../registry'
import { ui } from '../../../i18n'
import { canFindRabbit, goFindRabbit, useMoonRabbit } from '../../../state/moonRabbit'
import { useLanding } from '../../../state/landing'

// 遊ぶ：月の光るウサギ（月に着陸して夕暮れを待つ。もう月にいれば夕暮れへ）
registerNav({
  id: 'moon-rabbit',
  tab: 'play',
  order: 45,
  className: 'moon-rabbit-open',
  label: () => ui().moonRabbit.navButton,
  use: () => {
    const { busy, onMission } = useNavContext()
    return { on: useMoonRabbit((r) => r.phase) !== 'off', disabled: busy || onMission || !useLanding(canFindRabbit) }
  },
  run: goFindRabbit,
})
