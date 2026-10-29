import { t } from '../i18n/lang'

// 実在の宇宙望遠鏡。形は公開されている写真を参考に、簡単な部品の組み合わせで作っている。
export const HUBBLE_ID = 'hubble'
export const WEBB_ID = 'webb'

export type ScopeId = typeof HUBBLE_ID | typeof WEBB_ID

export const isTelescope = (id: string | null): id is ScopeId => id === HUBBLE_ID || id === WEBB_ID

export const scopeName = (id: ScopeId) => (id === HUBBLE_ID ? t('ハッブル宇宙望遠鏡', 'Hubble Space Telescope') : t('ウェッブ宇宙望遠鏡', 'Webb Space Telescope'))
/** 3Dのラベルに出す短い名前 */
export const scopeShortName = (id: ScopeId) => (id === HUBBLE_ID ? t('ハッブル', 'Hubble') : t('ウェッブ', 'Webb'))

/**
 * 表示上の大きさ。本物の大きさ（全長13m・日よけ21m）では自機（全長640m＝表示0.3）の
 * 数十分の1で見えなくなるので、どちらも約20倍に描く
 */
export const HUBBLE_LENGTH = 0.14
export const WEBB_WIDTH = 0.2

/** ハッブルは地球の中心からこの半径を回る（地球の半径は1.2、月の軌道は約3.1） */
export const HUBBLE_ORBIT = 1.85
/** 1周にかかる、望遠鏡の時計の目盛り。本物は約95分で、時計は1時間に HUBBLE_TICKS_PER_HOUR 進む */
export const HUBBLE_PERIOD = 30
export const HUBBLE_TICKS_PER_HOUR = HUBBLE_PERIOD / (95 / 60)
/** 軌道の傾き（黄道面に対して） */
export const HUBBLE_INCLINATION = 0.55

/** ウェッブは地球から見て太陽と反対側（L2）。本物は約150万km、月までの約4倍 */
export const WEBB_DISTANCE = 7
/** L2のまわりをゆっくり回る（ハロー軌道）半径と周期 */
export const WEBB_HALO = 0.6
export const WEBB_HALO_PERIOD = 90

/** この距離まで近づくと「のぞく」を出す */
export const SCOPE_NEAR = 3

export const TELESCOPE_TEXT = {
  found: (name: string) =>
    t(`${name}のそばに来ました。\nT キーで、望遠鏡の目で深宇宙をのぞいてみよう。（I で航海日誌）`, `You are next to the ${name}.\nPress T to look into deep space through its eyes. (I for the ship’s log)`),
  tooFar: (name: string) => t(`${name}のそばまで行くと、望遠鏡の写真をのぞけます。`, `Fly close to the ${name} to look through its pictures.`),
}
