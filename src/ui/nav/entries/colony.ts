import { registerNav, useNavContext } from '../registry'
import { ui } from '../../../i18n'
import { closeEclipses } from '../../../state/eclipse'
import { startWalkAtTower } from '../../../state/walk'

// コロニーの中の遊び（レーン B）。公園を歩く入口（core.ts の walk）のすぐ後ろに並べる

registerNav({
  id: 'colonyAxis',
  tab: 'play',
  order: 62,
  world: 'sf',
  className: 'walk-start',
  label: () => ui().walk.toAxis,
  card: {
    shelf: 'free',
    image: 'play-cards/colony-axis.webp',
    title: () => ui().playCards.cards.colonyAxis.title,
    desc: () => ui().playCards.cards.colonyAxis.desc,
  },
  use: () => {
    const { busy, flight } = useNavContext()
    return { disabled: busy || !flight }
  },
  run: () => (closeEclipses(), startWalkAtTower()),
})
