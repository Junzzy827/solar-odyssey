import { registerNav } from '../registry'
import { ui } from '../../../i18n'
import { openToday, useToday } from '../../../state/today'
import { openBodyCard, useBodyCards } from '../../../state/bodyCards'
import { useStore } from '../../../state/store'

// レーンD（現実モードの学び）の入口

registerNav({
  id: 'today',
  tab: 'learn',
  order: 5,
  className: 'today-start',
  label: () => ui().today.navButton,
  use: () => ({ on: useToday((s) => s.open) }),
  run: () => openToday(),
})

registerNav({
  id: 'body-cards',
  tab: 'learn',
  order: 15,
  className: 'body-cards-start',
  label: () => ui().bodyCards.title,
  use: () => ({ on: useBodyCards((s) => s.open) }),
  // 目標の天体があればそのカード、なければ前に見たカード
  run: () => openBodyCard(useStore.getState().targetId),
})
