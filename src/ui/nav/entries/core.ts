import { registerNav, useNavContext } from '../registry'
import { ui } from '../../../i18n'
import { closeEclipses } from '../../../state/eclipse'
import { openMissions, useMission } from '../../../state/mission'
import { openCampaign, useCampaign } from '../../../state/campaign'
import { CAMPAIGN_STAGES } from '../../../data/campaign'
import { QUIZ_LENGTH, startQuiz, useQuiz } from '../../../state/quiz'
import { startEva, startRepairEva } from '../../../state/eva'
import { startWalkDirect } from '../../../state/walk'
import { openStamps, useStamps } from '../../../state/stamps'
import { NATURAL } from '../../../data/stamps'
import { openRocks, useRockBook } from '../../../state/rockBook'
import { useSampleLog } from '../../../state/rover'
import { ROCK_TOTAL, rockCount } from '../../../data/rockCollection'
import { openProbes, useProbes } from '../../../state/probes'
import { MISSIONS } from '../../../data/missions'

// いまある遊び・学びの入口。order はタブの中の並び（10 きざみ。あいだに足せる）

registerNav({
  id: 'missions',
  tab: 'play',
  order: 10,
  className: 'mission-start',
  label: () => ui().missionsButton,
  card: {
    shelf: 'story',
    image: 'ships/sv01.jpg',
    title: () => ui().playCards.cards.missions.title,
    desc: () => ui().playCards.cards.missions.desc,
    tried: () => Object.keys(useMission.getState().stars).length > 0,
  },
  use: () => {
    const on = useMission((m) => m.phase) !== 'closed'
    const cleared = useMission((m) => MISSIONS.filter((x) => (m.stars[x.id] ?? 0) > 0).length)
    return { on, disabled: useNavContext().racing, badge: cleared > 0 ? `${cleared}/${MISSIONS.length}` : undefined, progress: cleared > 0 ? cleared / MISSIONS.length : undefined }
  },
  run: () => {
    if (useMission.getState().phase !== 'active') closeEclipses()
    openMissions()
  },
})

registerNav({
  id: 'campaign',
  tab: 'play',
  order: 20,
  className: 'campaign-open mission-start',
  label: () => ui().campaign.navButton,
  card: {
    shelf: 'story',
    image: 'play-cards/campaign.webp',
    title: () => ui().playCards.cards.campaign.title,
    desc: () => ui().playCards.cards.campaign.desc,
    tried: () => useCampaign.getState().active || useCampaign.getState().stage > 0,
  },
  use: () => {
    const { racing, onMission } = useNavContext()
    const on = useCampaign((c) => c.active)
    const stage = useCampaign((c) => c.stage)
    const n = CAMPAIGN_STAGES.length
    return {
      on,
      disabled: racing || onMission,
      label: on && stage < n ? ui().campaign.navButtonActive(stage + 1, n) : undefined,
      badge: stage > 0 ? `${stage}/${n}` : undefined,
      progress: stage > 0 ? stage / n : undefined,
    }
  },
  run: () => (closeEclipses(), openCampaign()),
})

registerNav({
  id: 'quiz',
  tab: 'learn',
  order: 10,
  className: 'quiz-start',
  label: () => ui().navPanel.quizRun(QUIZ_LENGTH),
  use: () => ({ on: useQuiz((q) => q.open), disabled: useNavContext().racing }),
  run: () => (closeEclipses(), startQuiz()),
})

registerNav({
  id: 'eva',
  tab: 'play',
  order: 40,
  className: 'eva-start',
  kbd: 'K',
  label: () => ui().navPanel.spacewalk,
  card: {
    shelf: 'free',
    image: 'play-cards/eva.webp',
    title: () => ui().playCards.cards.eva.title,
    desc: () => ui().playCards.cards.eva.desc,
  },
  use: () => {
    const { busy, flight } = useNavContext()
    return { disabled: busy || !flight }
  },
  run: () => (closeEclipses(), startEva()),
})

registerNav({
  id: 'eva-repair',
  tab: 'play',
  order: 50,
  className: 'eva-start repair',
  label: () => ui().navPanel.spacewalkRepair,
  card: {
    shelf: 'free',
    image: 'play-cards/eva-repair.webp',
    title: () => ui().playCards.cards.evaRepair.title,
    desc: () => ui().playCards.cards.evaRepair.desc,
  },
  use: () => {
    const { busy, flight } = useNavContext()
    return { disabled: busy || !flight }
  },
  run: () => (closeEclipses(), startRepairEva()),
})

registerNav({
  id: 'walk',
  tab: 'play',
  order: 60,
  world: 'sf',
  className: 'walk-start',
  label: () => ui().navPanel.walkPark,
  card: {
    shelf: 'free',
    image: 'play-cards/walk.webp',
    title: () => ui().playCards.cards.walk.title,
    desc: () => ui().playCards.cards.walk.desc,
  },
  use: () => {
    const { busy, flight } = useNavContext()
    return { disabled: busy || !flight }
  },
  run: () => (closeEclipses(), startWalkDirect()),
})

registerNav({
  id: 'stamps',
  tab: 'learn',
  order: 20,
  className: 'stamp-start',
  label: () => ui().navPanel.stampBook,
  use: () => ({ on: useStamps((b) => b.open), badge: `${useStamps((b) => NATURAL.filter((id) => id in b.stamps).length)}/${NATURAL.length}` }),
  run: () => openStamps(),
})

registerNav({
  id: 'rocks',
  tab: 'learn',
  order: 30,
  className: 'rock-start',
  label: () => ui().navPanel.rockCollection,
  use: () => ({ on: useRockBook((r) => r.open), badge: `${useSampleLog((l) => rockCount(l.log))}/${ROCK_TOTAL}` }),
  run: () => openRocks(),
})

registerNav({
  id: 'probes',
  tab: 'learn',
  order: 40,
  className: 'probe-start',
  label: () => ui().navPanel.probeJourneys,
  use: () => ({ on: useProbes((p) => p.open), disabled: useNavContext().busy }),
  run: () => (closeEclipses(), openProbes()),
})
