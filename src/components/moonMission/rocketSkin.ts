import * as THREE from 'three'

// サターンV の外板の細かさ：溶接の継ぎ目の輪・リベットの列・外板ごとの照りのむら・司令船のアルミのテープの筋。
// glb の地図（1 枚で全体を覆う）は近くで見るとのっぺりするので、近くで見るときだけシェーダーで足す（遠くでは消えて、ちらつかない）。
// 色は変えない（本物は白い塗装・黒い帯・磨いた銀）。座標は部品の中の座標（y がロケットの根元からの高さ m、x・z が横）。
// junji 2026-11-22：参考の画像のような、継ぎ目やリベットの密度

const SKIN = /* glsl */ `
  float skHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float skNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(skHash(i), skHash(i + vec2(1.0, 0.0)), u.x), mix(skHash(i + vec2(0.0, 1.0)), skHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  /** 筒の表面の座標：x は周りの長さ（m）、y は高さ（m） */
  vec2 skUV(vec3 p) { return vec2(atan(p.z, p.x) * length(p.xz), p.y); }
  /** 細い溝（0 か 1）。w は溝の幅（周期に対する割合）。px は 1 画素の大きさ（周期に対する割合）で、細かすぎると薄める */
  float skLine(float x, float w, float px) {
    float d = abs(fract(x + 0.5) - 0.5);
    float aa = max(px, 1e-4);
    return (1.0 - smoothstep(w - aa, w + aa, d)) * (1.0 - smoothstep(0.15, 0.4, px));
  }
  /** 外の補強の縦の筋（ストリンガー）がある高さ：段と段をつなぐ筒（インターステージ）と、タンクの上下のスカート */
  float skStringerZone(float y) {
    float z = 0.0;
    z += smoothstep(24.8, 25.0, y) * (1.0 - smoothstep(28.8, 29.0, y)); // 第1段のタンクのあいだ
    z += smoothstep(39.8, 40.0, y) * (1.0 - smoothstep(46.6, 46.8, y)); // 第1段の上のスカートと、第2段とのあいだ
    z += smoothstep(46.8, 47.0, y) * (1.0 - smoothstep(48.8, 49.0, y)); // 第2段の下のスカート
    z += smoothstep(62.8, 63.0, y) * (1.0 - smoothstep(66.7, 66.9, y)); // 第2段の上のスカート
    z += smoothstep(66.9, 67.1, y) * (1.0 - smoothstep(74.3, 74.5, y)); // 第3段の下（広がった筒と、下のスカート）
    z += smoothstep(82.6, 82.8, y) * (1.0 - smoothstep(85.4, 85.6, y)); // 第3段の上のスカート
    return min(z, 1.0);
  }
  /** 外板の高さ（溝はマイナス）・照りのむら（粗さに足す量）・継ぎ目の汚れ（暗くする量） */
  vec3 skin(vec3 p, float metal) {
    vec2 uv = skUV(p);
    float pxY = length(fwidth(uv.y));
    float pxX = length(fwidth(uv.x));
    float zone = metal > 0.5 ? 0.0 : skStringerZone(uv.y);
    // 溶接の継ぎ目の輪（高さ 1.9 m ごと）と、外板の縦の継ぎ目（周り 2.6 m ごと）
    float ring = skLine(uv.y / 1.9, 0.014, pxY / 1.9) * (1.0 - zone);
    float seam = skLine(uv.x / 2.6, 0.006, pxX / 2.6) * 0.6;
    // ストリンガー：周り 16 cm ごとの、角の丸い山（波板のように光と影が並ぶ）
    float sp = fract(uv.x / 0.16);
    float ridge = smoothstep(0.0, 0.25, sp) * (1.0 - smoothstep(0.55, 0.8, sp));
    float strAA = 1.0 - smoothstep(0.3, 0.55, pxX / 0.16);
    float str = zone * ridge * strAA;
    // ストリンガーの区画の上下のふちの輪（太い継ぎ目）
    float band = skLine(uv.y / 0.9, 0.02, pxY / 0.9) * zone;
    // リベットの列：輪の継ぎ目の上下 9 cm に、周り 12 cm ごと
    float rowY = abs(fract(uv.y / 1.9 + 0.5) - 0.5) * 1.9;
    float onRow = 1.0 - smoothstep(0.012, 0.03, abs(rowY - 0.09));
    float cellX = fract(uv.x / 0.12) - 0.5;
    float dotR = 1.0 - smoothstep(0.18, 0.32, abs(cellX));
    float rivet = onRow * dotR * (1.0 - smoothstep(0.004, 0.012, pxX)) * (1.0 - zone);
    // 外板 1 枚ごとの照りのむら（塗りむら・磨きむら）と、大きなゆらぎ
    vec2 panel = floor(vec2(uv.x / 2.6, uv.y / 1.9));
    float pv = skHash(panel) - 0.5;
    float big = skNoise(uv * vec2(0.6, 0.35)) - 0.5;
    // 司令船のアルミのテープ：周り 9 cm ごとの縦の筋で、照りが 1 本ずつ違う
    float tape = metal * (skHash(vec2(floor(uv.x / 0.09), floor(uv.y / 0.6))) - 0.5);
    float tapeLine = metal * skLine(uv.x / 0.09, 0.03, pxX / 0.09);
    float h = -ring * 1.0 - seam * 0.6 + rivet * 0.8 + str * 1.6 - band * 1.0 - tapeLine * 0.4;
    float rough = pv * 0.10 + big * 0.12 + tape * 0.3 + ring * 0.15;
    float dark = ring * 0.12 + seam * 0.08 + band * 0.22 + zone * (1.0 - ridge) * 0.16 * strAA + tapeLine * 0.15;
    return vec3(h, rough, dark);
  }
`

