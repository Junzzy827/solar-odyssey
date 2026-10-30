/** 手で操縦するときの最高速度（推進の段階が「ふつう」のとき） */
export const MAX_SPEED = 8

/** 推進の段階：最高速度にかける倍率。マウスホイール（スマホは −／＋ のボタン）で切り替える */
export const THROTTLE_STEPS = [0.1, 0.25, 0.5, 1, 2, 4]
/** はじめの段階（倍率 1） */
export const THROTTLE_DEFAULT = 3
