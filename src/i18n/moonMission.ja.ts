// components/moonMission/MoonMissionView.tsx・state/moonMission.ts の文言（日本語）

export const moonMissionJa = {
  navLabel: '月へ有人飛行（アポロ17号）',
  saveLabel: '月ミッションの記録',
  title: 'アポロ17号　月への旅',
  intro: '1972年12月7日の真夜中。アポロで、たった一度の夜の打ち上げ。',
  crew: 'サーナン船長・エバンス・シュミット',
  /** 打ち上げまでの時刻（T-12 など） */
  tMinus: (s: number) => `T-${Math.ceil(s)}`,
  /** 打ち上げからの時刻 */
  met: (t: number) => {
    const h = Math.floor(t / 3600)
    const m = Math.floor((t % 3600) / 60)
    const s = Math.floor(t % 60)
    return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  },
  igniteHold: '点火（押す / スペース）',
  igniteHint: 'T-9 になったら押して、エンジンに火を入れる',
  ignitionGo: '点火！',
  altitude: '高さ',
  speed: '速さ',
  gee: 'G',
  km: (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('ja-JP')} km`,
  kms: (v: number) => `${v.toFixed(2)} km/s`,
  stageName: ['第1段 S-IC（F-1 ×5）', '第2段 S-II（J-2 ×5）', '第3段 S-IVB（J-2 ×1）'],
  tiltHint: '← → で機首を緑の手本に合わせる',
  autoOn: 'おまかせ中',
  auto: 'おまかせ',
  manual: '自分で操縦',
  camera: 'カメラ',
  camNames: { pad: '地上から', chase: '横から', onboard: '機体カメラ' } as Record<string, string>,
  quit: '終わる',
  warp: (w: number) => `早送り ×${Math.round(w)}`,
  orbitInfo: (peri: number, apo: number) => `軌道 ${Math.round(peri / 1000)}〜${Math.round(apo / 1000)} km`,
  tliBar: '月への窓',
  tliGo: '月へ向けて点火',
  tliHint: '窓のまん中で点火すると、月へいちばん近道',
  captions: {
    ignition: ['点火', '5基の F-1 エンジンに火が入る。地上の推力は 3,400 トン'],
    liftoff: ['リフトオフ！', '夜空が昼のように明るくなった'],
    towerClear: ['発射塔を通過', 'ここから東の海の上へ、ゆっくり機首を倒していく'],
    maxQ: ['マックスQ', '空気の抵抗がいちばん強い所を抜けた'],
    centerCutoff: ['中央のエンジン停止', '軽くなって加速が強くなりすぎないように'],
    stage1Sep: ['第1段を切り離し', '高さ約 67 km。燃え尽きた第1段は海へ落ちていく'],
    stage2Ign: ['第2段に点火', '液体水素のエンジン。炎はほとんど見えない'],
    interstage: ['段間部を投棄', '第2段の下のリングを捨てた'],
    les: ['脱出塔を投棄', 'もう緊急脱出の塔はいらない高さ'],
    stage2Sep: ['第2段を切り離し', '第3段の出番'],
    stage3Ign: ['第3段に点火', 'あと少しで地球を回る速さ（秒速 7.8 km）'],
    orbit: ['地球を回る軌道に到着', '高さ約 170 km。90 分で地球を 1 周する'],
    sunrise: ['軌道の日の出', '宇宙では 90 分ごとに朝が来る'],
    tliWindow: ['月への窓が開いた', '窓のまん中で「月へ向けて点火」'],
    tliIgnition: ['月へ向けて点火（TLI）', '第3段の 2 回目の燃焼。約 6 分'],
    tliCutoff: ['月へ向かう道に乗った', '秒速 10.8 km。地球の重力をふりきって 3 日の旅へ'],
  } as Record<string, [string, string]>,
  endTitle: '第1弾ここまで：月へ向かっています',
  endNext: '続き（月の裏での点火・タウルス・リットロウ谷への着陸）は次の弾で',
  stars: (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n),
  starsNote: '手本との合い方と、月への点火のタイミングで星が決まる',
  again: 'もう一度',
  back: '母船にもどる',
  best: (n: number) => `いちばん良い記録 ${'★'.repeat(n)}`,
}
