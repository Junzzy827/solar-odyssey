import type { sizeCompareJa } from './sizeCompare.ja'
import type { Translation } from './translation'

// The texts of components/SizeCompare.tsx (English). Same keys as sizeCompare.ja.ts

export const sizeCompareEn: Translation<typeof sizeCompareJa> = {
  trueSizeRatio: (id: string) => `${id} (true size ratio)`,
}
