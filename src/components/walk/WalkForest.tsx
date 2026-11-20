import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { seeded } from '../sf/batch'
import { currentLevel, lowMemory } from '../../state/quality'
import { isTouchDevice } from '../../state/input'
import { GROUND_LIFT, landPoint, upAt } from './park'
import { standAt } from './WalkWorld'
import { SAMPLE, SAMPLE_CENTER, SAMPLE_PATH, forestSample, kitLift, type KitName, type Spot } from './forestSample'
import { forestTrees } from './forestTree'

// 「本格的な森」の見本の一角（?forest=sample のときだけ出る。置き場所は forestSample.ts）。
// ・植物と小物：本物をスキャンした形（public/models/forest-kit.glb、Poly Haven CC0）を、種類ごとに並べる
// ・高い木：幹と枝はその場で作り（forestTree.ts）、樹皮は写真、葉は本物の木の枝先を撮った絵の板
// ・地面：落ち葉・苔・ぬれた土の写真を混ぜた床を、今の地面の上に 1 枚重ねる。植物の根元は暗くする
// ・光：木もれ日は「動く模様の絵 1 枚」を日の向きに沿って落とす（葉の影は計算しない）。葉は日を透かして明るくなる
// 読み込むのは、このファイルが使われたとき（お試しを付けて歩く場面に入ったとき）だけ。

const BASE = import.meta.env.BASE_URL
/** 日の向き（WalkWorld の Lights と同じ）：見本の一角の x = 東、y = 上、z = 北 */
const SUN = new THREE.Vector3(Math.sin(0.6), Math.cos(0.6), 0.25).normalize()
/** 床を、歩く地面よりどれだけ上に重ねるか m */
const FLOOR_LIFT = 0.035
/** 床の、範囲の外へのはみ出し m（ふちをまだらに溶かす） */
const FLOOR_PAD = 3

/* ---------- 光の模様（木もれ日）と、根元の暗がりの絵 ---------- */