/** 標準の材質のシェーダーに、外板の細かさを足す（onBeforeCompile の中で呼ぶ）。metal：アルミのテープの筋（司令船） */
export function patchSkin(shader: THREE.WebGLProgramParametersWithUniforms, metal: number) {
  if (!shader.vertexShader.includes('varying vec3 vSkinP;')) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinP = position;')
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vSkinP;\n${SKIN}`)
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 skinV = skin(vSkinP, ${metal.toFixed(2)});
      // 継ぎ目にたまった汚れ・溝の影
      diffuseColor.rgb *= 1.0 - skinV.z;`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + skinV.y, 0.05, 1.0);`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // 溝とリベットの高さから、法線を少し傾ける（three の perturbNormalArb と同じ考え方）
        float hk = skinV.x * 0.006;
        vec3 dpx = dFdx(-vViewPosition);
        vec3 dpy = dFdy(-vViewPosition);
        float dhx = dFdx(hk);
        float dhy = dFdy(hk);
        vec3 r1 = cross(dpy, normal);
        vec3 r2 = cross(normal, dpx);
        float det = dot(dpx, r1);
        vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
        normal = normalize(abs(det) * normal - grad);
      }`,
    )
}

/** 霜を付けない部品（司令船・機械船）の材質を、外板の細かさつきの複製に替える */
export function skinParts(parts: THREE.Object3D[]) {
  const made: THREE.Material[] = []
  const cache = new Map<THREE.Material, THREE.Material>()
  for (const part of parts) {
    part.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const swap = (x: THREE.Material) => {
        if (!(x instanceof THREE.MeshStandardMaterial) || !['White', 'Silver', 'Metal', 'Grey'].includes(x.name)) return x
        let m = cache.get(x)
        if (!m) {
          const c = x.clone()
          const metal = x.name === 'Silver' ? 1 : 0
          c.onBeforeCompile = (shader) => patchSkin(shader, metal)
          c.customProgramCacheKey = () => `skin-${metal}`
          cache.set(x, c)
          made.push(c)
          m = c
        }
        return m
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
    })
  }
  return { made: new Set(made), dispose: () => made.forEach((m) => m.dispose()) }
}

/**
 * 第3段（S-IVB）のお尻。本物は、第2段との間の広がった筒（段間部）が第2段といっしょに離れると、
 * 中から J-2 エンジン 1 基・それを支える円すいの梁・液体酸素タンクの丸い底が見える。
 * engine は段間部が離れたあとだけ見せる（外の黒い帯の白い APS の箱は glb にある）。
 */
