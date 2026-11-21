import * as THREE from 'three'
import { loadCatalog } from '../Sky'
import { EQUATORIAL_FROM_APP, MILKY_WAY_ROTATION } from '../../data/skyFrame'
import { APOLLO17_LIFTOFF, groundFromEquatorial } from '../../data/siteSky'

// 打ち上げの場面の空：本物の星表（9,000 個ほどの星）を、1972 年 12 月 7 日 0 時 33 分（米東部時間）の
// ケネディ宇宙センターの空の向きに並べる。南の高い空にオリオン座、東からしし座が昇ってくる。
//
// 地面の組の座標（x 東、y 上、z 南）は、離昇の瞬間の three の座標と同じ。星は地球の自転と関係なく
// 宇宙に止まっているので、three の座標でそのまま止めておく（地面の組だけが回る）。
//
// 地上では空気があるので：
// - 地平線に近い星ほど暗い（空気の層を斜めに通るので、光が弱まる）
// - 星が少しまたたく（高く上がると止まる）
// - 天の川の淡い光は、目で見える程度にごく弱く（満月の夜を大げさにしない）

const vert = /* glsl */ `
  attribute float mag;
  attribute vec3 color;
  uniform float uPx;
  uniform float uTime;
  uniform float uAir;
  uniform vec3 uUp;
  varying vec3 vColor;
  varying float vSize;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 dir = normalize(mat3(modelMatrix) * position);
    float alt = dot(dir, uUp);
    // 空気の層を通る長さ（地平線ほど長い）で暗く。地平線の下は見えない
    float air = mix(1.0, smoothstep(-0.01, 0.22, alt), uAir);
    // またたき：星ごとに違う速さで、空気のある所だけ
    float h = hash(position);
    float tw = 1.0 + uAir * 0.28 * sin(uTime * (7.0 + 9.0 * h) + h * 40.0) * (1.0 - 0.6 * smoothstep(0.2, 0.9, alt));
    // 発射台の照明と海辺のもやで、暗い星（4.5 等より暗い）は地上ではほとんど見えない
    float seeing = mix(1.0, smoothstep(6.3, 4.6, mag), uAir);
    float flux = pow(10.0, -0.4 * (mag - 1.5) * 0.66) * air * tw * seeing;
    float size = clamp(1.4 + 1.9 * sqrt(flux), 1.4, 6.5);
    vSize = size * max(uPx, 1.0);
    vColor = color * min(flux * 2.6, 3.6);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vSize + 2.0;
    if (air < 0.003) gl_PointSize = 0.0;
  }
`
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vSize;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / (0.18 * vSize * vSize + 0.35));
    if (core < 0.004) discard;
    gl_FragColor = vec4(vColor * core, 1.0);
  }
`

export type LaunchSky = {
  /** 天の川の淡い光の球と、星の点をまとめた組（カメラについて動く） */
  stars: THREE.Group
  /** カメラの位置へ。up は地面の上の向き（three の座標）、h は高さ m、t は秒 */
  update(camera: THREE.Camera, up: THREE.Vector3, h: number, t: number): void
  dispose(): void
}

/** 星表の向き（アプリの座標）→ 離昇の瞬間の発射場の空（地面の組の座標）の回転 */
export function launchSkyRotation(ms = APOLLO17_LIFTOFF) {
  const g = groundFromEquatorial(ms)
  const m3 = new THREE.Matrix3().set(g[0], g[1], g[2], g[3], g[4], g[5], g[6], g[7], g[8]).multiply(EQUATORIAL_FROM_APP)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().setFromMatrix3(m3))
}

export function buildSky(glowTex: THREE.Texture): LaunchSky {
  const group = new THREE.Group()
  group.name = 'LaunchSky'
  const rot = launchSkyRotation()
  // 天の川の淡い光：星表の星と同じ向きに回す（全天画像はアプリの座標で MILKY_WAY_ROTATION）
  const glowGeo = new THREE.SphereGeometry(1900, 48, 24)
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, side: THREE.BackSide, depthWrite: false, depthTest: false, color: '#1c1c1c' })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  glow.quaternion.copy(rot).multiply(MILKY_WAY_ROTATION)
  glow.renderOrder = -11
  group.add(glow)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uTime: { value: 0 }, uAir: { value: 1 }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: vert,
    fragmentShader: frag,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  })
  let points: THREE.Points | null = null
  let alive = true
  loadCatalog().then(
    (geo) => {
      if (!alive) return
      points = new THREE.Points(geo, mat)
      points.quaternion.copy(rot)
      points.frustumCulled = false
      points.renderOrder = -10
      group.add(points)
    },
    () => {},
  )
  return {
    stars: group,
    update(camera, up, h, t) {
      group.position.copy(camera.position)
      mat.uniforms.uUp.value.copy(up)
      // 空気は 10〜40 km でほとんどなくなる
      mat.uniforms.uAir.value = 1 - THREE.MathUtils.smoothstep(h, 10_000, 40_000)
      mat.uniforms.uTime.value = t
      mat.uniforms.uPx.value = Math.min(2, window.devicePixelRatio || 1)
      // 天の川の光は、宇宙に出ると少し見えやすく
      glowMat.color.setScalar((0x1c / 255) * (1 + 1.2 * (1 - mat.uniforms.uAir.value)))
    },
    dispose() {
      alive = false
      glowGeo.dispose()
      glowMat.dispose()
      mat.dispose()
      // 星表の形は Sky.tsx と共有しているので消さない
    },
  }
}