/** R = 木もれ日（明るい丸の集まり。くり返せる）、G = なだらかなまだら（苔の出方・ふちの崩し方に使う） */
function cookieTexture() {
  const N = 512
  const layer = (draw: (g: CanvasRenderingContext2D, wrap: (x: number, y: number, f: (x: number, y: number) => void) => void) => void, blur: number) => {
    const c = document.createElement('canvas')
    c.width = c.height = N
    const g = c.getContext('2d')!
    g.fillStyle = '#000'
    g.fillRect(0, 0, N, N)
    g.globalCompositeOperation = 'lighter'
    // はしにかかる丸は、反対側にも描く（くり返したときに、つなぎ目が出ないように）
    draw(g, (x, y, f) => {
      for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) f(x + dx, y + dy)
    })
    const out = document.createElement('canvas')
    out.width = out.height = N
    const o = out.getContext('2d')!
    o.filter = `blur(${blur}px)`
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) o.drawImage(c, dx, dy)
    return o.getImageData(0, 0, N, N).data
  }
  const rand = seeded(97)
  const blob = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, a: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(rot)
    g.scale(1, ry / rx)
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx)
    grad.addColorStop(0, `rgba(255,255,255,${a})`)
    grad.addColorStop(0.55, `rgba(255,255,255,${a * 0.7})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(0, 0, rx, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  // 木もれ日：樹冠のすき間ごとに、大小の丸がかたまって落ちる
  const sun = layer((g, wrap) => {
    for (let i = 0; i < 40; i++) {
      const cx = rand() * N
      const cy = rand() * N
      const n = 2 + Math.floor(rand() * 6)
      for (let j = 0; j < n; j++) {
        const r = 8 + rand() * 30
        const x = cx + (rand() - 0.5) * 90
        const y = cy + (rand() - 0.5) * 90
        const rot = rand() * Math.PI
        const k = 0.6 + rand() * 0.4
        const a = 0.55 + rand() * 0.45
        wrap(x, y, (px, py) => blob(g, px, py, r, r * k, rot, a))
      }
    }
  }, 2.2)
  const soft = layer((g, wrap) => {
    for (let i = 0; i < 90; i++) {
      const r = 30 + rand() * 60
      const x = rand() * N
      const y = rand() * N
      const a = 0.12 + rand() * 0.2
      wrap(x, y, (px, py) => blob(g, px, py, r, r, 0, a))
    }
  }, 6)
  const data = new Uint8Array(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = sun[i * 4]
    data[i * 4 + 1] = soft[i * 4]
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

/** 根元の暗がり：床の範囲（はみ出しを含む）を上から見た絵。白いほど暗くする */
function shadeTexture(shade: { s: number; y: number; r: number; a: number }[]) {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, N, N)
  g.globalCompositeOperation = 'lighter'
  const span = SAMPLE.s1 - SAMPLE.s0 + FLOOR_PAD * 2
  const k = N / span
  for (const b of shade) {
    const x = (b.s - SAMPLE.s0 + FLOOR_PAD) * k
    // 絵は上が北（床の uv の v が北へ増える。flipY はしない）
    const y = (b.y - SAMPLE.y0 + FLOOR_PAD) * k
    const r = Math.max(2, b.r * k)
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(255,255,255,${b.a})`)
    grad.addColorStop(0.6, `rgba(255,255,255,${b.a * 0.55})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.flipY = false
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

/* ---------- 材質 ---------- */

type Shared = {
  uFTime: { value: number }
  uFCookie: { value: THREE.Texture }
  uFOrigin: { value: THREE.Vector3 }
  uFEast: { value: THREE.Vector3 }
  uFUp: { value: THREE.Vector3 }
  uFNorth: { value: THREE.Vector3 }
}
type Kind = 'leaf' | 'canopy' | 'bark' | 'prop' | 'floor'

const V_PARS = /* glsl */ `
uniform vec3 uFOrigin;
uniform vec3 uFEast;
uniform vec3 uFUp;
uniform vec3 uFNorth;
uniform float uFTime;
uniform float uFSway;
varying vec3 vForest;
#ifdef FOREST_SWAY_ATTR
attribute vec2 aSway;
#endif`

/** 風のゆれ：株ごと・板ごとに位相をずらして、ゆっくり揺らす */
const V_WIND = /* glsl */ `
#ifdef FOREST_WIND
{
  float fPh = 0.0;
  #ifdef USE_INSTANCING
  fPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
  #endif
  float fAmp = uFSway * max(0.0, transformed.y) * (0.4 + length(transformed.xz));
  transformed.x += sin(uFTime * 1.3 + fPh + transformed.y * 2.0) * fAmp;
  transformed.z += sin(uFTime * 1.7 + fPh * 1.3 + transformed.x * 2.5) * fAmp * 0.7;
}
#endif
#ifdef FOREST_SWAY_ATTR
transformed.x += sin(uFTime * 0.9 + aSway.x) * aSway.y;
transformed.z += cos(uFTime * 0.7 + aSway.x * 1.7) * aSway.y;
transformed.y += sin(uFTime * 1.1 + aSway.x * 2.3) * aSway.y * 0.5;
#endif`

/** 見本の一角の中での位置（x = 東、y = 高さ、z = 北。m） */
const V_MAIN = /* glsl */ `
{
  vec4 fW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  fW = instanceMatrix * fW;
  #endif
  fW = modelMatrix * fW;
  vec3 fR = fW.xyz - uFOrigin;
  vForest = vec3(dot(fR, uFEast), dot(fR, uFUp), dot(fR, uFNorth));
}`

const F_PARS = /* glsl */ `
uniform sampler2D uFCookie;
uniform float uFTime;
varying vec3 vForest;
// 木もれ日：その点から日の向きに沿って地面まで下ろした場所の、光の模様を読む（幹や葉の上でも、光の筋がつながる）
float forestDapple() {
  vec2 g = vForest.xz - vForest.y * vec2(${(SUN.x / SUN.y).toFixed(4)}, ${(SUN.z / SUN.y).toFixed(4)});
  vec2 w = vec2(sin(uFTime * 0.6 + g.y * 0.21), cos(uFTime * 0.47 + g.x * 0.17)) * 0.14;
  float a = texture2D(uFCookie, (g + w) / 13.0).r;
  float b = texture2D(uFCookie, (g.yx - w * 0.7) / 5.3 + 0.37).r;
  float d = clamp(a * (0.55 + 0.9 * b) * 1.5, 0.0, 1.0);
  // 樹冠の上は日なた
  return mix(d, 1.0, smoothstep(13.0, 21.0, vForest.y));
}`

/** 写真の色の明るさ合わせと、樹皮の根元の苔 */
const F_BARK = /* glsl */ `
#ifdef FOREST_GAIN
// 写真から取った色は、本物どおりに暗い。このアプリの光（公園の木や芝と同じ光）で同じ明るさに見えるように持ち上げる
diffuseColor.rgb *= FOREST_GAIN;
#endif
#ifdef FOREST_MOSS
{
  float fN = texture2D(uFCookie, vForest.xz * 0.23 + vForest.y * 0.11).g + texture2D(uFCookie, vForest.zy * 0.9).g * 0.5;
  float fM = smoothstep(4.5, 0.3, vForest.y) * smoothstep(0.3, 0.75, fN);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.85, 0.3) + vec3(0.012, 0.03, 0.0), fM * 0.85);
}
#endif`

const F_LIGHT = /* glsl */ `
{
  float fD = forestDapple();
  // 樹冠の下 = 1、樹冠の上 = 0
  float fIn = 1.0 - smoothstep(9.0, 20.0, vForest.y);
  // 日の光：木もれ日の外にも、葉を透けてきた弱い光が残る
  float fSun = mix(1.0, mix(0.2, 1.15, fD), fIn);
  reflectedLight.directDiffuse *= fSun;
  #ifdef FOREST_SPEC
  reflectedLight.directSpecular *= fSun;
  #endif
  // 空からの光は、樹冠を抜けるあいだに葉の色（黄緑）がかかる
  reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(0.8, 0.98, 0.66), fIn);
  #if defined( FOREST_LEAF ) && NUM_DIR_LIGHTS > 0
  // 葉は日を透かす：裏から日が当たった葉は、黄緑に明るくなる
  float fBack = saturate( dot( -normal, directionalLights[ 0 ].direction ) );
  float fToSun = pow( saturate( dot( -geometryViewDir, directionalLights[ 0 ].direction ) ), 3.0 );
  reflectedLight.directDiffuse += directionalLights[ 0 ].color * BRDF_Lambert( diffuseColor.rgb * vec3( 0.85, 1.0, 0.35 ) ) * ( fBack * 0.9 + fToSun * 0.4 ) * fSun;
  #endif
}`

function patch<T extends THREE.Material>(mat: T, kind: Kind, shared: Shared, defines: Record<string, string>, sway = 0, extra?: (sh: THREE.WebGLProgramParametersWithUniforms) => void) {
  const own = { uFSway: { value: sway } }
  mat.defines = { ...(mat.defines ?? {}), ...defines }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, own)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${V_PARS}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${V_WIND}`).replace('#include <project_vertex>', `#include <project_vertex>\n${V_MAIN}`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${F_PARS}`).replace('#include <color_fragment>', `#include <color_fragment>\n${F_BARK}`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${F_LIGHT}`)
    extra?.(sh)
  }
  mat.customProgramCacheKey = () => `forest-${kind}-${Object.entries(defines).map(([k, v]) => k + v).sort().join('.')}`
  return mat
}

