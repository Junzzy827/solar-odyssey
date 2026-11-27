import * as THREE from 'three'

/**
 * 地球の向き：真下の点（緯度・経度）が乗員室の真上（地球の中心から見て −Y）に来て、機首（−Z）が軌道の進む向きになるように回す。
 * 球の絵は経度 0 が +X、北極が +Y（three.js の SphereGeometry）。
 */
export function earthStartQuaternion(latDeg: number, lonDeg: number, inclination: number) {
  const lat = THREE.MathUtils.degToRad(latDeg)
  const lon = THREE.MathUtils.degToRad(lonDeg)
  const p = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon))
  const east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon))
  const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon))
  // 進む向き（北から東へ測った角）：sin β = cos i / cos 緯度（北へ上っていく側）
  const beta = Math.asin(Math.min(1, Math.cos(inclination) / Math.cos(lat)))
  const h = north.multiplyScalar(Math.cos(beta)).addScaledVector(east, Math.sin(beta)).normalize()
  const n = new THREE.Vector3().crossVectors(p, h).normalize()
  // 球の中の (n, −p, −h) を、場面の (X, Y, Z) へ
  const m = new THREE.Matrix4().makeBasis(n, p.clone().negate(), h.clone().negate()).transpose()
  return new THREE.Quaternion().setFromRotationMatrix(m)
}
