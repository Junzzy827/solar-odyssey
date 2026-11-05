import type { historicPanelJa } from './historicPanel.ja'
import type { Translation } from './translation'

// The texts of components/surface/HistoricPanel.tsx (English). Same keys as historicPanel.ja.ts

export const historicPanelEn: Translation<typeof historicPanelJa> = {
  openBook: 'Open the Apollo 17 site book',
  apollo17: 'Apollo 17',
  book: 'Book',
  toNextSite: (site: string, dist: string) => `${site}: ${dist}`,
  allVisited: 'You visited every site!',
  siteFound: 'Apollo 17 site found',
  sitesVisited: 'Sites visited',
  close: 'Close',
}
