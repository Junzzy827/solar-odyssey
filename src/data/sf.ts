import { t } from '../i18n/lang'
import { useStore } from '../state/store'
import { CUBE_ID } from './cube'

// SF モード：本物の太陽系に、架空の船や構造物を重ねて出す。
// どれも実在の研究や構想をもとにしたオリジナルのデザインで、作品の名前・ロゴ・設定画の形は使わない。
// 本物の科学のモード（real）には、ここにあるものは一切出さない。

export const isSF = () => useStore.getState().settings.world === 'sf'
export const useSF = () => useStore((s) => s.settings.world === 'sf')
/** 世界を切り替える。現実にもどすときは、SF のものを目標にしていたら外す */
export function setWorld(world: 'real' | 'sf') {
  const st = useStore.getState()
  if (st.settings.world === world) return
  st.updateSettings({ world })
  if (world === 'real' && isSFObject(st.targetId)) st.setTarget(null)
  st.showToast(world === 'sf' ? SF_TEXT.worldOn() : SF_TEXT.worldOff())
}

/** スペースコロニー（地球と月の L5 点。オニールの「島3号」の構想がもと） */
export const COLONY_ID = 'colony'
export const colonyName = () => t('L5スペースコロニー', 'L5 Space Colony')

/** SF モードだけに出るもの */
export const SF_IDS = [CUBE_ID, COLONY_ID]
export const isSFObject = (id: string | null) => id !== null && SF_IDS.includes(id)

/**
 * コロニーの寸法（表示単位）。本物の構想は長さ約32km・直径約8km。
 * 天体のそばと同じく、近づくと自機を縮めて本物の比率で見せる（全長640mの自機が、長さの50分の1）
 */
export const COLONY_LENGTH = 1
export const COLONY_RADIUS = COLONY_LENGTH / 8
export const COLONY_REAL_KM = 32
/** 縮める割合：自機（表示 0.3 で 640m）を、コロニーの長さの本物の比率にする */
export const COLONY_ZOOM = 0.3 / ((0.64 / COLONY_REAL_KM) * COLONY_LENGTH)
/** 1G を作る回転：半径4km で約2分に1回転 */
export const COLONY_SPIN_SECONDS = 2 * Math.PI * Math.sqrt(4000 / 9.8)
/** 港（太陽と反対側の端の、回転軸のところ）の穴の半径 */
export const COLONY_PORT = COLONY_RADIUS * 0.3

export const SF_TEXT = {
  colonyFound: () =>
    t(
      'スペースコロニーが見えてきた。太陽と反対側の端にある港から、中へ入れます。\n（I で航海日誌）',
      'A space colony comes into view. You can fly inside through the port at the end facing away from the Sun.\n(I for the ship’s log)',
    ),
  colonyInside: () =>
    t(
      'コロニーの中に入りました。頭の上にも大地が広がっています。回転の遠心力が、内側の地面に重力の代わりの力を生んでいます。',
      'You are inside the colony. There is land above your head too. The spin pushes everything outward, and that push works like gravity on the inner ground.',
    ),
  worldOn: () => t('SFモード：架空の船や構造物も出します。本物の太陽系の上に重ねて表示しています。', 'SF mode: imaginary ships and structures appear on top of the real solar system.'),
  worldOff: () => t('現実モード：本物の太陽系だけを表示します。', 'Real mode: only the real solar system is shown.'),
}
