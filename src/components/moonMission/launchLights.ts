import * as THREE from 'three'
import { OUT_CHUNK, encodeOutput } from './shaderOut'
import { GROUND_Y } from './launchSite'

// 発射台を夜に照らす投光器：地面から斜めにロケットを照らす光と、霧に見える光の柱。地面の組の中に置く。

const Y = new THREE.Vector3(0, 1, 0)

/** 投光器の場所（地面の組の x, z） */
const LAMPS: [number, number][] = [
  [-260, 230],
  [240, 260],
  [-300, -200],
]
/** 1 灯の明るさ（光の柱の濃さとは別） */
const SPOT_POWER = 1.6e6

function beamMaterial() {
  return encodeOutput(new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying float vS; varying vec3 vN; varying vec3 vV;
      void main(){ vS = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uPower; varying float vS; varying vec3 vN; varying vec3 vV;
      void main(){
        #include <logdepthbuf_fragment>
        float a = pow(abs(dot(normalize(vN), normalize(vV))), 2.0) * (1.0 - vS) * 0.05 * uPower;
        gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * a, a);
        ${OUT_CHUNK}
      }`,
    uniforms: { uPower: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }))
}

export type Floodlights = {
  group: THREE.Group
  /** 司令船の中にいるあいだは、照明の光を消す（外の明かりが船室に入らないように） */
  setInside(inside: boolean): void
  dispose(): void
}

export function buildFloodlights(): Floodlights {
  const group = new THREE.Group()
  group.name = 'Floodlights'
  const mat = beamMaterial()
  const geos: THREE.BufferGeometry[] = []
  const spots: THREE.SpotLight[] = []
  for (const [x, z] of LAMPS) {
    const from = new THREE.Vector3(x, GROUND_Y + 2, z)
    const to = new THREE.Vector3(0, 60, 0)
    const d = to.clone().sub(from)
    const len = d.length()
    // 円柱は真ん中が原点なので、光の柱の真ん中に置く（太い側がロケット）
    const geo = new THREE.CylinderGeometry(16, 1.2, len, 20, 1, true)
    geos.push(geo)
    const beam = new THREE.Mesh(geo, mat)
    beam.position.copy(from).addScaledVector(d, 0.5)
    beam.quaternion.setFromUnitVectors(Y, d.normalize())
    const spot = new THREE.SpotLight('#dfe6ff', SPOT_POWER, 0, 0.3, 0.7, 2)
    spot.position.copy(from)
    spots.push(spot)
    const g = new THREE.Group()
    g.add(beam, spot)
    group.add(g)
  }
  return {
    group,
    setInside(inside) {
      for (const s of spots) s.intensity = inside ? 0 : SPOT_POWER
    },
    dispose() {
      for (const g of geos) g.dispose()
      mat.dispose()
    },
  }
}
