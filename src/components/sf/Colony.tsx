import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { ColonyModel } from './ColonyModel'
import { ConstructionSite } from './ConstructionSite'
import { bodies, colliders, passThrough, registerBody, zoomZones, type ZoomZone } from '../../state/registry'
import { flightControl, ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { COLONY_ID, COLONY_LENGTH as L, COLONY_PORT as PORT, COLONY_RADIUS as R, COLONY_SPIN_SECONDS, COLONY_ZOOM, SF_TEXT, colonyName } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'

const H = L / 2
const CAP = 0.03
/** 外から近づけない円筒の外側（外板・鏡の支点・端の丸屋根の少し外） */
const OUTER = R * 1.06
/** 中で飛べる範囲：地面から少し上まで */
const INNER = R * 0.9
/** 2号基を置く、横の距離（1号基の鏡が回ってきても届かない） */
const SITE_OFFSET = 0.85
/** この距離まで近づくと案内を出す・2号基を描く */
const NOTICE = 2.4
const DRAW_SITE = 4

const Y = new THREE.Vector3(0, 1, 0)
const earth = new THREE.Vector3()
const moon = new THREE.Vector3()
const rel = new THREE.Vector3()
const prevRel = new THREE.Vector3()
const normal = new THREE.Vector3(0, 1, 0)
const cross = new THREE.Vector3()
const toSun = new THREE.Vector3()
const local = new THREE.Vector3()
const inverse = new THREE.Matrix4()
const push = new THREE.Vector3()
const lastPos = new THREE.Vector3()
const delta = new THREE.Vector3()

/**
 * 地球と月の L5 点（月の軌道の上で、月より60度うしろ）に浮かぶスペースコロニー。
 * 回転軸を太陽へ向け、1Gになる速さ（約2分に1回転）で回る。港から中へ入って飛べる。
 */
export function Colony() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Group>(null!)
  const site = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  const state = useRef({ inside: false, noticed: false, ready: false, hasPrev: false })
  useHideBehindSun(label, group)

  useEffect(() => {
    const zone: ZoomZone = { object: group.current, start: 2.6, full: 0.9, factor: COLONY_ZOOM }
    const unregister = registerBody({ id: COLONY_ID, get name() { return colonyName() }, radius: H * 1.1, object: group.current })
    passThrough.add(COLONY_ID)
    zoomZones.add(zone)
    colliders.add(collide)
    return () => {
      unregister()
      passThrough.delete(COLONY_ID)
      zoomZones.delete(zone)
      colliders.delete(collide)
    }
    // collide は state の ref だけを読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 壁に当たる判定。外からは港の穴だけを通れ、中では地面と両端の壁の内側を飛ぶ */
  function collide() {
    const s = state.current
    if (!s.ready) return
    // 中にいるあいだは、コロニーと一緒に動く（地球のまわりを回っても、壁が迫ってこないように）
    if (s.inside && !flightControl.holding) ship.position.add(delta)
    delta.set(0, 0, 0)
    inverse.copy(group.current.matrixWorld).invert()
    local.copy(ship.position).applyMatrix4(inverse)
    const r = Math.hypot(local.x, local.z)
    const y = local.y
    let moved = false
    if (s.inside) {
      // ワープなどで遠くへ出たら、外にいることにする
      if (r > R * 1.5 || Math.abs(y) > H + 0.3 || (y < -H - 0.01 && r < PORT)) {
        s.inside = false
        return
      }
      if (r > INNER) {
        local.x *= INNER / r
        local.z *= INNER / r
        moved = true
      }
      if (y > H - 0.02) {
        local.y = H - 0.02
        moved = true
      }
      if (y < -H + 0.02 && r > PORT * 0.85) {
        local.y = -H + 0.02
        moved = true
      }
    } else {
      const bottom = -H - CAP - 0.005
      const top = H + CAP + 0.005
      if (r < OUTER && y > bottom && y < top) {
        // 港の穴の中なら、そのまま中へ
        if (r < PORT * 0.9) {
          if (y > -H) {
            s.inside = true
            useStore.getState().showToast(SF_TEXT.colonyInside())
          }
        } else {
          // いちばん浅い向きへ押し出す
          const out = OUTER - r
          const up = top - y
          const down = y - bottom
          if (out <= up && out <= down) {
            local.x *= OUTER / r
            local.z *= OUTER / r
          } else if (up < down) local.y = top
          else local.y = bottom
          moved = true
        }
      }
    }
    if (!moved) return
    push.copy(local).applyMatrix4(group.current.matrixWorld).sub(ship.position)
    ship.position.add(push)
    // 壁へ向かう速さを消す
    if (push.lengthSq() > 0) {
      push.normalize()
      const into = ship.velocity.dot(push)
      if (into < 0) ship.velocity.addScaledVector(push, -into)
    }
  }

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const e = bodies.get('earth')
    const m = bodies.get('moon')
    if (!e || !m) return
    e.object.getWorldPosition(earth)
    m.object.getWorldPosition(moon)
    rel.copy(moon).sub(earth)
    // 月の回る向き（軌道の面の法線）。月が動いたときだけ更新する
    if (state.current.hasPrev) {
      cross.crossVectors(prevRel, rel)
      if (cross.lengthSq() > 1e-12 * rel.lengthSq() ** 2) normal.copy(cross).normalize()
    }
    prevRel.copy(rel)
    state.current.hasPrev = true
    // L5：月の軌道の上で、月より60度うしろ
    rel.applyAxisAngle(normal, -Math.PI / 3)
    const g = group.current
    if (state.current.ready) lastPos.copy(g.position)
    g.position.copy(earth).add(rel)
    // 回転軸（+Y）を太陽へ向ける
    toSun.copy(g.position).negate().normalize()
    g.quaternion.setFromUnitVectors(Y, toSun)
    g.updateMatrixWorld()
    if (state.current.ready) delta.add(lastPos.sub(g.position).negate())
    state.current.ready = true

    const st = useStore.getState()
    if (st.timeScale > 0) spin.current.rotation.y += (dt * Math.PI * 2) / COLONY_SPIN_SECONDS

    const d = ship.position.distanceTo(g.position)
    site.current.visible = d < DRAW_SITE
    if (st.mode === 'flight' && st.warpPhase === 'idle') {
      if (d < NOTICE && !state.current.noticed) {
        state.current.noticed = true
        if (!state.current.inside) st.showToast(SF_TEXT.colonyFound())
      }
      if (d > NOTICE * 3) state.current.noticed = false
    }
  })

  return (
    <group ref={group}>
      <group ref={spin}>
        <ColonyModel />
      </group>
      <group ref={site} position={[SITE_OFFSET, 0, 0]} visible={false}>
        <ConstructionSite />
      </group>
      <Html position={[0, 0, R * 3]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(COLONY_ID)}>
          {colonyName()}
        </span>
      </Html>
    </group>
  )
}
