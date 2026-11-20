import { registerNav, useNavContext } from '../registry'
import { ui } from '../../../i18n'
import { closeEclipses } from '../../../state/eclipse'
import { startMoonMission } from '../../../state/moonMission'

// 月への有人飛行（アポロ17号の追体験）。第1弾は打ち上げから月へ向かう点火まで

registerNav({
  id: 'moonMission',
  tab: 'play',
  order: 15,
  className: 'moon-mission-start',
  label: () => ui().moonMission.navLabel,
  use: () => {
    const { busy, flight } = useNavContext()
    return { disabled: busy || !flight }
  },
  run: () => (closeEclipses(), startMoonMission()),
})
