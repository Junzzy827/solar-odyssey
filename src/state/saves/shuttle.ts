import { registerSave } from '../save'
import { ui } from '../../i18n'

// スペースシャトルの乗員室：見た見どころと、明かりの好み（state/shuttle.ts）

registerSave({ name: 'shuttle', label: () => ui().shuttle.saveLabel })