/* ---------- 読み込み ---------- */

/** glb の形は量子化してあるので、部品の拡大・移動を形に焼きこんで、ふつうの数に戻す */
function unpack(m: THREE.Mesh) {
  const geo = new THREE.BufferGeometry()
  for (const [name, attr] of Object.entries(m.geometry.attributes)) {
    const src = attr as THREE.BufferAttribute
    const size = name === 'color' ? 3 : src.itemSize
    const arr = new Float32Array(src.count * size)
    const get = [src.getX, src.getY, src.getZ, src.getW].map((f) => f.bind(src))
    for (let i = 0; i < src.count; i++) for (let k = 0; k < size; k++) arr[i * size + k] = get[k](i)
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size))
  }
  geo.setIndex(m.geometry.index)
  m.updateWorldMatrix(true, false)
  geo.applyMatrix4(m.matrixWorld)
  geo.computeBoundingSphere()
  m.geometry.dispose()
  return geo
}

type Made = { objects: THREE.Object3D[]; dispose: () => void }

async function build(shared: Shared): Promise<Made> {
  const level = currentLevel()
  // 高画質：葉のつや・凹凸あり。スマホ・軽い画質：画像は半分の大きさ
  const fine = level === 'high' && !lowMemory() && !isTouchDevice()
  const half = lowMemory() || isTouchDevice() || level === 'low'
  const shadows = level !== 'low' && !lowMemory()
  const F = forestSample()
  const loader = new THREE.TextureLoader()
  const textures: THREE.Texture[] = []
  const tex = async (name: string, opts: { color?: boolean; repeat?: boolean; small?: boolean } = {}) => {
    const t = await loader.loadAsync(`${BASE}textures/forest/${name}${half && opts.small !== false ? '.half' : ''}.webp`)
    t.flipY = false
    if (opts.color !== false) t.colorSpace = THREE.SRGBColorSpace
    if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = half ? 2 : 8
    textures.push(t)
    return t
  }
  const names = ['fern', 'calathea', 'anthurium', 'pachira_leaves', 'pachira_bark', 'roots', 'stump', 'log', 'rock', 'canopy'] as const
  const [{ GLTFLoader }, { MeshoptDecoder }, maps, bark, floorLeaves, floorMoss, floorMud, normals] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    Promise.all(names.map((n) => tex(n))),
    tex('bark', { repeat: true }),
    tex('floor_leaves', { repeat: true }),
    tex('floor_moss', { repeat: true }),
    tex('floor_mud', { repeat: true }),
    fine ? Promise.all(['fern_n', 'calathea_n', 'anthurium_n', 'pachira_leaves_n', 'bark_n'].map((n) => tex(n, { color: false, repeat: n === 'bark_n', small: false }))) : Promise.resolve(null),
  ])
  const map = Object.fromEntries(names.map((n, i) => [n, maps[i]])) as Record<(typeof names)[number], THREE.Texture>
  const gl = new GLTFLoader()
  gl.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await gl.loadAsync(`${BASE}models/forest-kit.glb`)
  const geos = new Map<string, THREE.BufferGeometry>()
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) geos.set(m.name, unpack(m))
  })

  const materials: THREE.Material[] = []
  const FLIP = new THREE.Vector2(1, -1)
  /** 葉：高画質はつやと凹凸あり。切り抜きのふちは、なめらかにする（アンチエイリアスがあるとき） */
  const leaf = (m: THREE.Texture, normal: THREE.Texture | null, sway: number) => {
    const base = { map: m, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, alphaToCoverage: fine }
    const mat = normal ? new THREE.MeshPhongMaterial({ ...base, normalMap: normal, normalScale: FLIP, specular: new THREE.Color(0.2, 0.22, 0.18), shininess: 34 }) : new THREE.MeshLambertMaterial(base)
    materials.push(mat)
    return patch(mat, 'leaf', shared, { FOREST_GAIN: '2.4', FOREST_LEAF: '', FOREST_WIND: '', ...(normal ? { FOREST_SPEC: '' } : {}) }, sway)
  }
  const solid = (m: THREE.Texture, kind: Kind = 'prop', defines: Record<string, string> = {}, more: THREE.MeshLambertMaterialParameters = {}) => {
    const mat = new THREE.MeshLambertMaterial({ map: m, side: THREE.DoubleSide, ...more })
    materials.push(mat)
    return patch(mat, kind, shared, defines)
  }
  const mats = {
    fern: leaf(map.fern, normals?.[0] ?? null, 0.03),
    calathea: leaf(map.calathea, normals?.[1] ?? null, 0.022),
    anthurium: leaf(map.anthurium, normals?.[2] ?? null, 0.016),
    pachiraLeaves: leaf(map.pachira_leaves, normals?.[3] ?? null, 0.012),
    pachiraBark: solid(map.pachira_bark, 'prop', { FOREST_GAIN: '2.0' }),
    roots: solid(map.roots, 'prop', { FOREST_GAIN: '1.6', FOREST_MOSS: '' }),
    stump: solid(map.stump, 'prop', { FOREST_GAIN: '1.7' }),
    log: solid(map.log, 'prop', { FOREST_GAIN: '1.7' }),
    rock: solid(map.rock, 'prop', { FOREST_GAIN: '1.9' }),
  }

  const objects: THREE.Object3D[] = []
  const m4 = new THREE.Matrix4()
  const col = new THREE.Color()
  /** 部品を、置き場所の数だけ並べる */
  const stand = (geoName: string, mat: THREE.Material, spots: Spot[], lift: number, cast: boolean, tint: boolean) => {
    const geo = geos.get(geoName)
    if (!geo || !spots.length) return
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length)
    spots.forEach((p, i) => {
      mesh.setMatrixAt(i, standAt(p.s, p.y, lift * p.k + (p.h ?? 0), p.yaw, p.k, m4))
      // 株ごとに、色を少しずつ変える
      const b = tint ? 0.86 + p.v * 0.26 : 0.9 + p.v * 0.16
      mesh.setColorAt(i, tint ? col.setRGB(b * (0.9 + ((p.v * 7) % 1) * 0.16), b, b * (0.84 + ((p.v * 13) % 1) * 0.2)) : col.setRGB(b, b, b))
    })
    mesh.castShadow = cast && shadows
    mesh.receiveShadow = true
    mesh.name = `forest-${geoName}`
    mesh.computeBoundingSphere()
    objects.push(mesh)
  }
  const K = F.kit
  const plants: [KitName, THREE.Material][] = [
    ['fern_a', mats.fern],
    ['fern_b', mats.fern],
    ['calathea_a', mats.calathea],
    ['calathea_b', mats.calathea],
    ['calathea_c', mats.calathea],
    ['anthurium_a', mats.anthurium],
    ['anthurium_b', mats.anthurium],
    ['anthurium_c', mats.anthurium],
  ]
  for (const [n, mat] of plants) stand(n, mat, K[n], kitLift(n), false, true)
  for (const n of ['pachira_a', 'pachira_b'] as const) {
    stand(`${n}_bark`, mats.pachiraBark, K[n], kitLift(n), true, false)
    stand(`${n}_leaves`, mats.pachiraLeaves, K[n], kitLift(n), false, true)
  }
  stand('roots', mats.roots, K.roots, kitLift('roots'), false, false)
  stand('stump', mats.stump, K.stump, kitLift('stump'), true, false)
  stand('log', mats.log, K.log, kitLift('log'), true, false)
  stand('rock_a', mats.rock, K.rock_a, kitLift('rock_a'), true, false)
  stand('rock_b', mats.rock, K.rock_b, kitLift('rock_b'), true, false)

  // 高い木と若木：幹・枝・つる（1 つの形）と、葉の房（1 つの形）
  const trees = forestTrees(F.tall, F.poles, SAMPLE_CENTER)
  const frame = standAt(SAMPLE_CENTER.s, SAMPLE_CENTER.y, 0, 0, 1, new THREE.Matrix4())
  const barkMat = solid(bark, 'bark', { FOREST_GAIN: '2.0', FOREST_MOSS: '' }, { vertexColors: true, side: THREE.FrontSide, ...(normals ? { normalMap: normals[4], normalScale: FLIP } : {}) })
  const canopyMat = new THREE.MeshLambertMaterial({ map: map.canopy, alphaTest: 0.3, side: THREE.DoubleSide, vertexColors: true, alphaToCoverage: fine, color: new THREE.Color(0.78, 1, 0.66) })
  materials.push(canopyMat)
  patch(canopyMat, 'canopy', shared, { FOREST_GAIN: '2.1', FOREST_LEAF: '', FOREST_SWAY_ATTR: '' })
  const wood = new THREE.Mesh(trees.wood, barkMat)
  wood.castShadow = shadows
  const crown = new THREE.Mesh(trees.leaves, canopyMat)
  for (const m of [wood, crown]) {
    m.matrixAutoUpdate = false
    m.matrix.copy(frame)
    m.receiveShadow = true
    objects.push(m)
  }
  wood.name = 'forest-wood'
  crown.name = 'forest-crown'

  // 床：落ち葉・苔・ぬれた土。今の地面のすぐ上に重ねて、ふちはまだらに溶かす
  const shade = shadeTexture(F.shade)
  textures.push(shade)
  const seg = 18
  const fg = new THREE.PlaneGeometry(1, 1, seg, seg)
  {
    const pos = fg.attributes.position as THREE.BufferAttribute
    const nor = fg.attributes.normal as THREE.BufferAttribute
    const uv = fg.attributes.uv as THREE.BufferAttribute
    const span = SAMPLE.s1 - SAMPLE.s0 + FLOOR_PAD * 2
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      const fs = (pos.getX(i) + 0.5) * span - FLOOR_PAD
      const fy = (pos.getY(i) + 0.5) * span - FLOOR_PAD
      landPoint(SAMPLE.s0 + fs, SAMPLE.y0 + fy, GROUND_LIFT + FLOOR_LIFT, p)
      upAt(SAMPLE.s0 + fs, n)
      pos.setXYZ(i, p.x, p.y, p.z)
      nor.setXYZ(i, n.x, n.y, n.z)
      // uv = 範囲の南西の角からの m
      uv.setXY(i, fs, fy)
    }
    // PlaneGeometry の面は +z 向きなので、円筒の内側（上）から見えるように面の向きを返す
    const idx = fg.index!
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1)
      idx.setX(i + 1, idx.getX(i + 2))
      idx.setX(i + 2, a)
    }
    fg.computeBoundingSphere()
  }
  const floorMat = new THREE.MeshLambertMaterial({ map: floorLeaves, transparent: true })
  materials.push(floorMat)
  const floorU = { uFMoss: { value: floorMoss }, uFMud: { value: floorMud }, uFShade: { value: shade } }
  patch(floorMat, 'floor', shared, {}, 0, (sh) => {
    Object.assign(sh.uniforms, floorU)
    const size = (SAMPLE.s1 - SAMPLE.s0).toFixed(1)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uFMoss;\nuniform sampler2D uFMud;\nuniform sampler2D uFShade;').replace(
      '#include <map_fragment>',
      /* glsl */ `
vec2 fp = vMapUv;
float n1 = texture2D(uFCookie, fp / 7.3 + 0.11).g;
float n2 = texture2D(uFCookie, fp / 23.0 + 0.53).g;
// 落ち葉：2 つの大きさで重ねて、くり返しを目立たなくする
vec3 fLit = mix(texture2D(map, fp / 2.6).rgb, texture2D(map, fp.yx / 6.7 + 0.31).rgb, 0.35);
vec3 fMoss = texture2D(uFMoss, fp / 2.3).rgb;
vec3 fMud = texture2D(uFMud, fp / 2.4).rgb;
// 根元の暗がり（1 = 暗い）。暗く湿った所ほど苔が出る
float fSh = texture2D(uFShade, (fp + ${FLOOR_PAD.toFixed(1)}) / ${(SAMPLE.s1 - SAMPLE.s0 + FLOOR_PAD * 2).toFixed(1)}).r;
float wMoss = smoothstep(0.38, 0.72, n2 * 0.9 + n1 * 0.35 + fSh * 0.4);
vec3 fCol = mix(fLit, fMoss * vec3(0.8, 0.95, 0.7), wMoss * 0.8);
// 小道：踏まれて落ち葉の少ない、ぬれた土
float fPd = abs(fp.x - ${(SAMPLE_PATH.s - SAMPLE.s0).toFixed(1)}) + (n1 - 0.4) * 0.9;
float wPath = 1.0 - smoothstep(${(SAMPLE_PATH.half * 0.7).toFixed(2)}, ${(SAMPLE_PATH.half * 1.35).toFixed(2)}, fPd);
fCol = mix(fCol, mix(fMud * 3.2, fLit * 0.8, 0.45), wPath * 0.9);
fCol *= 1.0 - 0.62 * fSh;
diffuseColor.rgb *= fCol * 1.25;
// ふち：まだらに崩して、今の地面へ溶かす
vec2 fE = min(fp, ${size} - fp);
diffuseColor.a *= smoothstep(-2.2, 1.2, min(fE.x, fE.y) + (n1 - 0.45) * 3.5 + (n2 - 0.45) * 2.0);`,
    )
  })
  const floor = new THREE.Mesh(fg, floorMat)
  floor.receiveShadow = true
  floor.renderOrder = 1
  floor.name = 'forest-floor'
  objects.push(floor)

  return {
    objects,
    dispose: () => {
      for (const o of objects) {
        const m = o as THREE.Mesh
        if (m instanceof THREE.InstancedMesh) m.dispose()
      }
      for (const g of geos.values()) g.dispose()
      trees.wood.dispose()
      trees.leaves.dispose()
      fg.dispose()
      for (const m of materials) m.dispose()
      for (const t of textures) t.dispose()
    },
  }
}

