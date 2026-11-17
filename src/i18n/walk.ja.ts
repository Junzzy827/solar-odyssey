// components/walk/WalkView.tsx・state/walk.ts の文言（日本語）

export const walkJa = {
  park: '池のほとりの公園',
  gravity: '回転の遠心力で 1G',
  day: '昼',
  dusk: '夕方',
  night: '夜',
  backToShip: '船へもどる',
  view: '見方',
  viewChase: '後ろから',
  viewEye: '自分の目',
  sit: 'ベンチに座る',
  stand: '立つ',
  jump: 'ジャンプ',
  run: '走る',
  walkTo: (name: string) => `${name}に降りて歩く`,
  keysHint: 'W A S D 歩く・Shift 走る・スペース ジャンプ・マウス 見回す（クリックで固定）・ホイール 距離・E 座る・V 見方・J 船へ',
  arrived: (name: string) => `${name}の公園に降りました。見上げると、向こう側の大地が空の代わりに広がっています`,
}
