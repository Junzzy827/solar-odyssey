import { useEffect, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const loader = new THREE.TextureLoader()
const center = new THREE.Vector3()

/** 近いと読み込む距離・離れたら捨てる距離（中心からの距離。半径に対する倍率） */
const LOAD_WITHIN = 5
const DROP_BEYOND = 9

/**
 * 天体に近づいたときだけ高解像度のテクスチャを読み込み、離れたら捨てる（4K は1枚で GPU のメモリを 80MB ほど使う）。
 * 遠くにいる間と読み込み中は null
 */
export function useCloseTexture(url: string | undefined, target: RefObject<THREE.Object3D | null>, radius: number, linear = false) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const gl = useThree((s) => s.gl)
  const want = useRef(false)
  const job = useRef(0)
  const current = useRef<THREE.Texture | null>(null)

  useFrame(({ camera }) => {
    if (!url || !target.current) return
    target.current.getWorldPosition(center)
    const d = camera.position.distanceTo(center) / radius
    const near = want.current ? d < DROP_BEYOND : d < LOAD_WITHIN
    if (near === want.current) return
    want.current = near
    const id = ++job.current
    if (near) {
      loader.loadAsync(url).then(
        (tex) => {
          if (job.current !== id) return tex.dispose()
          tex.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace
          tex.anisotropy = gl.capabilities.getMaxAnisotropy()
          tex.wrapS = THREE.RepeatWrapping
          current.current = tex
          setTexture(tex)
        },
        () => undefined,
      )
    } else {
      // 材質が 2K 版に戻ってから捨てる（先に捨てると、次の描画でまた GPU に送られてしまう）
      const old = current.current
      current.current = null
      setTexture(null)
      if (old) setTimeout(() => old.dispose(), 1000)
    }
  })

  useEffect(() => () => current.current?.dispose(), [])

  return texture
}
