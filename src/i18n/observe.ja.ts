// state/observe.ts の文言（日本語）

export const observeJa = {
  tooFar: (name: string) => `${name}のそばで使えます（ワープか自動航行で近づいてから）`,
  noTarget: '目標を選んで、そばまで行くと使えます',
  insideStructure: '構造物の中では使えません',
  observing: (name: string) => `${name}の周辺観察を開始`,
  atPortEntrance: '港の入口に着きました。前進（W）で中へ入れます',
}
