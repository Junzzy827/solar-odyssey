import * as THREE from 'three'

// 焼かない画面：CRT（緑の線と数字）、姿勢球（ADI、白と黒の球）、後ろの台の CCTV モニター（荷物室のカメラの絵）。
// CRT の中身は「それらしい表示」で、本物の画面の写しではない（数字と記号だけ。言葉はつくらない）。

const W = 512
const H = 384

export function crtTexture() {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.flipY = false
  return t
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0')

/** CRT を描く。kind で 4 種類の画面（軌道の図・数字の表・棒グラフ・後ろの台の表） */
export function drawCrt(tex: THREE.CanvasTexture, kind: number, t: number) {
  const c = tex.image as HTMLCanvasElement
  const g = c.getContext('2d')
  if (!g) return
  g.fillStyle = '#020803'
  g.fillRect(0, 0, W, H)
  g.strokeStyle = '#4dff7a'
  g.fillStyle = '#4dff7a'
  g.lineWidth = 2
  g.font = 'bold 22px monospace'
  // 上の行：番号と、飛行してからの時間（日/時:分:秒。3 日目から数え始める見せ方）
  const met = 3 * 86400 + 5 * 3600 + t
  g.fillText(`${pad(kind + 1, 4)}/    /${pad(met / 86400, 3)}/${pad((met / 3600) % 24)}:${pad((met / 60) % 60)}:${pad(met % 60)}`, 18, 32)
  g.beginPath()
  g.moveTo(14, 44)
  g.lineTo(W - 14, 44)
  g.stroke()
  if (kind === 0) {
    // 地球と軌道の図
    g.beginPath()
    g.arc(W / 2, 214, 110, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.ellipse(W / 2, 214, 170, 70, -0.3, 0, Math.PI * 2)
    g.stroke()
    const a = (t / 40) % (Math.PI * 2)
    const x = W / 2 + Math.cos(a) * 170 * Math.cos(-0.3) - Math.sin(a) * 70 * Math.sin(-0.3)
    const y = 214 + Math.cos(a) * 170 * Math.sin(-0.3) + Math.sin(a) * 70 * Math.cos(-0.3)
    g.fillRect(x - 6, y - 6, 12, 12)
  } else if (kind === 1 || kind === 3) {
    // 数字の表
    for (let r = 0; r < 10; r++) {
      const y = 76 + r * 29
      const v = Math.sin(r * 12.9 + kind) * 400 + 500
      const w = Math.sin(t * 0.3 + r) * 3
      g.fillText(`${pad(r + 1)}  ${(v + w).toFixed(1).padStart(7, ' ')}   ${(v * 0.37).toFixed(2).padStart(7, ' ')}`, 26, y)
    }
  } else {
    // 棒グラフ
    for (let i = 0; i < 8; i++) {
      const h = 60 + (Math.sin(i * 2.3 + t * 0.15) * 0.5 + 0.5) * 220
      g.strokeRect(36 + i * 56, 340 - h, 34, h)
      g.fillText(pad(i + 1), 40 + i * 56, 368)
    }
  }
  // カーソルの点滅
  if (Math.floor(t * 2) % 2 === 0) g.fillRect(W - 40, H - 34, 16, 22)
  tex.needsUpdate = true
}

/** 姿勢球の絵（正距円筒）：上の半分が白（空）、下が黒（地面）、10° ごとの線 */
export function adiTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#e8e8e2'
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = '#1a1a1a'
  g.fillRect(0, 128, 512, 128)
  g.strokeStyle = '#d24a1e'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(0, 128)
  g.lineTo(512, 128)
  g.stroke()
  g.lineWidth = 1.5
  for (let k = 1; k < 9; k++) {
    for (const s of [-1, 1]) {
      const y = 128 + s * k * (128 / 9)
      g.strokeStyle = s < 0 ? '#333' : '#ccc'
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(512, y)
      g.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** CCTV モニター：荷物室のカメラで撮った絵を、白黒で少しにじませて出す */
export function monitorMaterial() {
  const target = new THREE.WebGLRenderTarget(256, 192, { depthBuffer: true })
  // 撮った絵は直線の値のまま入るので、出すときに見た目の明るさへ直す
  const material = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: target.texture } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(uTex, vec2(vUv.x, vUv.y)).rgb;
        float l = pow(dot(c, vec3(0.3, 0.59, 0.11)), 1.0 / 2.2);
        float scan = 0.88 + 0.12 * sin(vUv.y * 600.0);
        gl_FragColor = vec4(vec3(0.08 + l * 0.95) * scan * vec3(0.92, 1.0, 0.95), 1.0);
      }`,
    toneMapped: false,
  })
  return { target, material }
}
