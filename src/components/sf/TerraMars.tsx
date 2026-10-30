import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { textureUrl } from '../../data/textures'
import { useOptionalTexture } from '../../hooks/useOptionalTexture'
import { useLayout } from '../../state/useLayout'
import { useTerra } from '../../data/sf'

// テラフォーミングした火星（SF モードだけ）。本物の火星の地図をもとに、
// 北の低地（北半球の大きな平原）と大きな盆地（ヘラス・アルギル）を海にし、陸を緑と茶色に、雲と青い大気を足す。
// 本物の火星の表面の上に一回り大きな球をかぶせて描くので、本物の火星の描き方は変えない。

/** 地図の経度・緯度（度）と半径（度）の、海にする盆地 */
const BASINS: [number, number, number][] = [
  [70, -42, 17], // ヘラス盆地
  [-43, -50, 9], // アルギル盆地
  [88, 13, 7], // イシディス盆地
]

const rng = (seed: number) => {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** なめらかなでこぼこ（経度・緯度の上の、簡単な重ね合わせ） */
function wave(lon: number, lat: number, seed: number) {
  const r = rng(seed)
  let v = 0
  for (let i = 0; i < 5; i++) {
    const f = 1 + i * 1.7
    v += Math.sin((lon * f) / 57.3 + r() * 6) * Math.cos((lat * f * 1.3) / 57.3 + r() * 6) / (i + 1)
  }
  return v
}

/** 本物の火星の地図から、海と緑のある火星の地図を作る */
function terraform(image: CanvasImageSource) {
  const W = 1024
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(image, 0, 0, W, H)
  const img = g.getImageData(0, 0, W, H)
  const d = img.data
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 360 - 180
      const i = (y * W + x) * 4
      const r0 = d[i] / 255
      const g0 = d[i + 1] / 255
      const b0 = d[i + 2] / 255
      const lum = 0.3 * r0 + 0.59 * g0 + 0.11 * b0
      // 海岸線：北の低地は北緯30度あたりから。経度で上下させて、入り江のある海岸にする
      let depth = lat - (32 + 9 * wave(lon, 0, 3))
      for (const [blon, blat, br] of BASINS) {
        const dl = Math.min(Math.abs(lon - blon), 360 - Math.abs(lon - blon)) * Math.cos((lat * Math.PI) / 180)
        depth = Math.max(depth, br - Math.hypot(dl, lat - blat))
      }
      let r: number, gg: number, b: number
      if (Math.abs(lat) > 80) {
        // 極の氷
        r = gg = 0.93
        b = 0.97
      } else if (depth > 0) {
        // 海：岸に近いほど浅く明るい
        const k = Math.min(1, depth / 10)
        r = 0.05 + 0.08 * (1 - k)
        gg = 0.18 + 0.25 * (1 - k)
        b = 0.38 + 0.2 * (1 - k)
      } else {
        // 陸：赤道から中緯度は草と森、暗い（もとは低い）ところほど緑が濃い。明るい高地は茶色の荒れ地のまま
        const wet = THREE.MathUtils.clamp(1 - Math.abs(lat) / 65 + 0.25 * wave(lon, lat, 11) + (depth > -6 ? 0.35 : 0), 0, 1)
        const green = THREE.MathUtils.clamp(wet * (1.25 - lum * 1.4), 0, 1)
        r = THREE.MathUtils.lerp(r0 * 0.85, 0.22 + lum * 0.2, green)
        gg = THREE.MathUtils.lerp(g0 * 0.8, 0.38 + lum * 0.25, green)
        b = THREE.MathUtils.lerp(b0 * 0.75, 0.16 + lum * 0.1, green)
      }
      d[i] = r * 255
      d[i + 1] = gg * 255
      d[i + 2] = b * 255
    }
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** 雲（白い筋とかたまり） */
function cloudTexture() {
  const W = 1024
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const rand = rng(77)
  for (let i = 0; i < 140; i++) {
    const y = H * (0.12 + rand() * 0.76)
    const x = rand() * W
    const w = 10 + rand() * 60
    const grad = g.createRadialGradient(x, y, 0, x, y, w)
    grad.addColorStop(0, `rgba(255,255,255,${0.06 + rand() * 0.12})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.save()
    g.translate(x, y)
    g.scale(2.2, 0.6)
    g.translate(-x, -y)
    g.fillRect(x - w, y - w, w * 2, w * 2)
    g.restore()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

/** 縁が青く光る大気（視線が大気を斜めに通るところほど明るい） */
function atmosphereMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: { uColor: { value: new THREE.Color(0.35, 0.6, 1.0) } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <logdepthbuf_fragment>
        float rim = pow(1.0 - abs(dot(vN, vV)), 3.0);
        gl_FragColor = vec4(uColor * rim * 0.9, rim);
      }`,
  })
}

/** 火星の自転する部分（PlanetBody の mars-spin）の中にかぶせる */
export function TerraMars() {
  const { scene } = useThree()
  const [spin, setSpin] = useState<THREE.Object3D | null>(null)
  useEffect(() => {
    if (spin) return
    const find = () => setSpin(scene.getObjectByName('mars-spin') ?? null)
    find()
    const id = window.setInterval(find, 500)
    return () => window.clearInterval(id)
  }, [scene, spin])
  const radius = useLayout().radius.get('mars') ?? 1
  const real = useOptionalTexture(textureUrl('mars'))
  const on = useTerra((s) => s.on)
  const parts = useMemo(() => ({ clouds: cloudTexture(), air: atmosphereMaterial() }), [])
  const surface = useMemo(() => (real?.image ? terraform(real.image as CanvasImageSource) : null), [real])
  useEffect(() => () => surface?.dispose(), [surface])
  useEffect(
    () => () => {
      parts.clouds.dispose()
      parts.air.dispose()
    },
    [parts],
  )
  const clouds = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    if (clouds.current) clouds.current.rotation.y += Math.min(dt, 0.05) * 0.01
  })
  if (!spin || !surface || !on) return null
  return createPortal(
    <group>
      <mesh>
        <sphereGeometry args={[radius * 1.004, 128, 96]} />
        {/* 太陽の光が強いので、地図の色が白くとばないよう少し暗く */}
        <meshStandardMaterial map={surface} color="#8c8c8c" roughness={0.9} metalness={0} />
      </mesh>
      <mesh ref={clouds}>
        <sphereGeometry args={[radius * 1.012, 96, 64]} />
        <meshStandardMaterial map={parts.clouds} transparent opacity={0.5} depthWrite={false} roughness={1} />
      </mesh>
      <mesh material={parts.air}>
        <sphereGeometry args={[radius * 1.06, 64, 48]} />
      </mesh>
    </group>,
    spin,
  )
}
