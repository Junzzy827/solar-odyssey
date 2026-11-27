import * as THREE from 'three'

// ISS の色の絵の置き場。絵はモジュールどうしで共通（public/models/iss/tex/<名前>.<大きさ>.webp）なので、
// 同じ絵を 2 回読まないように、使っている数を数えて、だれも使わなくなったら捨てる（GPU のメモリを返す）。
// 段階 2 で、となりのモジュールを先に読み・遠くなったら捨てるときにも、そのまま使える。

type Entry = { tex: Promise<THREE.Texture>; loaded: THREE.Texture | null; users: number }

const BASE = `${import.meta.env.BASE_URL}models/iss/`
const entries = new Map<string, Entry>()
const loader = new THREE.TextureLoader()

/** いま GPU に載せている（はずの）絵の推定メモリ（バイト、RGBA＋ミップマップ） */
export function texMemory() {
  let bytes = 0
  for (const e of entries.values()) {
    const img = e.loaded?.image as { width?: number; height?: number } | undefined
    if (img?.width && img.height) bytes += img.width * img.height * 4 * (4 / 3)
  }
  return bytes
}

/** 読みこんだ絵の一覧（重さを測るとき用） */
export function texList() {
  return [...entries.entries()].map(([k, e]) => ({ key: k, users: e.users, size: (e.loaded?.image as { width?: number } | undefined)?.width ?? 0 }))
}

/**
 * 絵を借りる。file は models/iss/ からの名前（'tex/uslab_racks_01.2048.webp'、'us_lab.light.2048.jpg'）。
 * 色の絵は sRGB。glTF の UV に合わせて上下を返さない（flipY = false）。くり返しの UV があるので Repeat
 */
export function acquireTex(file: string, opt: { anisotropy?: number } = {}): Promise<THREE.Texture> {
  let e = entries.get(file)
  if (!e) {
    const entry: Entry = {
      users: 0,
      loaded: null,
      tex: loader.loadAsync(BASE + file).then((t) => {
        t.flipY = false
        t.colorSpace = THREE.SRGBColorSpace
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.anisotropy = opt.anisotropy ?? 1
        t.needsUpdate = true
        entry.loaded = t
        // 読み終わる前に返された（使う人がいない）なら、すぐ捨てる
        if (entry.users <= 0) dropEntry(file, entry)
        return t
      }),
    }
    e = entry
    entries.set(file, e)
  }
  e.users++
  return e.tex
}

function dropEntry(file: string, e: Entry) {
  if (entries.get(file) === e) entries.delete(file)
  e.loaded?.dispose()
}

/** 借りた絵を返す。だれも使わなくなったら GPU から消す */
export function releaseTex(file: string) {
  const e = entries.get(file)
  if (!e) return
  e.users--
  if (e.users <= 0 && e.loaded) dropEntry(file, e)
}
