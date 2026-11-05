import { ui } from '../i18n'

// SF モードの、遠くを旅する大きな船や人工の天体（オリジナルのデザイン。作品の名前・形は使わない）。
// 電波望遠鏡の人工の月、くさび形の鉱石輸送船、円盤形の貨物船。どれも武器は持たない。

/** 電波望遠鏡の人工の月（火星の公転の道すじの上、火星より60度うしろ＝火星のトロヤ点 L5） */
export const RADIO_MOON_ID = 'radio-moon'
export const radioMoonName = () => ui().sfSpace.radioTelescopeMoon
/** くさび形の鉱石輸送船（小惑星帯をゆっくり一周する） */
export const CARRIER_ID = 'ore-carrier'
export const carrierName = () => ui().sfSpace.wedgeOreCarrier
/** 円盤形の貨物船（月と L5 のコロニーのあいだを行き来する） */
export const FREIGHTER_ID = 'disc-freighter'
export const freighterName = () => ui().sfSpace.discFreighter

export const SPACE_TEXT = {
  radioMoonFound: () =>
    ui().sfSpace.radioMoonFound,
  carrierFound: () =>
    ui().sfSpace.carrierFound,
  freighterFound: () =>
    ui().sfSpace.freighterFound,
}
