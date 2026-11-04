import { ui } from '../i18n'

// SF モードの、砂時計型コロニー群（オリジナルのデザイン）。
// 2つの大きなお椀を、細いくびれ（宇宙港）で背中合わせにつないだ形のコロニーが、太陽と地球の L5 点に輪になって浮かぶ。

export const HOURGLASS_ID = 'hourglass'
export const hourglassName = () => ui().sfHourglass.hourglassColonies

export const HOURGLASS_TEXT = {
  found: () =>
    ui().sfHourglass.found,
}
