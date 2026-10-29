// 表示用スケール。実スケールでは惑星が点にもならないため、
// 距離は対数で圧縮し、大きさは立方根で差を縮めて見やすくする。

export const SUN_RADIUS = 8

/** 地球の公転1周にかかる表示上の秒数 */
export const EARTH_YEAR_SECONDS = 120

export const orbitRadius = (au: number) => SUN_RADIUS + 40 * Math.log(1 + au * 2.5)

export const bodyRadius = (km: number) => 1.2 * Math.cbrt(km / 6_371)

export const moonOrbitRadius = (planetRadius: number, index: number) => planetRadius * 1.8 + 0.9 * (index + 1)

/** 公転周期（日）から角速度（rad/秒）を求める。負の周期は逆回転 */
export const angularSpeed = (periodDays: number) => (2 * Math.PI * 365.25) / (EARTH_YEAR_SECONDS * periodDays)

/** 自転は1時間を1秒にする（地球は24秒、木星は約10秒で1回転） */
export const spinSpeed = (rotationHours: number) => (2 * Math.PI) / rotationHours

/**
 * 衛星は周期差が大きいので平方根で圧縮（月の1周＝60秒。地球の1日より長くかかるように）。
 * フォボスなど速すぎるものも、1周4秒より速くはしない
 */
export const moonSpeed = (orbitDays: number) => Math.sign(orbitDays) * (2 * Math.PI) / Math.max(4, 60 * Math.sqrt(Math.abs(orbitDays) / 27.3))
