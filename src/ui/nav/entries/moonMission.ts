import { registerNav, useNavContext } from '../registry'
import { ui } from '../../../i18n'
import { closeEclipses } from '../../../state/eclipse'
import { startMoonMission } from '../../../state/moonMission'
import { startSaturnObserve } from '../../../state/saturnExplorer'

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
  // 夕方の発射台でサターンV を見るところから（「打ち上げの夜へ」ですぐ秒読みにも行ける）
  run: () => (closeEclipses(), startMoonMission('launch', startSaturnObserve)),
})