export default function WalkForest() {
  const group = useRef<THREE.Group>(null!)
  const shared = useMemo<Shared>(() => {
    const frame = standAt(SAMPLE_CENTER.s, SAMPLE_CENTER.y, 0, 0, 1, new THREE.Matrix4())
    const east = new THREE.Vector3()
    const up = new THREE.Vector3()
    const north = new THREE.Vector3()
    frame.extractBasis(east, up, north)
    return {
      uFTime: { value: 0 },
      uFCookie: { value: cookieTexture() },
      uFOrigin: { value: new THREE.Vector3().setFromMatrixPosition(frame) },
      uFEast: { value: east },
      uFUp: { value: up },
      uFNorth: { value: north },
    }
  }, [])
  useEffect(() => {
    let dead = false
    let made: Made | null = null
    build(shared)
      .then((m) => {
        if (dead) return m.dispose()
        made = m
        group.current?.add(...m.objects)
      })
      .catch((e) => console.error('[walk] forest sample failed', e))
    return () => {
      dead = true
      if (made) {
        for (const o of made.objects) o.removeFromParent()
        made.dispose()
      }
      shared.uFCookie.value.dispose()
    }
  }, [shared])
  useFrame(({ clock }) => {
    shared.uFTime.value = clock.elapsedTime
  })
  return <group ref={group} />
}
