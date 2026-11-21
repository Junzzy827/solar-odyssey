import * as THREE from 'three'

// 打ち上げの場面の空：星（いまは天の川の絵。作業3で本物の星表に置きかえる）。

export type LaunchSky = {
  stars: THREE.Mesh
  /** 星の球をカメラに付いていかせる */
  update(camera: THREE.Camera): void
  dispose(): void
}

export function buildSky(starTex: THREE.Texture): LaunchSky {
  const geo = new THREE.SphereGeometry(5e9, 32, 16)
  const mat = new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide, depthWrite: false, color: '#555' })
  const stars = new THREE.Mesh(geo, mat)
  stars.renderOrder = -10
  return {
    stars,
    update(camera) {
      stars.position.copy(camera.position)
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}
