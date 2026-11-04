import { HUBBLE_ID, WEBB_ID, type ScopeId } from './telescopes'
import { ui } from '../i18n'

// 宇宙望遠鏡でのぞける写真。画像は ESA/Hubble・ESA/Webb の公開画像（CC BY 4.0）を
// 長辺2400pxに縮めて public/deep-space/ に置いている。クレジットは必ず表示する。
// 距離などの数値は NASA・ESA の解説の概数。

export type DeepSpaceImage = {
  id: string
  scope: ScopeId
  file: string
  /** 同じ場所をもう一方の望遠鏡で撮った写真 */
  pair?: string
  credit: string
  source: string
}

/** DeepSpaceImage の文言（日本語は src/i18n/deepSpaceImages.ja.ts、英語は deepSpaceImages.en.ts） */
export type DeepSpaceImageText = {
  name: string
  /** どんな天体か */
  kind: string
  distance: string
  /** この光が出発したのはいつか */
  lookback: string
  notes: string[]
}

/** 今の言語の説明 */
export const deepSpaceText = (image: DeepSpaceImage): DeepSpaceImageText => ui().deepSpaceImages[image.id]

/** 望遠鏡ごとの、見ている光 */
export const scopeLight = (id: ScopeId) =>
  id === HUBBLE_ID ? ui().deepSpace.visibleExplained : ui().deepSpace.infraredExplained

const hubble = (id: string) => `https://esahubble.org/images/${id}/`
const webb = (id: string) => `https://esawebb.org/images/${id}/`

export const DEEP_SPACE: DeepSpaceImage[] = [
  {
    id: 'hubble-andromeda',
    scope: HUBBLE_ID,
    file: 'heic1502a.jpg',
    credit:
      'NASA, ESA, J. Dalcanton (University of Washington, USA), B. F. Williams (University of Washington, USA), L. C. Johnson (University of Washington, USA), the PHAT team, and R. Gendler.',
    source: hubble('heic1502a'),
  },
  {
    id: 'hubble-pillars',
    scope: HUBBLE_ID,
    file: 'heic1501a.jpg',
    pair: 'webb-pillars',
    credit: 'NASA, ESA/Hubble and the Hubble Heritage Team',
    source: hubble('heic1501a'),
  },
  {
    id: 'hubble-crab',
    scope: HUBBLE_ID,
    file: 'heic0515a.jpg',
    credit: 'NASA, ESA and Allison Loll/Jeff Hester (Arizona State University). Acknowledgement: Davide De Martin (ESA/Hubble)',
    source: hubble('heic0515a'),
  },
  {
    id: 'hubble-sombrero',
    scope: HUBBLE_ID,
    file: 'opo0328a.jpg',
    credit: 'NASA/ESA and The Hubble Heritage Team (STScI/AURA)',
    source: hubble('opo0328a'),
  },
  {
    id: 'hubble-udf',
    scope: HUBBLE_ID,
    file: 'heic0611b.jpg',
    credit: 'NASA, ESA, and S. Beckwith (STScI) and the HUDF Team',
    source: hubble('heic0611b'),
  },
  {
    id: 'webb-deepfield',
    scope: WEBB_ID,
    file: 'weic2209a.jpg',
    credit: 'NASA, ESA, CSA, and STScI',
    source: webb('weic2209a'),
  },
  {
    id: 'webb-pillars',
    scope: WEBB_ID,
    file: 'weic2216a.jpg',
    pair: 'hubble-pillars',
    credit: 'NASA, ESA, CSA, STScI; J. DePasquale, A. Koekemoer, A. Pagan (STScI).',
    source: webb('weic2216a'),
  },
  {
    id: 'webb-cliffs',
    scope: WEBB_ID,
    file: 'weic2205a.jpg',
    credit: 'NASA, ESA, CSA, and STScI',
    source: webb('weic2205a'),
  },
  {
    id: 'webb-stephan',
    scope: WEBB_ID,
    file: 'weic2208a.jpg',
    credit: 'NASA, ESA, CSA, and STScI',
    source: webb('weic2208a'),
  },
]

/** 見くらべのボタンに出す短い名前 */
export const scopeLightShort = (id: ScopeId) => (id === HUBBLE_ID ? ui().deepSpace.visible : ui().deepSpace.infrared)

const base = `${import.meta.env.BASE_URL}deep-space/`
export const deepSpaceUrl = (image: DeepSpaceImage) => base + image.file
/** 一覧に出す小さな見本（正方形に切り抜いたもの） */
export const deepSpaceThumb = (image: DeepSpaceImage) => `${base}thumbs/${image.file}`
