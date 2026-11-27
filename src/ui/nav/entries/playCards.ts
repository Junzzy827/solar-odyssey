import { registerNav, useNavContext } from '../registry'
import { ui } from '../../../i18n'
import { closeEclipses } from '../../../state/eclipse'
import { openProbes, playProbe, useProbes } from '../../../state/probes'
import { useStore } from '../../../state/store'
import { flightControl } from '../../../state/flight'
import { startLanding } from '../../../state/landing'
import { campaignLocked, useCampaign } from '../../../state/campaign'

// 「遊ぶ」タブの絵のカードだけにある入口（ほかの入口は、もとからある登録にカードを足した）

/** 歴史の偉業：探査機の旅を、その探査機から始める（「学ぶ」の「探査機の旅」と同じ画面） */
function probeCard(id: 'voyager2' | 'hayabusa2', order: number) {
  registerNav({
    id: `probe-${id}`,
    tab: 'play',
    order,
    world: 'real',
    className: 'probe-start',
    label: () => ui().probes[id].name,
    card: {
      shelf: 'feats',
      image: `play-cards/${id}.webp`,
      title: () => ui().playCards.cards[id].title,
      desc: () => ui().playCards.cards[id].desc,
    },
    use: () => ({ on: useProbes((p) => p.open && p.probeId === id), disabled: useNavContext().busy }),
    run: () => {
      closeEclipses()
      openProbes()
      playProbe(id)
    },
  })
}
probeCard('voyager2', 16)
probeCard('hayabusa2', 17)

/** 自由に遊ぶ：火星へ飛んで、そのまま着陸する（地表まで 4 段かかっていたのを 1 回で） */
registerNav({
  id: 'land-mars',
  tab: 'play',
  order: 30,
  className: 'land-mars-start',
  label: () => ui().playCards.cards.landMars.title,
  card: {
    shelf: 'free',
    image: 'play-cards/mars.webp',
    title: () => ui().playCards.cards.landMars.title,
    desc: () => ui().playCards.cards.landMars.desc,
  },
  use: () => {
    const { busy, flight } = useNavContext()
    // キャンペーンでまだ開いていないときは押せない（useCampaign を読んで、開いたら押せるように描き直す）
    useCampaign((c) => c.stage + (c.active ? 100 : 0))
    return { disabled: busy || !flight || campaignLocked('mars') }
  },
  run: () => {
    closeEclipses()
    const s = useStore.getState()
    s.setTarget('mars')
    s.setAutopilot(false)
    // 船を火星の前へ移してから（離陸したとき火星のそばにいるように）、暗転して地表へ
    flightControl.jumpTo = 'mars'
    flightControl.jumps++
    startLanding('mars')
  },
})
