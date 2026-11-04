import { ui } from '../i18n'

// SF モードの、日本のお話から生まれたもの。どちらも作品の権利が切れた昔の物語なので、名前も使える。
// 銀河鉄道：宮沢賢治『銀河鉄道の夜』（1927年ごろ）。光のレールを走る汽車。
// 月の都：『竹取物語』（平安時代）。かぐや姫が帰っていった、月の都。

/** 銀河鉄道（光のレールで太陽系をめぐる） */
export const RAILWAY_ID = 'galactic-railway'
export const railwayName = () => ui().sfJapan.galacticRailway
/** 月の都（月の裏側のクレーターの底） */
export const MOON_CITY_ID = 'moon-city'
export const moonCityName = () => ui().sfJapan.moonCapital

export const JAPAN_TEXT = {
  railwayFound: () =>
    ui().sfJapan.railwayFound,
  moonCityFound: () =>
    ui().sfJapan.moonCityFound,
}
