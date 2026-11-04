import { ui } from '../i18n'

// SF モードの推進小惑星（オリジナルのデザイン）。採掘のために、小惑星帯から地球の近くへ
// エンジンでゆっくり運ばれてくる、コマのような形の大きな岩。採掘基地・ドームの居住区・横一列のエンジンを取りつけている。

export const ENGINE_ROCK_ID = 'engine-rock'
export const engineRockName = () => ui().sfEngine.engineAsteroid

export const ENGINE_ROCK_TEXT = {
  found: () =>
    ui().sfEngine.found,
}
