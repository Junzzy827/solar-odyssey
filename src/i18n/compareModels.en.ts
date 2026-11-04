import type { compareModelsJa } from './compareModels.ja'
import type { Translation } from './translation'

// The texts of components/ship/CompareModels.tsx (English). Same keys as compareModels.ja.ts

export const compareModelsEn: Translation<typeof compareModelsJa> = {
  storyLength: (registry: string, lengthM: number) => `${registry} ${lengthM} m (story)`,
}
