// ui/ObservePanel.tsx の文言（日本語）

export const observePanelJa = {
  holdingStill: '止まって観察',
  lapTime: (clockwise: boolean, lap: number) => `${clockwise ? '右' : '左'}回り・1周 ${lap}秒`,
  observing: '周辺観察',
  headingToBerth: '着艦の位置へ移動中…',
  headingToPort: '港の入口へ移動中…',
  touchHint: 'スティック上下で距離・左右で回る速さ／なぞって位置と角度／上昇・下降で面を傾ける',
  keysHint: 'W/S 距離・A/D 回る速さと向き・Space/Shift 面を傾ける・マウスで位置と角度',
  cancelBerth: '着艦をやめる',
  cancelDock: '入港をやめる',
  berth: '着艦（ドックへ）',
  dock: '入港（港の入口へ）',
  stopObserving: '観察をやめる',
}
