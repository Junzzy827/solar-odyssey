// 探査機の模型の画面（ui/ProbeCamPane.tsx）の文言（日本語）。字幕は2行まで

const planet: Record<string, string> = { earth: '地球', jupiter: '木星', saturn: '土星', uranus: '天王星', neptune: '海王星' }
const man = (km: number) => (km >= 1e8 ? `${(km / 1e8).toFixed(1)}億km` : km >= 1e4 ? `${Math.round(km / 1e4).toLocaleString('ja-JP')}万km` : `${Math.round(km).toLocaleString('ja-JP')}km`)
const kms = (v: number) => `秒速${v.toFixed(1)}km`

export const probeCamJa = {
  planet,
  distance: man,
  title: '探査機',
  speed: '太陽から見た速さ',
  speedValue: (v: number) => `${v.toFixed(1)} km/s`,
  toPlanet: (name: string, km: string) => `${name}まで ${km}`,
  fromEarth: (km: string, hours: string) => `地球から ${km}・電波で ${hours}`,
  lightTime: (minutes: number) => (minutes < 1 ? `${(minutes * 60).toFixed(1)}秒` : minutes < 60 ? `${Math.round(minutes)}分` : `${(minutes / 60).toFixed(1)}時間`),
  arrow: '速さの矢印',
  loading: '模型を読み込んでいます…',
  credit: '模型：NASA 3D Resources ／ 軌道：NASA JPL Horizons',
  dragHint: 'ドラッグで回して見られます',
  launch: {
    burnout: (v: number) => `打ち上げから約1時間。ロケットの最後の噴射を終え、地球から見て${kms(v)}で離れていきます。`,
    moon: (km: string) => `地球からもう${km}。月の軌道（約38万km）を、半日ほどで越えました。`,
    helio: (v: number) => `地球の公転の速さ（秒速30km）にロケットの速さが足され、太陽から見ると${kms(v)}で外へ向かいます。`,
  },
  flyby: (name: string, n: { speedBefore: number; speedAfter: number; relSpeed: number; turnPlanet: number; turnSun: number; altitudeKm: number; planetSpeed: number }) => {
    const change =
      n.speedAfter > n.speedBefore + 0.5
        ? `太陽から見ると、${kms(n.speedBefore)}から${kms(n.speedAfter)}に加速！ ${name}の動きを少しもらいました。これがスイングバイです。`
        : n.speedAfter < n.speedBefore - 0.5
          ? `太陽から見ると${kms(n.speedBefore)}から${kms(n.speedAfter)}に。向きを大きく変えるために、速さを少し${name}に返しました。`
          : `太陽から見た速さはほとんど同じで、進む向きだけが${Math.round(n.turnSun)}°変わりました。`
    return [
      `${name}へ近づいています。${name}の重力に引かれて、少しずつ速くなります。`,
      `${name}の重力で、進む向きがぐっと曲げられていきます（${name}から見て${Math.round(n.turnPlanet)}°）。`,
      `最接近！ ${name}の雲の上 約${man(n.altitudeKm)}を通過。`,
      `${name}から見ると、近づいたときと同じ${kms(n.relSpeed)}で離れていきます。でも${name}自身が、太陽のまわりを${kms(n.planetSpeed)}で動いています。`,
      change,
    ]
  },
  extra: {
    jupiter: '木星では、衛星イオの火山や、大赤斑の渦を撮影しました。',
    saturn: '土星の重力で、次の天王星へ向かう道にのりました。',
    uranus: '天王星は横倒しで回る惑星。近くで見た探査機は、今もボイジャー2号だけです。',
    neptune: '海王星の北極の上をかすめて、衛星トリトンへ。太陽系の面から南へ曲げられました。',
  } as Record<string, string>,
  cruise: [
    '大きなアンテナ（直径3.7m）を、いつも地球に向けて飛んでいます。',
    (km: string, t: string) => `地球から${km}。地球からの電波が届くのに${t}かかります。`,
    '電気は、原子力電池（RTG）で作っています。太陽から遠すぎて、太陽電池では足りないからです。',
    '金色のレコードには、地球の音楽や声、写真がのせてあります。いつか誰かに届くように。',
    'エンジンはほとんど使わず、惑星の重力を借りて次の惑星へ向かいます。',
  ],
  beyond: (v: number) => `今は太陽系の面の南へ、${kms(v)}で進み続けています。`,
}
