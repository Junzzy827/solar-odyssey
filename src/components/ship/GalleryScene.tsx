import { useGallery } from '../../state/gallery'
import { CompareModels } from './CompareModels'

/** 鑑賞モードで船の横に並べるもの（船の座標で置く）。名札は ui/GalleryLabels */
export function GalleryScene() {
  const compare = useGallery((g) => g.compare)
  return compare ? <CompareModels /> : null
}