export function s4bAft() {
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const mat = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(p)
    mats.push(m)
    return m
  }
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D) => {
    geos.push(g)
    const o = new THREE.Mesh(g, m)
    parent.add(o)
    return o
  }
  const lathe = (pts: [number, number][], seg = 64) => new THREE.LatheGeometry(pts.map(([y, r]) => new THREE.Vector2(r, y)), seg)

  // ノズル：冷やすための細い管を何百本も並べて作ってあり、黒く焼けた金属。管の並びが縦の細い筋に見える（平らな面を細かく並べて出す）
  const nozzle = mat({ color: '#2b2c2f', metalness: 0.75, roughness: 0.42, side: THREE.DoubleSide, flatShading: true })
  const steel = mat({ color: '#8d9096', metalness: 0.7, roughness: 0.35 })
  const foil = mat({ color: '#b39a62', metalness: 0.8, roughness: 0.38 })
  const struct = mat({ color: '#5d6064', metalness: 0.45, roughness: 0.55, side: THREE.DoubleSide, flatShading: true })
  const dome = mat({ color: '#9a9b98', metalness: 0.2, roughness: 0.7, side: THREE.DoubleSide })
  const skirt = mat({ color: '#1d1e20', metalness: 0.1, roughness: 0.8, side: THREE.BackSide })

  const engine = new THREE.Group()
  engine.name = 'S4bEngine'
  // ノズル（口の直径 2 m、のどから口まで 1.9 m）：のどからふくらんで広がる、ベルの形
  const bell: [number, number][] = []
  for (let i = 0; i <= 16; i++) {
    const k = i / 16
    bell.push([68.85 - 1.95 * k, 0.24 + 0.74 * Math.pow(k, 0.62)])
  }
  mesh(lathe(bell, 160), nozzle, engine)
  // ノズルの補強の輪（ハットバンド）
  for (const [y, r] of [
    [68.0, 0.71],
    [67.45, 0.85],
  ]) {
    const g = new THREE.TorusGeometry(r + 0.02, 0.025, 6, 64)
    g.rotateX(Math.PI / 2)
    g.translate(0, y, 0)
    mesh(g, steel, engine)
  }
  // 燃焼室と噴射器（のどの上）・首振りの台
  mesh(lathe([[68.85, 0.24], [69.0, 0.3], [69.45, 0.32], [69.6, 0.36], [69.75, 0.2], [69.95, 0.12], [69.95, 0.001]], 32), steel, engine)
  // ターボポンプ 2 つ（液体水素と液体酸素）と、燃料の太い管
  for (const [x, z, r, h] of [
    [0.62, 0.1, 0.2, 0.75],
    [-0.58, -0.2, 0.17, 0.6],
  ]) {
    const g = new THREE.CylinderGeometry(r, r, h, 20)
    g.translate(x, 69.35, z)
    mesh(g, steel, engine)
    const duct = new THREE.CylinderGeometry(0.07, 0.07, 0.9, 10)
    duct.rotateZ(Math.sign(x) * 0.9)
    duct.translate(x * 0.55, 69.1, z)
    mesh(duct, foil, engine)
  }
  // ポンプの間の、熱よけの金色の箔（ガス発生器）
  {
    const g = new THREE.SphereGeometry(0.16, 16, 10)
    g.translate(0.1, 69.55, 0.45)
    mesh(g, foil, engine)
  }
  // エンジンを支える円すいの梁（縦の補強の筋は、平らな面を並べて出す）
  mesh(lathe([[69.95, 0.45], [71.3, 1.95]], 24), struct, engine)
  // 液体酸素タンクの丸い底（外は白っぽい灰色の断熱）と、黒い帯の内側
  const dPts: [number, number][] = []
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2)
    dPts.push([70.35 + (1 - Math.cos(a)) * 1.9, Math.sin(a) * 3.26])
  }
  mesh(lathe(dPts, 64), dome, engine)
  mesh(lathe([[70.0, 3.28], [72.3, 3.28]], 64), skirt, engine)

  return { engine, dispose: () => (geos.forEach((g) => g.dispose()), mats.forEach((m) => m.dispose())) }
}
