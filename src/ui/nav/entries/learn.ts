import { registerNav } from '../registry'
import { ui } from '../../../i18n'
import { useStore } from '../../../state/store'
import { openSizeCompare, useSizeCompare } from '../../../state/sizeCompare'

// レーンD（現実モードの学び）の入口

registerNav({
  id: 'size-compare',
  tab: 'learn',
  order: 16,
  className: 'size-compare-start',
  label: () => ui().sizeCompare.navButton,
  use: () => ({ on: useSizeCompare((s) => s.id !== null) }),
  // 目標の天体（なければ地球）を、地球・月・エベレストなどとならべる
  run: () => openSizeCompare(useStore.getState().targetId),
})
