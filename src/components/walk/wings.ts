import * as THREE from 'three'

// 背中につける翼（オリジナルの形）。軽い炭素の骨に、半透明の膜を張った、鳥の翼に近い形。
// 片側 3.2 m。羽ばたく（flap）と、根もとから上下に打ち下ろす。広げ具合（open）で、たたむ・広げる。

const SPAN = 3.2

function wingShape() {
  // 根もと（x=0）から先（x=SPAN）へ。前のふちはまっすぐ、後ろのふちは羽の先のようにぎざぎざ
  const s = new THREE.Shape()
  s.moveTo(0, 0.22)
  s.quadraticCurveTo(SPAN * 0.45, 0.42, SPAN, 0.12)
  const tips = 5
  for (let i = 0; i <= tips; i++) {
    const t = 1 - i / tips
    const x = SPAN * (0.35 + 0.65 * t)
    s.lineTo(x, -0.55 - 0.25 * Math.sin(t * Math.PI))
    if (i < tips) s.lineTo(x - SPAN * 0.07, -0.32)
  }
  s.lineTo(0, -0.5)
  s.closePath()
  return s
}

export class Wings {
  group = new THREE.Group()
  private sides: THREE.Group[] = []
  private geos: THREE.BufferGeometry[] = []
  private mats: THREE.Material[] = []
  private flapT = 1

  constructor() {
    const membrane = new THREE.MeshLambertMaterial({ color: '#eef3f6', transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false })
    const spar = new THREE.MeshLambertMaterial({ color: '#2b3038' })
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 2), toneMapped: false })
    const shape = new THREE.ShapeGeometry(wingShape(), 12)
    // 平らな形を、背中の面（x 横、z 後ろ）へ寝かせる
    shape.rotateX(-Math.PI / 2)
    const front = new THREE.CylinderGeometry(0.03, 0.045, SPAN, 6).rotateZ(Math.PI / 2).translate(SPAN / 2, 0.01, -0.2)
    const rib = new THREE.CylinderGeometry(0.018, 0.018, 0.85, 5).rotateX(Math.PI / 2)
    const edge = new THREE.BoxGeometry(SPAN * 0.9, 0.02, 0.03).translate(SPAN * 0.5, 0.02, -0.33)
    const pack = new THREE.BoxGeometry(0.3, 0.36, 0.12)
    this.geos.push(shape, front, rib, edge, pack)
    this.mats.push(membrane, spar, glow)
    for (const side of [-1, 1]) {
      const g = new THREE.Group()
      g.add(new THREE.Mesh(shape, membrane))
      g.add(new THREE.Mesh(front, spar))
      for (const f of [0.3, 0.55, 0.8]) {
        const r = new THREE.Mesh(rib, spar)
        r.position.set(SPAN * f, 0.01, 0.15)
        g.add(r)
      }
      g.add(new THREE.Mesh(edge, glow))
      g.scale.x = side
      this.sides.push(g)
      this.group.add(g)
    }
    // 背中の箱（翼の根もと）
    const p = new THREE.Mesh(pack, spar)
    p.position.set(0, -0.3, 0.02)
    this.group.add(p)
    this.group.visible = false
  }

  flap() {
    this.flapT = 0
  }

  /** open：0 = たたむ、1 = 広げる。dt 秒すすめる */
  update(dt: number, open: number) {
    this.flapT = Math.min(1, this.flapT + dt * 2.2)
    // 打ち下ろして、ゆっくりもどす
    const beat = this.flapT < 1 ? Math.sin(this.flapT * Math.PI * 2) * (1 - this.flapT) * 0.9 : 0
    for (let i = 0; i < 2; i++) {
      const g = this.sides[i]
      const side = i === 0 ? -1 : 1
      // たたむと、背中にそって下へ向け、少し後ろへ流す
      g.rotation.set(0, side * (1 - open) * 0.35, side * (beat - (1 - open) * 1.35 + 0.06 * open))
    }
  }

  dispose() {
    this.group.removeFromParent()
    for (const g of this.geos) g.dispose()
    for (const m of this.mats) m.dispose()
  }
}
