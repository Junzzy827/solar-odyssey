import { registerSave } from '../save'
import { ui } from '../../i18n'

// 月の光るウサギに会った記録（はじめての日と回数）
registerSave({ name: 'moon-rabbit', label: () => ui().moonRabbit.saveLabel })
