// 表示用スケール。実スケールでは惑星が点にもならないため、
// 距離は対数で圧縮し、大きさは立方根で差を縮めて見やすくする。

export const SUN_RADIUS = 8

/** シミュレーションの時計の目盛り：地球の公転1周が120。実際に進む速さは、時間の速さ（TIME_RATES）で決まる */
export const EARTH_YEAR_SECONDS = 120

export const orbitRadius = (au: number) => SUN_RADIUS + 40 * Math.log(1 + au * 2.5)

export const bodyRadius = (km: number) => 1.2 * Math.cbrt(km / 6_371)

export const moonOrbitRadius = (planetRadius: number, index: number) => planetRadius * 1.8 + 0.9 * (index + 1)

/** 公転周期（日）から角速度（rad/秒）を求める。負の周期は逆回転 */
export const angularSpeed = (periodDays: number) => (2 * Math.PI * 365.25) / (EARTH_YEAR_SECONDS * periodDays)

/** 時間の速さ（ストアの timeScale）は「1秒に何時間進むか」。停止・本物（1秒で1秒）・1秒で1分・1時間・1日 */
export const TIME_RATES = [0, 1 / 3600, 1 / 60, 1, 24]
/** 初めは1秒で1分（地球は24分で1回転。昼と夜の境目がゆっくり動いて見える） */
export const DEFAULT_RATE = 1 / 60

/** 見た目の回転のいちばん速い速さ（1秒に1.5回転）。これより速いと、かえって止まって見える */
const MAX_TURN = 3 * Math.PI

/**
 * 自転や衛星の公転の角速度（rad/秒）。周期は本物（時間。負は逆回り）で、hoursPerSecond の速さで時間が進むとき。
 * 1秒で1時間なら、地球は24秒で1回転、月は約11分で地球を1周する
 */
export const turnRate = (periodHours: number, hoursPerSecond: number) =>
  Math.sign(periodHours) * Math.min((2 * Math.PI * hoursPerSecond) / Math.abs(periodHours), MAX_TURN)
