import { registerNav, useNavContext, type NavCard, type NavTab } from '../registry'
import { ui } from '../../../i18n'
import { closeEclipses } from '../../../state/eclipse'
import { startMoonMission, useMoonMission } from '../../../state/moonMission'
import { startSaturnObserve } from '../../../state/saturnExplorer'
import { useStore } from '../../../state/store'

// 月への有人飛行（アポロ17号の追体験）。「遊ぶ」と「学ぶ」の両方に置く（junji 2026-11-22：学ぶにあると思った）

/** 章の数（state/missionChapters.ts の CHAPTERS：0 発射台 〜 8 帰還） */
const CHAPTER_COUNT = 9

function register(id: string, tab: NavTab, order: number, className: string, card?: NavCard) {
  registerNav({
    id,
    tab,
    order,
    className,
    card,
    label: () => ui().moonMission.navLabel,
    use: () => {
      const { busy } = useNavContext()
      const mode = useStore((s) => s.mode)
      // どの章まで進んだか（「続きから」の章）
      const chapter = useMoonMission((m) => m.best.chapter)
      const at = chapter === undefined ? 0 : chapter + 1
      // 全体マップを開いたままでも押せる（押すとマップを閉じて始まる）
      return {
        disabled: busy || (mode !== 'flight' && mode !== 'map'),
        badge: at > 0 ? ui().playCards.chapterOf(at, CHAPTER_COUNT) : undefined,
        progress: at > 0 ? at / CHAPTER_COUNT : undefined,
      }
    },
    // 夕方の発射台でサターンV を見るところから（「打ち上げの夜へ」ですぐ秒読みにも行ける）
    run: () => {
      const s = useStore.getState()
      if (s.mode === 'map') s.setMode('flight')
      closeEclipses()
      startMoonMission('launch', startSaturnObserve)
    },
  })
}

register('moonMission', 'play', 15, 'moon-mission-start', {
  shelf: 'feats',
  image: 'play-cards/apollo17.webp',
  title: () => ui().playCards.cards.moonMission.title,
  desc: () => ui().playCards.cards.moonMission.desc,
  tried: () => {
    const b = useMoonMission.getState().best
    return b.chapter !== undefined || b.reached > 0
  },
})
register('moonMission-learn', 'learn', 3, 'moon-mission-start-learn')
