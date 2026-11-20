import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { PLANETS, SUN } from '../data/bodies'
import { textureUrl } from '../data/textures'
import { EVEREST_KM, PICKS, across, lineup, type Item } from '../data/sizeCompare'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { closeSizeCompare, focusOn, togglePick, useSizeCompare } from '../state/sizeCompare'
import { playBeep } from '../audio/sfx'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'
import './sizeCompare.css'

// 大きさくらべ（A4）：いまの星と、地球・月・エベレストなどを本当の大きさの比で棚にならべる 3D の場面。
// 小さいものから左へならべ、下の端をそろえる。さわるとそれに寄り（カメラが飛ぶ）、もう一度で全体にもどる。
// 下のボタンで、ならべるものを足したり外したりできる

const nameOf = (id: string) => (id === 'everest' ? ui().sizeCompare.everest : ui().bodies[id]?.name ?? id)

function colorOf(id: string) {
  if (id === 'sun') return SUN.color
  for (const p of PLANETS) {
    if (p.id === id) return p.color
    const m = p.moons.find((x) => x.id === id)
    if (m) return m.color
  }
  return '#cccccc'
}

let sunMat: THREE.ShaderMaterial | null = null
/** 太陽の表面：細かいつぶつぶの模様と、ふちが暗くなる明るさ（一度だけ作る） */
function sunMaterial() {
  if (sunMat) return sunMat
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#ffb43a'
  g.fillRect(0, 0, 1024, 512)
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * 1024
    const y = Math.random() * 512
    const r = 0.6 + Math.random() * 1.8
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,232,150,${0.12 + Math.random() * 0.2})` : `rgba(200,96,20,${0.1 + Math.random() * 0.18})`
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  sunMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        float limb = 0.42 + 0.58 * pow(mu, 0.55);
        vec3 c = texture2D(map, vUv).rgb * limb * vec3(1.08, 1.0, 0.92);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  })
  return sunMat
}

/** 出てくるときの大きさ（0 → 少し大きく → 1） */
function pop(age: number) {
  if (age <= 0) return 0.0001
  const k = Math.min(1, age / 0.45)
  const back = 1.7
  const x = k - 1
  return Math.max(0.0001, 1 + (back + 1) * x * x * x + back * x * x)
}

/** エベレスト：すそ野の広い山。上のほうは雪で白い */
function useMountain() {
  return useMemo(() => {
    const g = new THREE.ConeGeometry(1, 1, 48, 12, false)
    g.translate(0, 0.5, 0)
    const pos = g.attributes.position as THREE.BufferAttribute
    const colors: number[] = []
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const h = v.y
      // すそを広げて、尾根のでこぼこを足す（上ほど細く）
      const a = Math.atan2(v.z, v.x)
      const ridge = 1 + 0.18 * Math.sin(a * 3 + 0.6) + 0.1 * Math.sin(a * 7 + 1.3)
      const spread = Math.pow(1 - h, 1.25)
      const r = Math.hypot(v.x, v.z)
      if (r > 1e-6) {
        const k = (spread * ridge) / r
        v.x *= k
        v.z *= k
      }
      pos.setXYZ(i, v.x, h, v.z)
      const snow = h > 0.72 + 0.06 * Math.sin(a * 5)
      const c = snow ? [0.93, 0.95, 0.98] : h > 0.3 ? [0.36, 0.33, 0.31] : [0.3, 0.3, 0.25]
      colors.push(...c)
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [])
}

function Thing({ item, index, isBody }: { item: Item; index: number; isBody: boolean }) {
  const group = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Mesh>(null!)
  const label = useRef<HTMLButtonElement>(null)
  const born = useRef(performance.now())
  const map = useOptionalTexture(item.kind === 'ball' ? textureUrl(item.id) : undefined)
  const mountain = useMountain()
  const { camera, size } = useThree()
  useLang()

  useFrame((_, dt) => {
    const age = (performance.now() - born.current) / 1000 - index * 0.28
    const s = pop(age)
    group.current.scale.setScalar(s)
    if (spin.current && item.kind === 'ball') spin.current.rotation.y += dt * 0.15
    // 名札：画面で小さすぎるものは、印だけ（ずらして重ならないように）
    const el = label.current
    if (!el) return
    const cam = camera as THREE.PerspectiveCamera
    const dist = cam.position.distanceTo(group.current.position)
    const px = (item.height / (2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))) * size.height
    el.classList.toggle('tiny', px < 14)
    el.style.setProperty('--stack', String(px < 14 ? index : 0))
    el.style.opacity = age > 0.3 ? '1' : '0'
  })

  const color = colorOf(item.id)
  return (
    <group ref={group} position={[item.x, 0, 0]}>
      {item.kind === 'ball' ? (
        <mesh ref={spin} position={[0, item.height / 2, 0]} onClick={(e) => (e.stopPropagation(), focusOn(item.id))}>
          <sphereGeometry args={[item.height / 2, 64, 48]} />
          {item.id === 'sun' ? (
            <primitive object={sunMaterial()} attach="material" />
          ) : (
            <meshStandardMaterial key={map ? 'map' : 'color'} map={map} color={map ? '#ffffff' : color} roughness={1} />
          )}
        </mesh>
      ) : (
        <mesh geometry={mountain} scale={[item.width / 2, item.height, item.width / 2]} onClick={(e) => (e.stopPropagation(), focusOn(item.id))}>
          <meshStandardMaterial vertexColors roughness={1} flatShading />
        </mesh>
      )}
      <Html position={[0, 0, 0]} center zIndexRange={[20, 0]}>
        <button ref={label} className={`sc-label${isBody ? ' body' : ''}`} onClick={() => focusOn(item.id)}>
          <b>{nameOf(item.id)}</b>
          <span>{item.kind === 'mountain' ? ui().sizeCompare.height(EVEREST_KM) : ui().sizeCompare.diameter(item.height)}</span>
        </button>
      </Html>
    </group>
  )
}

/** カメラ：全体、またはさわったものが入るように、なめらかに寄ったり引いたりする */
function Rig({ items, focus }: { items: Item[]; focus: string | null }) {
  const { camera, size } = useThree()
  const cur = useRef<{ x: number; y: number; logD: number } | null>(null)
  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera
    const f = items.find((i) => i.id === focus)
    const last = items[items.length - 1]
    const left = items[0].x - items[0].width / 2
    const right = last.x + last.width / 2
    const big = Math.max(...items.map((i) => i.height))
    // 見せたい幅と高さ・まん中
    const pad = size.width / Math.max(120, size.width - 170)
    const w = f ? Math.max(f.width, f.height) * 3.2 : (right - left) * 1.04 * pad
    const h = f ? f.height * 2.6 : big * 1.9
    const cx = f ? f.x : (left + right) / 2
    // 下の文字とボタンのぶん、ものを少し上に見せる
    const cy = f ? f.height * 0.25 : big * 0.32
    const vt = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)
    const d = Math.max(w / (2 * vt * (size.width / size.height)), h / (2 * vt))
    if (!cur.current) cur.current = { x: cx, y: cy, logD: Math.log(d) }
    const c = cur.current
    const k = 1 - Math.exp(-dt * 3.2)
    c.logD += (Math.log(d) - c.logD) * k
    const dist = Math.exp(c.logD)
    // まん中は、近づくほどしっかり合わせる（遠いところの小さなずれは見えない）
    c.x += (cx - c.x) * k
    c.y += (cy - c.y) * k
    cam.position.set(c.x, c.y + dist * 0.12, dist)
    cam.lookAt(c.x, c.y, 0)
    cam.near = dist * 0.01
    cam.far = dist * 50
    cam.updateProjectionMatrix()
  })
  return null
}

function Stage({ id }: { id: string }) {
  const picks = useSizeCompare((s) => s.picks)
  const focus = useSizeCompare((s) => s.focus)
  const items = useMemo(() => lineup(id, picks), [id, picks])
  const t = ui().sizeCompare
  useLang()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.stopPropagation()
      if (useSizeCompare.getState().focus) focusOn(null)
      else closeSizeCompare()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // ならんでいく音（小さいものから）
  useEffect(() => {
    const timers = items.map((_, i) => setTimeout(() => playBeep(440 * Math.pow(1.26, i), 0.12), 120 + i * 280))
    return () => timers.forEach(clearTimeout)
  }, [items])

  // ひとこと：とても小さい星はエベレストと、ほかは地球（なければ最初に選んだもの）と
  const body = items.find((i) => i.id === id)!
  const ever = items.find((i) => i.id === 'everest')
  const other = items.find((i) => i.id === 'earth' && i.id !== id) ?? items.find((i) => i.id !== id && i.id !== 'everest')
  const caption = focus
    ? null
    : ever && body.height < 2000
      ? t.vsEverest(nameOf(id), body.height / EVEREST_KM)
      : other
        ? body.height >= other.height
          ? t.across(nameOf(id), nameOf(other.id), across(body, other))
          : t.across(nameOf(other.id), nameOf(id), across(other, body))
        : null

  return (
    <section className="size-compare" role="dialog" aria-label={t.title}>
      <Canvas className="sc-canvas" dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} camera={{ fov: 32, near: 0.01, far: 1e9, position: [0, 0, 10] }} onPointerMissed={() => useSizeCompare.getState().focus && focusOn(null)}>
        <ambientLight intensity={0.35} />
        <directionalLight position={[-0.6, 0.5, 1]} intensity={2.4} />
        {items.map((it, i) => (
          <Thing key={it.id} item={it} index={i} isBody={it.id === id} />
        ))}
        <Rig items={items} focus={focus} />
      </Canvas>
      <header className="sc-head">
        <h2>{t.title}</h2>
        <button className="close" onClick={closeSizeCompare} aria-label={t.close}>
          ×
        </button>
      </header>
      <div className="sc-foot">
        {caption && <p className="sc-caption">{caption}</p>}
        {focus ? (
          <button className="secondary sc-back" onClick={() => focusOn(null)}>
            ← {t.back}
          </button>
        ) : (
          <p className="sc-hint muted small">{t.tapHint}</p>
        )}
        <div className="sc-picks">
          {PICKS.filter((p) => p !== id).map((p) => (
            <button key={p} className={`sc-chip${picks.includes(p) ? ' on' : ''}`} onClick={() => togglePick(p)} aria-pressed={picks.includes(p)}>
              {nameOf(p)}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

export function SizeCompare() {
  const id = useSizeCompare((s) => s.id)
  if (!id) return null
  return <Stage key={id} id={id} />
}
