import { Suspense, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { HubbleModel } from './HubbleModel'
import { roomEnvironment } from './parts'

// NASA の公開3Dモデル（NASA Visualization Technology Applications and Development 制作）。
// 取り込むときにロゴの貼り紙を外し、外板の写真の NASA・ESA のロゴは銀色の断熱材で塗りつぶした。
// 読み込むまでは手作りのモデルを出す。
const URL = `${import.meta.env.BASE_URL}models/hubble.glb`

/** 元のモデルは1単位が1m。筒の長さは13.2mで、開いたふたの分だけ全体はもっと長い */
const TUBE = 13.2

function NasaHubble() {
  const { scene } = useGLTF(URL)
  const { gl } = useThree()
  const model = useMemo(() => {
    const env = roomEnvironment(gl)
    const root = scene.clone(true)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
      mat.envMap = env
      mat.envMapIntensity = 0.7
      mesh.material = mat
    })
    // 長い軸（元は +Y、ふたの側）を +Z に向け、筒の長さを 1 にそろえる
    const box = new THREE.Box3().setFromObject(root)
    const wrap = new THREE.Group()
    root.position.set(-(box.min.x + box.max.x) / 2, -(box.min.y + TUBE / 2), -(box.min.z + box.max.z) / 2)
    wrap.add(root)
    wrap.rotation.x = Math.PI / 2
    wrap.scale.setScalar(1 / TUBE)
    return wrap
  }, [scene, gl])
  return <primitive object={model} />
}

/** ハッブル宇宙望遠鏡（筒の長さ 1、+Z が観測の向き） */
export function HubbleTelescope() {
  return (
    <Suspense fallback={<HubbleModel />}>
      <NasaHubble />
    </Suspense>
  )
}
