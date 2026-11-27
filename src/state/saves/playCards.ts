import { registerSave } from '../save'
import { ui } from '../../i18n'

// 航法コンピュータの「遊ぶ」タブで押したことのあるカード（ui/nav/tried.ts）
registerSave({ name: 'play-tried', label: () => ui().playCards.saveTried })
