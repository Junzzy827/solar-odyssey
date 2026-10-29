import { useEffect, useState } from 'react'
import * as THREE from 'three'

const loader = new THREE.TextureLoader()
const cache = new Map<string, Promise<THREE.Texture | null>>()

function load(url: string) {
  let p = cache.get(url)
  if (!p) {
    p = loader.loadAsync(url).then(
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        return tex
      },
      () => null,
    )
    cache.set(url, p)
  }
  return p
}

/** 読み込めなければ null を返す（ファイルが無くても画面は止めない） */
export function useOptionalTexture(url: string | undefined, linear = false) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!url) return
    let alive = true
    load(url).then((tex) => {
      if (!alive || !tex) return
      if (linear) tex.colorSpace = THREE.NoColorSpace
      setTexture(tex)
    })
    return () => {
      alive = false
    }
  }, [url, linear])

  return texture
}
